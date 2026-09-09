import
{
  ProjectilePool,
  ROUND_SECONDS,
  sweptHit,
  MAX_ENEMY_SHOTS
}
from '../game.js';
import
{
  gunAimPoint
}
from '../gun-sight.js';

// Arcade tuning for the Maxim and infantry; positions and flight use metres.
export const TRENCH_GUN = Object.freeze(
{
  mass: .0113,
  diameter: .00792,
  bc: .48,
  speed: 740,
  range: 450,
  lifetime: 2
});
export const BELT_SIZE = 250;
export const RELOAD_TIME = 3.5;
export const BREACH_Z = -10;
export const MAX_INFANTRY = 96;
export const TRENCH_LEVELS = {
  relaxed:
  {
    speed: 3.5,
    group: 5,
    interval: 6.5,
    count: 40,
    breaches: 8
  },
  arcade:
  {
    speed: 4.2,
    group: 7,
    interval: 6,
    count: 64,
    breaches: 5
  },
  frenzy:
  {
    speed: 5.1,
    group: 9,
    interval: 5,
    count: 80,
    breaches: 3
  }
};
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const origin = {
  x: 0,
  y: 2.2,
  z: 5
};
export function trenchHeight(x, z)
{
  if (z > -18) return 0;
  return .22 * Math.sin(x * .11) * Math.sin(z * .065) + .15 * Math.sin(z * .19 + x * .07);
}
export class TrenchGame
{
  constructor(physics, random = Math.random, halfWidth = d => d * .5, muzzlePosition = () => (
  {
    x: .4,
    y: 1.8,
    z: 1
  }))
  {
    this.audioProfile = 'trench';
    this.random = random;
    this.halfWidth = halfWidth;
    this.muzzlePosition = muzzlePosition;
    this.projectiles = new ProjectilePool(physics,
    {
      ammo: TRENCH_GUN,
      speed: TRENCH_GUN.speed,
      range: TRENCH_GUN.range,
      lifetime: TRENCH_GUN.lifetime
    });
    this.nextId = 0;
    this.events = [];
    this.start('arcade');
    this.state = 'ready';
  }
  start(difficulty)
  {
    this.difficulty = TRENCH_LEVELS[difficulty] ? difficulty : 'arcade';
    this.tuning = TRENCH_LEVELS[this.difficulty];
    this.projectiles.clear();
    this.targets = [];
    this.bodies = [];
    this.enemyShots = [];
    this.artillery = [];
    this.missiles = [];
    this.flares = [];
    this.bombs = [];
    this.events.length = 0;
    this.time = 0;
    this.score = 0;
    this.destroyed = 0;
    this.allyKills = 0;
    this.artilleryKills = 0;
    this.hits = 0;
    this.shots = 0;
    this.breaches = 0;
    this.combo = 0;
    this.bestCombo = 0;
    this.lastKill = -10;
    this.heat = 0;
    this.overheated = false;
    this.spool = 0;
    this.shotClock = 0;
    this.belt = BELT_SIZE;
    this.reloadRemaining = 0;
    this.reloading = false;
    this.spawnClock = this.tuning.interval;
    this.artilleryClock = 3;
    this.endReason = null;
    this.state = 'playing';
    this.allies = [-1, 1].map((side, i) => (
    {
      id: 'ally' + i,
      position:
      {
        x: side * Math.min(7, this.halfWidth(17) * .7),
        y: 1.4,
        z: -11
      },
      clock: 1 + i * .7,
      flash: 0,
      burst: 0,
      targetId: null
    }));
    this.spawnGroup(this.tuning.group * 2, true);
  }
  get remaining()
  {
    return Math.max(0, ROUND_SECONDS - this.time);
  }
  get wave()
  {
    return Math.min(3, 1 + Math.floor(this.time / 100));
  }
  get healthPercent()
  {
    return Math.max(0, 100 * (1 - this.breaches / this.tuning.breaches));
  }
  get health()
  {
    return this.healthPercent;
  }
  get regenerating()
  {
    return false;
  }
  get accuracy()
  {
    return this.shots ? Math.round(100 * this.hits / this.shots) : 0;
  }
  get targetLimit()
  {
    return Math.min(MAX_INFANTRY, this.tuning.count + (this.wave - 1) * 8);
  }
  get nearestDistance()
  {
    return this.targets.length ? Math.max(0, Math.min(...this.targets.map(t => BREACH_Z - t.position.z))) : null;
  }
  spawnGroup(count, initial = false)
  {
    const center = (this.random() - .5) * 1.2;
    for (let i = 0; i < count && this.targets.length < this.targetLimit; i++)
    {
      const distance = (initial ? 170 : 210) + this.random() * 95;
      const x = clamp(center + (this.random() - .5) * .5, -.75, .75) * this.halfWidth(distance);
      const position = {
        x,
        y: trenchHeight(x, -distance) + 1,
        z: -distance
      };
      this.targets.push(
      {
        id: ++this.nextId,
        kind: 'infantry',
        alive: true,
        position,
        previous:
        {
          ...position
        },
        velocity:
        {
          x: 0,
          y: 0,
          z: 0
        },
        speed: this.tuning.speed * (.86 + this.random() * .28) * (1 + (this.wave - 1) * .08),
        lane: (this.random() - .5) * Math.min(9, this.halfWidth(20) * 1.3),
        phase: this.random() * Math.PI * 2,
        age: 0,
        radius: .58,
        health: 1,
        suppressed: 0,
        flash: 0
      });
    }
  }
  reload()
  {
    if (this.state !== 'playing' || this.reloadRemaining || this.belt === BELT_SIZE) return;
    this.reloadRemaining = RELOAD_TIME;
    this.reloading = true;
    this.spool = 0;
    this.shotClock = 0;
    this.events.push(
    {
      type: 'reload'
    });
  }
  stopTarget(target, source = 'player')
  {
    if (!target.alive) return;
    target.alive = false;
    target.fragment = source === 'artillery' ? target.id % 3 : -1;
    this.events.push(
    {
      type: 'blood',
      source,
      position:
      {
        ...target.position
      },
      velocity:
      {
        ...target.velocity
      }
    });
    this.bodies.push(
    {
      ...target,
      age: 0,
      position:
      {
        ...target.position
      },
      velocity:
      {
        ...target.velocity
      }
    });
    if (this.bodies.length > 36) this.bodies.shift();
    if (source === 'player')
    {
      this.destroyed++;
      this.combo = this.time - this.lastKill < 5 ? Math.min(5, this.combo + 1) : 1;
      this.bestCombo = Math.max(this.bestCombo, this.combo);
      this.lastKill = this.time;
      const points = 25 * this.combo;
      this.score += points;
      this.events.push(
      {
        type: 'destroyed',
        kind: 'infantry',
        position:
        {
          ...target.position
        },
        points
      });
    }
    else if (source === 'ally') this.allyKills++;
    else this.artilleryKills++;
  }
  gunLead(direction)
  {
    let best = null,
      alignment = .97;
    for (const t of this.targets)
    {
      const delta = {
        x: t.position.x - origin.x,
        y: t.position.y - origin.y,
        z: t.position.z - origin.z
      };
      const d = Math.hypot(delta.x, delta.y, delta.z);
      const dot = (delta.x * direction.x + delta.y * direction.y + delta.z * direction.z) / d;
      if (dot <= alignment) continue;
      const sight = gunAimPoint(t, this.projectiles.flightTable, TRENCH_GUN.range, origin);
      if (sight)
      {
        best = sight;
        alignment = dot;
      }
    }
    return best;
  }
  fire(direction)
  {
    const muzzle = this.muzzlePosition(0, direction);
    // Converge the off-centre muzzle onto the camera sight line at the aimed range.
    // This removes camera parallax without leading targets or correcting drop.
    let range = 150,
      alignment = .995;
    for (const target of this.targets)
    {
      const delta = {
        x: target.position.x - origin.x,
        y: target.position.y - origin.y,
        z: target.position.z - origin.z
      };
      const distance = Math.hypot(delta.x, delta.y, delta.z);
      const dot = (delta.x * direction.x + delta.y * direction.y + delta.z * direction.z) / distance;
      if (dot > alignment)
      {
        alignment = dot;
        range = distance;
      }
    }
    direction = {
      x: origin.x + direction.x * range - muzzle.x,
      y: origin.y + direction.y * range - muzzle.y,
      z: origin.z + direction.z * range - muzzle.z
    };
    const aimLength = Math.hypot(direction.x, direction.y, direction.z);
    for (const axis of ['x', 'y', 'z']) direction[axis] /= aimLength;
    const spread = .0025 + this.heat * .0025,
      angle = this.random() * Math.PI * 2,
      radius = Math.sqrt(this.random()) * spread;
    const rightLength = Math.hypot(direction.x, direction.z);
    const right = rightLength > 1e-6 ?
    {
      x: -direction.z / rightLength,
      y: 0,
      z: direction.x / rightLength
    } :
    {
      x: 1,
      y: 0,
      z: 0
    };
    const up = {
      x: -right.z * direction.y,
      y: right.z * direction.x - right.x * direction.z,
      z: right.x * direction.y
    };
    const shot = {};
    for (const axis of ['x', 'y', 'z']) shot[axis] = direction[axis] + radius * (Math.cos(angle) * right[axis] + Math.sin(angle) * up[axis]);
    const length = Math.hypot(shot.x, shot.y, shot.z);
    for (const axis of ['x', 'y', 'z']) shot[axis] /= length;
    if (!this.projectiles.fire(shot, muzzle, 0)) return;
    this.shots++;
    this.belt--;
    this.heat = Math.min(1, this.heat + .0032);
    this.events.push(
    {
      type: 'shot',
      barrel: 0
    });
    if (this.belt === 0) this.reload();
    if (this.heat >= 1) this.overheated = true;
  }
  advanceAllies(dt)
  {
    for (const ally of this.allies)
    {
      ally.flash = Math.max(0, ally.flash - dt);
      ally.clock -= dt;
      if (ally.clock > 0 || this.enemyShots.length >= MAX_ENEMY_SHOTS) continue;
      const candidates = this.targets.filter(t => t.alive && t.position.z > -180);
      const target = candidates.reduce((best, t) => !best || t.position.z > best.position.z ? t : best, null);
      if (!target)
      {
        ally.clock = .3;
        continue;
      }
      const distance = Math.hypot(target.position.x - ally.position.x, target.position.z - ally.position.z);
      const flight = distance / 620;
      const destination = {
        x: target.position.x + target.velocity.x * flight + (this.random() - .5) * 7,
        y: target.position.y + (this.random() - .5) * 1.2,
        z: target.position.z + target.velocity.z * flight
      };
      const velocity = {
        x: destination.x - ally.position.x,
        y: destination.y - ally.position.y,
        z: destination.z - ally.position.z
      };
      const length = Math.hypot(velocity.x, velocity.y, velocity.z);
      for (const axis of ['x', 'y', 'z']) velocity[axis] *= 620 / length;
      velocity.y += 4.905 * flight;
      this.enemyShots.push(
      {
        id: ++this.nextId,
        age: 0,
        launched: true,
        alive: true,
        position:
        {
          ...ally.position
        },
        previous:
        {
          ...ally.position
        },
        velocity
      });
      ally.flash = .07;
      ally.targetId = target.id;
      ally.burst++;
      if (ally.burst >= 3)
      {
        ally.burst = 0;
        ally.clock = 4.5 + this.random() * 2;
      }
      else ally.clock = .12;
      this.events.push(
      {
        type: 'allyShot',
        position:
        {
          ...ally.position
        }
      });
    }
    for (const shot of this.enemyShots)
    {
      Object.assign(shot.previous, shot.position);
      shot.age += dt;
      for (const axis of ['x', 'y', 'z']) shot.position[axis] += shot.velocity[axis] * dt;
      shot.velocity.y -= 9.81 * dt;
      let victim = null,
        first = Infinity;
      for (const target of this.targets)
        if (target.alive)
        {
          const t = sweptHit(shot.previous, shot.position, target.previous, target.position, target.radius);
          if (t !== null && t < first)
          {
            victim = target;
            first = t;
          }
        }
      if (victim)
      {
        this.stopTarget(victim, 'ally');
        shot.alive = false;
      }
      if (shot.age > 1.1 || shot.position.y < trenchHeight(shot.position.x, shot.position.z)) shot.alive = false;
    }
    this.enemyShots = this.enemyShots.filter(s => s.alive);
  }
  advanceArtillery(dt)
  {
    this.artilleryClock -= dt;
    if (this.artilleryClock <= 0 && this.artillery.length < 6)
    {
      const target = this.targets[Math.floor(this.random() * this.targets.length)];
      const impact = target && this.random() < .45 ?
      {
        x: target.position.x + (this.random() - .5) * 25,
        z: target.position.z + 8
      } :
      {
        x: (this.random() - .5) * 110,
        z: -28 - this.random() * 240
      };
      impact.y = trenchHeight(impact.x, impact.z);
      const start = {
        x: impact.x + (this.random() - .5) * 220,
        y: 90,
        z: impact.z - 180
      };
      this.artillery.push(
      {
        id: ++this.nextId,
        start,
        impact,
        position:
        {
          ...start
        },
        age: 0,
        duration: 2 + this.random() * 1.5
      });
      this.artilleryClock = 2.7 + this.random() * 2;
      this.events.push(
      {
        type: 'artilleryLaunch',
        position:
        {
          ...impact
        }
      });
    }
    for (const shell of this.artillery)
    {
      shell.age += dt;
      const t = Math.min(1, shell.age / shell.duration);
      for (const axis of ['x', 'y', 'z']) shell.position[axis] = shell.start[axis] + (shell.impact[axis] - shell.start[axis]) * t;
      shell.position.y += Math.sin(t * Math.PI) * 30;
      if (t < 1) continue;
      this.events.push(
      {
        type: 'artilleryImpact',
        position:
        {
          ...shell.impact
        }
      });
      for (const target of this.targets)
      {
        const distance = Math.hypot(target.position.x - shell.impact.x, target.position.z - shell.impact.z);
        if (distance < 6) this.stopTarget(target, 'artillery');
        else if (distance < 18) target.suppressed = 1.4;
      }
    }
    this.artillery = this.artillery.filter(s => s.age < s.duration);
  }
  update(dt, direction, firing)
  {
    if (this.state !== 'playing' || !Number.isFinite(dt) || dt <= 0) return;
    dt = Math.min(dt, this.remaining);
    this.time += dt;
    if (this.time - this.lastKill > 5) this.combo = 0;
    this.reloadRemaining = Math.max(0, this.reloadRemaining - dt);
    if (this.reloading && !this.reloadRemaining)
    {
      this.belt = BELT_SIZE;
      this.events.push(
      {
        type: 'reloaded'
      });
    }
    this.reloading = this.reloadRemaining > 0;
    const canFire = firing && !this.overheated && !this.reloadRemaining && this.belt > 0;
    this.spool = clamp(this.spool + (canFire ? 6 : -8) * dt, 0, 1);
    this.heat = Math.max(0, this.heat - (canFire ? .008 : .11) * dt);
    if (this.overheated && this.heat < .35) this.overheated = false;
    if (canFire)
    {
      this.shotClock += dt * 10 * this.spool;
      while (this.shotClock >= 1 && !this.reloadRemaining && !this.overheated)
      {
        this.shotClock--;
        this.fire(direction);
      }
    }
    else this.shotClock = 0;
    for (const target of this.targets)
    {
      Object.assign(target.previous, target.position);
      target.age += dt;
      target.suppressed = Math.max(0, target.suppressed - dt);
      const speed = target.speed * (target.suppressed ? .45 : 1);
      const desiredX = target.lane + Math.sin(target.age * 1.2 + target.phase) * Math.min(1.4, -target.position.z * .01);
      target.position.x += clamp(desiredX - target.position.x, -speed * .65 * dt, speed * .65 * dt);
      target.position.z += speed * dt;
      target.position.y = trenchHeight(target.position.x, target.position.z) + 1;
      for (const axis of ['x', 'y', 'z']) target.velocity[axis] = (target.position[axis] - target.previous[axis]) / dt;
    }
    this.projectiles.advance(dt);
    for (const shot of this.projectiles.slots)
    {
      if (!shot.alive) continue;
      let victim = null,
        first = Infinity;
      const ground = trenchHeight(shot.position.x, shot.position.z);
      for (const target of this.targets)
        if (target.alive)
        {
          const t = sweptHit(shot.previous, shot.position, target.previous, target.position, target.radius);
          if (t !== null && t < first)
          {
            victim = target;
            first = t;
          }
        }
      if (victim)
      {
        shot.alive = false;
        this.hits++;
        this.stopTarget(victim);
        this.events.push(
        {
          type: 'hit',
          position:
          {
            ...victim.position
          }
        });
      }
      else if (shot.position.y <= ground)
      {
        shot.alive = false;
        this.events.push(
        {
          type: 'groundHit',
          position:
          {
            x: shot.position.x,
            y: ground,
            z: shot.position.z
          }
        });
      }
      else if (shot.age > TRENCH_GUN.lifetime || Math.hypot(shot.position.x, shot.position.z) > TRENCH_GUN.range) shot.alive = false;
    }
    this.advanceAllies(dt);
    this.advanceArtillery(dt);
    for (const target of this.targets)
      if (target.alive && target.position.z >= BREACH_Z)
      {
        target.alive = false;
        this.breaches++;
        this.events.push(
        {
          type: 'breach',
          position:
          {
            ...target.position
          }
        });
        if (this.breaches >= this.tuning.breaches)
        {
          this.finish('overrun');
          return;
        }
      }
    this.targets = this.targets.filter(t => t.alive);
    for (const body of this.bodies) body.age += dt;
    this.bodies = this.bodies.filter(b => b.age < 12);
    this.spawnClock -= dt;
    if (this.spawnClock <= 0)
    {
      this.spawnGroup(this.tuning.group + (this.wave - 1) * 2);
      this.spawnClock = this.tuning.interval / (1 + (this.wave - 1) * .15);
    }
    if (this.remaining <= 0) this.finish('survived');
  }
  pause()
  {
    if (this.state === 'playing')
    {
      this.state = 'paused';
      this.spool = 0;
      this.shotClock = 0;
    }
  }
  resume()
  {
    if (this.state === 'paused') this.state = 'playing';
  }
  clearCombat()
  {
    this.projectiles.clear();
    this.enemyShots.length = 0;
    this.artillery.length = 0;
    this.spool = 0;
    for (const ally of this.allies) ally.flash = 0;
  }
  finish(reason)
  {
    if (this.state !== 'playing') return;
    this.state = 'ended';
    this.endReason = reason;
    this.clearCombat();
    this.events.push(
    {
      type: 'ended'
    });
  }
  stop()
  {
    if (!['playing', 'paused'].includes(this.state)) return;
    this.state = 'stopped';
    this.clearCombat();
    this.events.length = 0;
  }
  dispose()
  {
    this.projectiles.dispose();
    this.targets.length = 0;
    this.bodies.length = 0;
    this.enemyShots.length = 0;
    this.artillery.length = 0;
    this.events.length = 0;
  }
}