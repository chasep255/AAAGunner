import
{
  advanceBiplanes
}
from './biplanes.js';
import
{
  BattlefieldTerrain,
  TRENCH_CAMERA,
  ALLIED_POSITIONS
}
from './terrain.js';
export
{
  baseHeight as trenchHeight
}
from './terrain.js';
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
export const BREACH_Z = .8;
export const MAX_INFANTRY = 96;
export const TRENCH_LEVELS = {
  relaxed:
  {
    speed: 3.5,
    group: 6,
    interval: 6,
    count: 48,
    breaches: 8
  },
  arcade:
  {
    speed: 4.2,
    group: 9,
    interval: 5.3,
    count: 76,
    breaches: 5
  },
  frenzy:
  {
    speed: 5.1,
    group: 12,
    interval: 4.5,
    count: 96,
    breaches: 3
  }
};
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const origin = TRENCH_CAMERA;
export class TrenchGame
{
  constructor(physics, random = Math.random, halfWidth = d => d * .5, muzzlePosition = () => (
  {
    x: .4,
    y: .65,
    z: 3
  }), terrain = new BattlefieldTerrain())
  {
    this.terrain = terrain;
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
    this.terrain.reset();
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
    this.crewHealth = 75;
    this.lastHit = -10;
    this.suppression = 0;
    this.ducking = false;
    this.biplanes = [];
    this.aircraftKills = 0;
    this.raidClock = 38;
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
    this.killer = null;
    this.defeatAge = 0;
    this.resumeState = null;
    this.state = 'playing';
    this.allies = ALLIED_POSITIONS.map((position, i) => (
    {
      id: 'ally' + i,
      position:
      {
        ...position
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
    return Math.max(0, this.crewHealth / 75 * 100);
  }
  get health()
  {
    return this.crewHealth;
  }
  get regenerating()
  {
    return this.crewHealth < 75 && this.time - this.lastHit > 7;
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
        y: this.terrain.height(x, -distance) + 1,
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
        radius: .44,
        approachX: x,
        cover: null,
        coverRemaining: 0,
        tacticClock: .5 + this.random() * 2.5,
        dashRemaining: 0,
        health: 1,
        suppressed: 0,
        flash: 0,
        fireRemaining: 0,
        fireCooldown: .7 + this.random() * 3,
        rifleClock: 0
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
    for (const t of [...this.targets, ...this.biplanes])
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
    const spread = .0025 + this.heat * .0025 + this.suppression * .009,
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
  advanceInfantry(dt)
  {
    for (const target of this.targets)
    {
      Object.assign(target.previous, target.position);
      target.age += dt;
      target.suppressed = Math.max(0, target.suppressed - dt);
      target.dashRemaining = Math.max(0, target.dashRemaining - dt);
      target.tacticClock -= dt;
      if (target.coverRemaining > 0)
      {
        target.coverRemaining = Math.max(0, target.coverRemaining - dt);
        if (!target.coverRemaining)
        {
          target.cover = null;
          target.fireRemaining = 0;
          target.dashRemaining = 2 + this.random();
        }
      }
      if (!target.cover && target.tacticClock <= 0 && target.position.z < -35)
      {
        target.tacticClock = 5 + this.random() * 5;
        // Move in bounds between shell holes instead of funneling into one lane.
        const nearby = this.terrain.craters.filter(crater =>
          crater.z > target.position.z + 3 && crater.z < target.position.z + 32 &&
          Math.abs(crater.x - target.position.x) < 16 &&
          Math.abs(crater.x) < this.halfWidth(-crater.z) * .72);
        if (nearby.length && this.random() < .7)
        {
          const crater = nearby[Math.floor(this.random() * nearby.length)];
          target.cover = {
            x: crater.x,
            z: crater.z + crater.radius * .55
          };
          target.fireRemaining = 0;
        }
        target.dashRemaining = 1.5 + this.random() * 1.8;
      }
      const held = target.coverRemaining > 0 || target.fireRemaining > 0;
      const speed = held ? 0 : target.speed * (target.suppressed ? .65 : target.dashRemaining > 0 ? 1.35 : 1);
      const approach = clamp((-target.position.z - 18) / 190, 0, 1);
      const weave = Math.sin(target.age * .8 + target.phase) * Math.min(3.5, -target.position.z * .035);
      const desiredX = target.cover ? target.cover.x : target.lane + (target.approachX - target.lane) * approach + weave;
      const limit = Math.max(3, this.halfWidth(Math.max(6, -target.position.z)) * .78);
      target.position.x += clamp(clamp(desiredX, -limit, limit) - target.position.x, -speed * .8 * dt, speed * .8 * dt);
      target.position.z += target.cover ? clamp(target.cover.z - target.position.z, -speed * dt, speed * dt) : speed * dt;
      if (target.cover && !held && Math.hypot(target.cover.x - target.position.x, target.cover.z - target.position.z) < 1.1)
      {
        target.coverRemaining = 2 + this.random() * 2.5;
        target.fireCooldown = 0;
      }
      const crouched = target.fireRemaining > 0 || target.suppressed || target.coverRemaining > 0;
      const center = target.coverRemaining > 0 && target.fireRemaining <= 0 ? .52 : crouched ? .75 : 1;
      target.radius = center < .6 ? .28 : crouched ? .34 : .44;
      const height = this.terrain.height(target.position.x, target.position.z) + center;
      target.position.y += (height - target.position.y) * Math.min(1, dt * 10);
      for (const axis of ['x', 'y', 'z']) target.velocity[axis] = (target.position[axis] - target.previous[axis]) / dt;
    }
  }
  groundContact(start, end)
  {
    const steps = Math.max(1, Math.ceil(Math.hypot(end.x - start.x, end.y - start.y, end.z - start.z) / 1.5));
    for (let i = 1; i <= steps; i++)
    {
      const fraction = i / steps;
      const position = {};
      for (const axis of ['x', 'y', 'z']) position[axis] = start[axis] + (end[axis] - start[axis]) * fraction;
      if (position.y <= this.terrain.height(position.x, position.z)) return {
        fraction,
        position
      };
    }
    return null;
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
        side: 'friendly',
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
  }
  advanceRounds(dt)
  {
    for (const shot of this.enemyShots)
    {
      Object.assign(shot.previous, shot.position);
      shot.age += dt;
      for (const axis of ['x', 'y', 'z']) shot.position[axis] += shot.velocity[axis] * dt;
      shot.velocity.y -= 9.81 * dt;
      const ground = this.groundContact(shot.previous, shot.position);
      let victim = null,
        first = ground?.fraction ?? Infinity;
      for (const target of this.targets)
        if (shot.side !== 'enemy' && target.alive)
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
      if (shot.side === 'enemy')
      {
        // Sandbags and the earth lip protect low rounds; the sight opening is exposed.
        if (shot.previous.z < .8 && shot.position.z >= .8)
        {
          const t = (.8 - shot.previous.z) / (shot.position.z - shot.previous.z);
          const x = shot.previous.x + (shot.position.x - shot.previous.x) * t;
          const y = shot.previous.y + (shot.position.y - shot.previous.y) * t;
          if (Math.abs(x) < 27 && y < .48)
          {
            shot.alive = false;
            this.events.push(
            {
              type: 'groundHit',
              position:
              {
                x,
                y,
                z: .8
              }
            });
          }
        }
        const player = {
          x: origin.x,
          y: origin.y - (this.ducking ? .78 : 0),
          z: origin.z
        };
        const playerHit = sweptHit(shot.previous, shot.position, player, player, .34);
        if (shot.alive && playerHit !== null && playerHit < first)
        {
          this.crewHealth = Math.max(0, this.crewHealth - shot.damage);
          this.lastHit = this.time;
          this.suppression = Math.min(1, this.suppression + .4);
          shot.alive = false;
          this.events.push(
          {
            type: 'rifleHit',
            position:
            {
              ...player
            }
          });
        }
        if (shot.alive && !shot.passed && shot.previous.z < origin.z && shot.position.z >= origin.z)
        {
          shot.passed = true;
          const t = (origin.z - shot.previous.z) / (shot.position.z - shot.previous.z);
          const x = shot.previous.x + (shot.position.x - shot.previous.x) * t,
            y = shot.previous.y + (shot.position.y - shot.previous.y) * t;
          if (Math.hypot(x - origin.x, y - origin.y) < 3.4)
          {
            this.suppression = Math.min(1, this.suppression + (this.ducking ? .04 : .18));
            this.events.push(
            {
              type: 'nearMiss',
              position:
              {
                x,
                y,
                z: origin.z
              }
            });
          }
        }
      }
      if (shot.age > 1.3 || ground) shot.alive = false;
    }
    this.enemyShots = this.enemyShots.filter(s => s.alive);
  }
  advanceRiflemen(dt)
  {
    let active = this.targets.filter(t => t.alive && t.fireRemaining > 0).length;
    const limit = this.difficulty === 'relaxed' ? 3 : this.difficulty === 'frenzy' ? 7 : 5;
    for (const target of this.targets)
    {
      target.flash = Math.max(0, target.flash - dt);
      target.fireCooldown -= dt;
      const visible = Math.abs(target.position.x) < this.halfWidth(-target.position.z) * .76;
      if (!target.alive || target.suppressed || !visible || target.cover && !target.coverRemaining)
      {
        target.fireRemaining = 0;
        continue;
      }
      if (target.fireRemaining <= 0 && active < limit && target.fireCooldown <= 0 && target.position.z > -245 && target.position.z < -22)
      {
        target.fireRemaining = 3.5 + this.random() * 2.5;
        target.rifleClock = .6 + this.random() * .5;
        target.fireCooldown = 6 + this.random() * 6;
        active++;
      }
      if (target.fireRemaining <= 0) continue;
      target.fireRemaining = Math.max(0, target.fireRemaining - dt);
      target.rifleClock -= dt;
      if (target.rifleClock > 0 || this.enemyShots.length >= MAX_ENEMY_SHOTS) continue;
      target.rifleClock = 1.5 + this.random() * .8;
      const start = {
        x: target.position.x,
        y: this.terrain.height(target.position.x, target.position.z) + 1,
        z: target.position.z + .35
      };
      const distance = Math.hypot(origin.x - start.x, origin.z - start.z);
      const spread = (this.difficulty === 'relaxed' ? 4 : this.difficulty === 'frenzy' ? 2.8 : 3.2) * clamp(distance / 160, .45, 1.6);
      const aim = {
        x: origin.x + (this.random() - .5) * spread,
        y: origin.y + (this.random() - .5) * spread * .58,
        z: origin.z
      };
      const velocity = {
        x: aim.x - start.x,
        y: aim.y - start.y,
        z: aim.z - start.z
      };
      const length = Math.hypot(velocity.x, velocity.y, velocity.z);
      for (const axis of ['x', 'y', 'z']) velocity[axis] *= 560 / length;
      velocity.y += 4.905 * distance / 560;
      this.enemyShots.push(
      {
        id: ++this.nextId,
        age: 0,
        alive: true,
        launched: true,
        side: 'enemy',
        source: 'rifle',
        damage: this.difficulty === 'relaxed' ? 7 : 9,
        position: start,
        previous:
        {
          ...start
        },
        velocity
      });
      target.flash = .12;
      this.events.push(
      {
        type: 'rifleShot',
        position:
        {
          ...start
        }
      });
    }
  }
  advanceArtillery(dt)
  {
    this.artilleryClock -= dt;
    if (this.artilleryClock <= 0 && this.artillery.length < 6)
    {
      const candidates = this.targets.filter(target => target.alive && target.position.z < -48);
      let target = null,
        priority = -Infinity;
      for (const candidate of candidates)
      {
        const neighbors = candidates.filter(other => Math.hypot(other.position.x - candidate.position.x, other.position.z - candidate.position.z) < 18).length;
        const score = neighbors + (320 + candidate.position.z) / 160 + this.random() * 2;
        if (score > priority)
        {
          priority = score;
          target = candidate;
        }
      }
      const duration = 3.1 + this.random() * .8;
      const impact = target ?
      {
        x: target.position.x + target.velocity.x * duration * .65 + (this.random() - .5) * 18,
        z: Math.min(-45, target.position.z + target.velocity.z * duration * .65 + (this.random() - .5) * 20)
      } :
      {
        x: (this.random() - .5) * 90,
        z: -140 - this.random() * 140
      };
      impact.y = this.terrain.height(impact.x, impact.z);
      const start = {
        x: (this.random() - .5) * 65,
        y: 9,
        z: 120
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
        duration,
        friendly: true
      });
      this.artilleryClock = 5.2 + this.random() * 2.8;
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
      shell.position.y += Math.sin(t * Math.PI) * 110;
      if (t < 1) continue;
      const crater = this.terrain.crater(shell.impact.x, shell.impact.z, 5 + this.random(), 1.05 + this.random() * .3);
      this.events.push(
      {
        type: 'artilleryImpact',
        crater,
        friendly: true,
        position:
        {
          ...shell.impact
        }
      });
      for (const target of this.targets)
      {
        const distance = Math.hypot(target.position.x - shell.impact.x, target.position.z - shell.impact.z);
        if (distance < (target.coverRemaining > 0 ? 3.5 : 7)) this.stopTarget(target, 'artillery');
        else if (distance < 20) target.suppressed = 2.2;
      }
    }
    this.artillery = this.artillery.filter(s => s.age < s.duration);
  }
  update(dt, direction, firing)
  {
    if (!Number.isFinite(dt) || dt <= 0) return;
    if (this.state === 'overrun')
    {
      const previous = this.defeatAge;
      this.defeatAge += dt;
      const approach = Math.min(1, this.defeatAge / 1.05);
      const ease = approach * approach * (3 - 2 * approach);
      this.killer.position.x = this.killer.start.x * (1 - ease);
      this.killer.position.z = this.killer.start.z + (4.45 - this.killer.start.z) * ease;
      this.killer.position.y = 1 - .75 * ease + Math.sin(approach * Math.PI) * .7;
      this.killer.thrust = Math.max(0, Math.sin(Math.min(1, Math.max(0, (this.defeatAge - 1.05) / .45)) * Math.PI));
      this.killer.age = this.defeatAge;
      if (previous < 1.24 && this.defeatAge >= 1.24) this.events.push(
      {
        type: 'bayonetHit'
      });
      if (this.defeatAge >= 2.15) this.finish('overrun');
      return;
    }
    if (this.state !== 'playing') return;
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
    this.suppression = Math.max(0, this.suppression - (this.ducking ? .42 : .16) * dt);
    if (this.regenerating) this.crewHealth = Math.min(75, this.crewHealth + dt * 2);
    const canFire = firing && !this.ducking && !this.overheated && !this.reloadRemaining && this.belt > 0;
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
    this.advanceInfantry(dt);
    advanceBiplanes(this, dt);
    this.projectiles.advance(dt);
    for (const shot of this.projectiles.slots)
    {
      if (!shot.alive) continue;
      const ground = this.groundContact(shot.previous, shot.position);
      let victim = null,
        first = ground?.fraction ?? Infinity;
      for (const target of [...this.targets, ...this.biplanes])
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
        if (victim.kind === 'biplane')
        {
          victim.health--;
          if (victim.health <= 0)
          {
            victim.alive = false;
            this.aircraftKills++;
            this.score += 150;
            this.events.push(
            {
              type: 'destroyed',
              kind: 'biplane',
              position:
              {
                ...victim.position
              },
              velocity:
              {
                ...victim.velocity
              },
              points: 150
            });
          }
        }
        else this.stopTarget(victim);
        this.events.push(
        {
          type: 'hit',
          position:
          {
            ...victim.position
          }
        });
      }
      else if (ground)
      {
        shot.alive = false;
        this.events.push(
        {
          type: 'groundHit',
          position:
          {
            ...ground.position
          }
        });
      }
      else if (shot.age > TRENCH_GUN.lifetime || Math.hypot(shot.position.x, shot.position.z) > TRENCH_GUN.range) shot.alive = false;
    }
    this.advanceAllies(dt);
    this.advanceRiflemen(dt);
    this.advanceRounds(dt);
    this.advanceArtillery(dt);
    if (this.crewHealth <= 0)
    {
      this.finish('killed');
      return;
    }
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
          this.beginOverrun(target);
          return;
        }
      }
    this.targets = this.targets.filter(t => t.alive);
    for (const body of this.bodies)
    {
      body.age += dt;
      body.position.y += (this.terrain.height(body.position.x, body.position.z) + 1 - body.position.y) * Math.min(1, dt * 8);
    }
    this.bodies = this.bodies.filter(b => b.age < 12);
    this.spawnClock -= dt;
    if (this.spawnClock <= 0)
    {
      this.spawnGroup(this.tuning.group + (this.wave - 1) * 2);
      this.spawnClock = this.tuning.interval / (1 + (this.wave - 1) * .15);
    }
    if (this.remaining <= 0) this.finish('survived');
  }
  beginOverrun(target)
  {
    this.clearCombat();
    this.state = 'overrun';
    this.defeatAge = 0;
    this.killer = {
      ...target,
      alive: true,
      cinematic: true,
      start:
      {
        ...target.position
      },
      position:
      {
        ...target.position
      },
      velocity:
      {
        x: 0,
        y: 0,
        z: 1
      },
      age: 0,
      thrust: 0
    };
    this.targets = this.targets.filter(item => item.id !== target.id);
    this.events.push(
    {
      type: 'overrun'
    });
  }
  pause()
  {
    if (this.state === 'playing' || this.state === 'overrun')
    {
      this.resumeState = this.state;
      this.state = 'paused';
      this.spool = 0;
      this.shotClock = 0;
    }
  }
  resume()
  {
    if (this.state === 'paused') this.state = this.resumeState || 'playing';
  }
  clearCombat()
  {
    this.projectiles.clear();
    this.enemyShots.length = 0;
    this.artillery.length = 0;
    this.ducking = false;
    this.spool = 0;
    for (const ally of this.allies) ally.flash = 0;
  }
  finish(reason)
  {
    if (!['playing', 'overrun'].includes(this.state)) return;
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
    if (!['playing', 'paused', 'overrun'].includes(this.state)) return;
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
    this.biplanes.length = 0;
    this.events.length = 0;
  }
}