// Arcade tuning only: these deliberately slow, oversized projectiles and targets do
// not represent any real gun or aircraft. Positions are metres; +Y is up, forward is −Z.
export const ROUND_SECONDS = 90;
export const STEP = 1 / 60;
export const MAX_SHOTS = 160;
export const MAX_ENEMY_SHOTS = 128;
export const MAX_HEALTH = 100;
export const REGEN_DELAY = 3;
export const REGEN_RATE = 9;
export const MISSILE_RELOAD = 3;
export const MISSILE_MAGAZINE = 5;
export const MAX_MISSILES = MISSILE_MAGAZINE + Math.ceil(ROUND_SECONDS / MISSILE_RELOAD);
export const MISSILE_RANGE = 4000;

export function surfaceHeight(x, z)
{
  if (x * x + (z - 12) * (z - 12) <= 28 * 28) return 3;
  if (Math.abs(x) > 1500 || z < -2250 || z > -450) return -4;
  const localZ = z + 1350;
  const ridge = 80 + Math.sin(x * .004 + 2) * 45 + Math.sin(x * .011) * 20;
  const height = Math.max(0, 1 - Math.abs(localZ + 130 + Math.sin(x * .003) * 170) / 600) * ridge;
  const detail = Math.sin(x * .037) * Math.cos(localZ * .027) * 6 + Math.sin(x * .081 + localZ * .047) * 2;
  return Math.max(-4, height + detail - 17);
}

// Smooth Catmull-Rom routes, sampled by distance so aircraft do not speed up at bends.
function makeRoute(points)
{
  const samples = [];
  let distance = 0;
  for (let segment = 0; segment < points.length - 1; segment++)
  {
    const a = points[Math.max(0, segment - 1)],
      b = points[segment],
      c = points[segment + 1],
      d = points[Math.min(points.length - 1, segment + 2)];
    for (let i = segment ? 1 : 0; i <= 40; i++)
    {
      const t = i / 40,
        t2 = t * t,
        t3 = t2 * t;
      const point = {};
      for (const axis of ['x', 'y', 'z']) point[axis] = .5 * ((2 * b[axis]) + (-a[axis] + c[axis]) * t + (2 * a[axis] - 5 * b[axis] + 4 * c[axis] - d[axis]) * t2 + (-a[axis] + 3 * b[axis] - 3 * c[axis] + d[axis]) * t3);
      const previous = samples.at(-1);
      if (previous) distance += Math.hypot(point.x - previous.x, point.y - previous.y, point.z - previous.z);
      samples.push(
      {
        ...point,
        distance
      });
    }
  }
  return samples;
}
export const DIFFICULTIES = {
  relaxed:
  {
    speed: 0.72,
    interval: 4.2,
    count: 3,
    radius: 1.3,
    damage: 5,
    burst: 2,
    flares: 0.25
  },
  arcade:
  {
    speed: 1,
    interval: 3.2,
    count: 4,
    radius: 1,
    damage: 7,
    burst: 2,
    flares: 0.5
  },
  frenzy:
  {
    speed: 1.3,
    interval: 2.2,
    count: 6,
    radius: 0.9,
    damage: 8,
    burst: 3,
    flares: 0.7
  }
};

// Sweep in relative motion so fast projectiles cannot tunnel through moving targets.
// Returns the earliest contact within the step, or null.
export function sweptHit(a, b, targetA, targetB, radius)
{
  const x = a.x - targetA.x,
    y = a.y - targetA.y,
    z = a.z - targetA.z;
  const dx = b.x - a.x - (targetB.x - targetA.x);
  const dy = b.y - a.y - (targetB.y - targetA.y);
  const dz = b.z - a.z - (targetB.z - targetA.z);
  const c = x * x + y * y + z * z - radius * radius;
  if (c <= 0) return 0;
  const aa = dx * dx + dy * dy + dz * dz;
  if (aa < 1e-12) return null;
  const bb = 2 * (x * dx + y * dy + z * dz);
  const discriminant = bb * bb - 4 * aa * c;
  if (discriminant < 0) return null;
  const t = (-bb - Math.sqrt(discriminant)) / (2 * aa);
  return t >= 0 && t <= 1 ? t : null;
}

class ProjectilePool
{
  constructor(physics)
  {
    this.physics = physics;
    this.slots = [];
    this.base = new physics.Bullet(0.004, 0.006, 0.018, 0.16, physics.DragFunction.G1);
    this.atmosphere = new physics.Atmosphere();
    this.launchPosition = new physics.Vector3D(0, 8, 0);
    this.launchVelocity = new physics.Vector3D(0, 0, 0);
  }

  fire(direction)
  {
    const physics = this.physics;
    let projectile = this.slots.find(item => !item.alive);
    if (!projectile)
    {
      if (this.slots.length >= MAX_SHOTS) return false;
      const simulator = new physics.BallisticsSimulator();
      simulator.setAtmosphere(this.atmosphere);
      projectile = {
        simulator,
        trajectory: simulator.getTrajectory(),
        position:
        {},
        previous:
        {},
        alive: false
      };
      this.slots.push(projectile);
    }
    // Fictional rounds retain the gravity and drag integration.
    const speed = 220;
    this.launchVelocity.x = direction.x * speed;
    this.launchVelocity.y = direction.y * speed;
    this.launchVelocity.z = direction.z * speed;
    const initial = new physics.Bullet(this.base, this.launchPosition, this.launchVelocity, 0);
    try
    {
      projectile.simulator.setInitialBullet(initial);
    }
    finally
    {
      initial.delete();
    }
    Object.assign(projectile.position,
    {
      x: 0,
      y: 8,
      z: 0
    });
    Object.assign(projectile.previous, projectile.position);
    projectile.age = 0;
    projectile.alive = true;
    return true;
  }

  advance(dt)
  {
    for (const projectile of this.slots)
    {
      if (!projectile.alive) continue;
      Object.assign(projectile.previous, projectile.position);
      projectile.simulator.simulate(1100, dt, dt);
      const state = projectile.simulator.getCurrentBullet();
      const position = state.getPosition();
      projectile.position.x = position.x;
      projectile.position.y = position.y;
      projectile.position.z = position.z;
      position.delete();
      state.delete();
      // Only the current step is needed. Keep memory bounded during long bursts.
      projectile.trajectory.clear();
      projectile.age += dt;
      if (projectile.age > 4 || projectile.position.y < -2 || !Number.isFinite(projectile.position.x + projectile.position.y + projectile.position.z)) projectile.alive = false;
    }
  }

  clear()
  {
    for (const projectile of this.slots)
    {
      projectile.alive = false;
      projectile.trajectory.clear();
    }
  }

  dispose()
  {
    for (const projectile of this.slots) projectile.simulator.delete();
    this.slots.length = 0;
    this.base.delete();
    this.atmosphere.delete();
    this.launchPosition.delete();
    this.launchVelocity.delete();
  }
}

export class ArcadeGame
{
  constructor(physics, random = Math.random)
  {
    this.physics = physics;
    this.random = random;
    this.projectiles = new ProjectilePool(physics);
    this.nextId = 0;
    this.events = [];
    this.start('arcade');
    this.state = 'ready';
  }

  start(difficulty)
  {
    this.difficulty = DIFFICULTIES[difficulty] ? difficulty : 'arcade';
    this.tuning = DIFFICULTIES[this.difficulty];
    this.projectiles.clear();
    this.targets = [];
    this.enemyShots = [];
    this.missiles = [];
    this.flares = [];
    this.missileCooldown = 0;
    this.missileAmmo = MISSILE_MAGAZINE;
    this.missilesFired = 0;
    this.events.length = 0;
    this.time = 0;
    this.health = MAX_HEALTH;
    this.lastDamage = -REGEN_DELAY;
    this.endReason = null;
    this.score = 0;
    this.hits = 0;
    this.shots = 0;
    this.destroyed = 0;
    this.escaped = 0;
    this.combo = 0;
    this.bestCombo = 0;
    this.lastKill = -100;
    this.heat = 0;
    this.overheated = false;
    this.spool = 0;
    this.shotClock = 0;
    this.spawnClock = this.tuning.interval;
    this.spawnSector = 0;
    this.state = 'playing';
    this.spawnTarget(undefined, 'wing', undefined, 'cross');
    this.spawnTarget(undefined, 'light', undefined, 'swoop');
    this.spawnTarget(undefined, 'wing', undefined, 'sweep');
  }

  get remaining()
  {
    return Math.max(0, ROUND_SECONDS - this.time);
  }
  get wave()
  {
    return 1 + Math.floor(this.time / 30);
  }
  get accuracy()
  {
    return this.shots ? Math.round(100 * this.hits / this.shots) : 0;
  }
  get regenerating()
  {
    return this.state === 'playing' && this.health < MAX_HEALTH && this.time - this.lastDamage >= REGEN_DELAY;
  }

  spawnTarget(initialX, initialKind, initialZ, initialPath)
  {
    const rand = this.random;
    const kind = initialKind ?? (rand() < 0.5 ? 'wing' : 'light');
    const sector = [-1, 0, 1][this.spawnSector++ % 3];
    const distance = 2500 + rand() * 1500;
    const bearing = sector * (0.5 + rand() * 0.4) + (rand() - 0.5) * 0.12;
    const z = initialZ ?? -Math.cos(bearing) * distance;
    const y = 220 + rand() * 300;
    const x = initialX ?? Math.sin(bearing) * distance;
    const path = initialPath ?? ['weave', 'cross', 'sweep', 'swoop'][Math.floor(rand() * 4)];
    const side = rand() < .5 ? -1 : 1;
    const bend = path === 'cross' ? -Math.sign(x || side) : side;
    const position = {
      x,
      y,
      z
    };
    const route = makeRoute([
      position,
      {
        x: x * .65 + (path === 'sweep' ? side * 90 : 0),
        y: y * .85 + (path === 'swoop' ? 35 : 0),
        z: z * .7
      },
      {
        x: bend * (path === 'weave' ? 65 : 100),
        y: 55 + rand() * 25,
        z: -260
      },
      {
        x: -bend * 18,
        y: 28 + rand() * 8,
        z: -95
      },
      {
        x: side * 100,
        y: 75,
        z: 90
      },
      {
        x: side * 360,
        y: 230,
        z: 370
      }
    ]);
    const first = route[1];
    const heading = Math.atan2(-(first.x - x), -(first.z - z));
    const target = {
      id: ++this.nextId,
      kind,
      path,
      age: 0,
      phase: rand() * Math.PI * 2,
      speed: (95 + rand() * 25) * this.tuning.speed * (1 + (this.wave - 1) * .15),
      route,
      routeDistance: 0,
      routeIndex: 1,
      evasion: 0,
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
      heading,
      pitch: 0,
      bank: 0,
      radius: 8 * this.tuning.radius,
      attacks: 0,
      attackClock: 0,
      muzzleFlash: 0,
      flareCooldown: 0,
      health: kind === 'wing' ? 3 : 2,
      flash: 0,
      alive: true
    };
    this.targets.push(target);
  }

  moveTarget(target, dt, firing)
  {
    if (dt <= 0) return;
    Object.assign(target.previous, target.position);
    target.age += dt;
    const threatened = firing || this.missiles.some(missile => missile.targetId === target.id);
    target.evasion += ((threatened ? 1 : 0) - target.evasion) * (1 - Math.exp(-dt * .8));
    target.routeDistance = Math.min(target.route.at(-1).distance, target.routeDistance + target.speed * dt);
    while (target.routeIndex < target.route.length - 1 && target.route[target.routeIndex].distance < target.routeDistance) target.routeIndex++;
    const a = target.route[target.routeIndex - 1],
      b = target.route[target.routeIndex];
    const t = (target.routeDistance - a.distance) / Math.max(.001, b.distance - a.distance);
    for (const axis of ['x', 'y', 'z']) target.position[axis] = a[axis] + (b[axis] - a[axis]) * t;
    target.position.x += Math.sin(target.age * .45 + target.phase) * target.evasion * 10;
    for (const axis of ['x', 'y', 'z']) target.velocity[axis] = (target.position[axis] - target.previous[axis]) / dt;
    const heading = Math.atan2(-target.velocity.x, -target.velocity.z);
    const turn = Math.atan2(Math.sin(heading - target.heading), Math.cos(heading - target.heading));
    const roll = Math.max(-.75, Math.min(.75, turn / dt * 2));
    target.bank += (roll - target.bank) * (1 - Math.exp(-dt * 3));
    target.heading += turn;
    const pitch = Math.atan2(target.velocity.y, Math.hypot(target.velocity.x, target.velocity.z));
    target.pitch += (pitch - target.pitch) * (1 - Math.exp(-dt * 5));
    target.flash = Math.max(0, target.flash - dt);
    target.muzzleFlash = Math.max(0, target.muzzleFlash - dt);
    target.flareCooldown = Math.max(0, target.flareCooldown - dt);
  }

  missileTarget(direction)
  {
    let best = null,
      alignment = 0.965;
    for (const target of this.targets)
    {
      if (!target.alive || target.position.z > -30) continue;
      const
      {
        x,
        z
      } = target.position, y = target.position.y - 8;
      const dot = (x * direction.x + y * direction.y + z * direction.z) / Math.hypot(x, y, z);
      if (dot > alignment)
      {
        best = target;
        alignment = dot;
      }
    }
    return best;
  }

  fireMissile(direction)
  {
    if (this.state !== 'playing' || this.missileAmmo <= 0 || this.missiles.length >= MAX_MISSILES) return false;
    const target = this.missileTarget(direction);
    this.missiles.push(
    {
      position:
      {
        x: 0,
        y: 8,
        z: 0
      },
      previous:
      {
        x: 0,
        y: 8,
        z: 0
      },
      direction:
      {
        x: direction.x,
        y: direction.y,
        z: direction.z
      },
      targetId: target?.id ?? null,
      decoyId: null,
      flareChecked: false,
      age: 0,
      alive: true
    });
    if (this.missileAmmo === MISSILE_MAGAZINE) this.missileCooldown = MISSILE_RELOAD;
    this.missileAmmo--;
    this.missilesFired++;
    this.events.push(
    {
      type: 'missile'
    });
    return true;
  }

  destroyTarget(target)
  {
    if (!target.alive) return;
    target.alive = false;
    this.destroyed++;
    this.combo = Math.min(5, this.combo + 1);
    this.bestCombo = Math.max(this.bestCombo, this.combo);
    this.lastKill = this.time;
    const points = (target.kind === 'wing' ? 150 : 100) * this.combo;
    this.score += points;
    this.events.push(
    {
      type: 'destroyed',
      velocity:
      {
        ...target.velocity
      },
      position:
      {
        ...target.position
      },
      points
    });
  }

  advanceMissiles(dt)
  {
    for (const flare of this.flares)
    {
      Object.assign(flare.previous, flare.position);
      flare.age += dt;
      flare.position.x += flare.drift * dt;
      flare.position.y -= 10 * dt;
      flare.position.z -= 12 * dt;
    }
    this.flares = this.flares.filter(flare => flare.age < 3);
    for (const missile of this.missiles)
    {
      missile.age += dt;
      Object.assign(missile.previous, missile.position);
      const target = this.targets.find(item => item.id === missile.targetId && item.alive);
      if (target && !missile.flareChecked && Math.hypot(target.position.x - missile.position.x, target.position.y - missile.position.y, target.position.z - missile.position.z) < 150)
      {
        missile.flareChecked = true;
        if (target.flareCooldown === 0 && this.random() < this.tuning.flares)
        {
          const flare = {
            id: ++this.nextId,
            position:
            {
              ...target.position
            },
            previous:
            {
              ...target.position
            },
            age: 0,
            drift: this.random() < 0.5 ? -27 : 27
          };
          this.flares.push(flare);
          target.flareCooldown = 5;
          missile.decoyId = flare.id;
          this.events.push(
          {
            type: 'flare',
            position:
            {
              ...flare.position
            }
          });
        }
      }
      const decoy = this.flares.find(item => item.id === missile.decoyId);
      const destination = missile.decoyId !== null ? decoy?.position : target?.position;
      if (destination)
      {
        const dx = destination.x - missile.position.x,
          dy = destination.y - missile.position.y,
          dz = destination.z - missile.position.z;
        const distance = Math.hypot(dx, dy, dz);
        if (distance > 0)
        {
          // Simple game steering with limited agility lets a weaving plane escape.
          const turn = Math.min(1, dt * 2.4);
          missile.direction.x += (dx / distance - missile.direction.x) * turn;
          missile.direction.y += (dy / distance - missile.direction.y) * turn;
          missile.direction.z += (dz / distance - missile.direction.z) * turn;
          const length = Math.hypot(missile.direction.x, missile.direction.y, missile.direction.z);
          if (length > 0)
            for (const axis of ['x', 'y', 'z']) missile.direction[axis] /= length;
        }
      }
      for (const axis of ['x', 'y', 'z']) missile.position[axis] += missile.direction[axis] * 145 * dt;
      if (decoy && sweptHit(missile.previous, missile.position, decoy.previous, decoy.position, 8) !== null)
      {
        missile.alive = false;
        this.events.push(
        {
          type: 'decoyed',
          position:
          {
            ...missile.position
          }
        });
      }
      else
      {
        let victim = null,
          contact = Infinity;
        for (const aircraft of this.targets)
        {
          if (!aircraft.alive) continue;
          const t = sweptHit(missile.previous, missile.position, aircraft.previous, aircraft.position, aircraft.radius);
          if (t !== null && t < contact)
          {
            victim = aircraft;
            contact = t;
          }
        }
        if (victim)
        {
          missile.alive = false;
          this.destroyTarget(victim);
        }
      }
      if (missile.alive && missile.position.y <= surfaceHeight(missile.position.x, missile.position.z))
      {
        missile.alive = false;
        this.events.push(
        {
          type: 'missileImpact',
          position:
          {
            ...missile.position
          }
        });
      }
      if (Math.hypot(missile.position.x, missile.position.y - 8, missile.position.z) > MISSILE_RANGE) missile.alive = false;
    }
    this.missiles = this.missiles.filter(missile => missile.alive);
  }

  attack(target)
  {
    const count = 12;
    if (this.enemyShots.length + count > MAX_ENEMY_SHOTS) return;
    const origin = {
      ...target.position
    };
    origin.x += target.attacks % 2 ? -5 : 5;
    for (let i = 0; i < count; i++) this.enemyShots.push(
    {
      sourceId: target.id,
      launched: false,
      wing: i % 2 ? -5 : 5,
      origin,
      impact:
      {
        x: (i % 2 ? -1 : 1) * (5 + this.random() * 9),
        y: 6 + this.random() * 2,
        z: -18 - this.random() * 8
      },
      position:
      {
        ...origin
      },
      previous:
      {
        ...origin
      },
      age: -i * 0.075,
      duration: 0,
      velocity:
      {
        x: 0,
        y: 0,
        z: 0
      },
      damage: this.tuning.damage / count
    });
    target.attacks++;
    target.attackClock = .9;
    target.muzzleFlash = 1.05;
    this.events.push(
    {
      type: 'incoming',
      position:
      {
        ...target.position
      }
    });
  }

  takeDamage(amount, position = null)
  {
    if (this.state !== 'playing' || !Number.isFinite(amount) || amount <= 0) return;
    this.health = Math.max(0, this.health - amount);
    this.lastDamage = this.time;
    this.events.push(
    {
      type: 'damage',
      position
    });
    if (this.health === 0) this.finish('defeated');
  }

  finish(reason)
  {
    if (this.state !== 'playing') return;
    this.state = 'ended';
    this.endReason = reason;
    this.spool = 0;
    this.projectiles.clear();
    this.enemyShots.length = 0;
    this.missiles.length = 0;
    this.flares.length = 0;
    this.events.push(
    {
      type: 'ended'
    });
  }

  pause()
  {
    if (this.state !== 'playing') return;
    this.state = 'paused';
    this.spool = 0;
    this.shotClock = 0;
  }

  stop()
  {
    if (this.state !== 'playing' && this.state !== 'paused') return;
    this.state = 'stopped';
    this.spool = 0;
    this.shotClock = 0;
    this.projectiles.clear();
    this.enemyShots.length = 0;
    this.missiles.length = 0;
    this.flares.length = 0;
    this.events.length = 0;
    for (const target of this.targets) target.muzzleFlash = 0;
  }

  resume()
  {
    if (this.state === 'paused') this.state = 'playing';
  }

  update(dt, direction, firing)
  {
    if (this.state !== 'playing' || !Number.isFinite(dt) || dt <= 0) return;
    dt = Math.min(dt, this.remaining);
    this.time += dt;
    if (this.missileAmmo < MISSILE_MAGAZINE)
    {
      this.missileCooldown -= dt;
      if (this.missileCooldown <= 1e-9)
      {
        this.missileAmmo++;
        this.missileCooldown = this.missileAmmo < MISSILE_MAGAZINE ? Math.max(0, this.missileCooldown + MISSILE_RELOAD) : 0;
      }
    }
    if (this.time - this.lastKill > 5) this.combo = 0;

    for (const target of this.targets) this.moveTarget(target, dt, firing && !this.overheated);

    const canFire = firing && !this.overheated;
    this.spool = Math.max(0, Math.min(1, this.spool + (canFire ? 3.5 : -2.5) * dt));
    this.heat = Math.max(0, this.heat - (canFire ? 0.025 : 0.28) * dt);
    if (this.overheated && this.heat < 0.32) this.overheated = false;
    if (canFire && this.spool > 0.18)
    {
      this.shotClock += dt * 30 * this.spool;
      while (this.shotClock >= 1 && !this.overheated)
      {
        this.shotClock -= 1;
        if (this.projectiles.fire(direction))
        {
          this.shots++;
          this.heat = Math.min(1, this.heat + 0.012);
          this.events.push(
          {
            type: 'shot'
          });
        }
        if (this.heat >= 1)
        {
          this.overheated = true;
          this.events.push(
          {
            type: 'overheat'
          });
        }
      }
    }
    else this.shotClock = 0;

    this.projectiles.advance(dt);
    for (const projectile of this.projectiles.slots)
    {
      if (!projectile.alive) continue;
      let victim = null,
        contact = Infinity;
      for (const target of this.targets)
      {
        if (!target.alive) continue;
        const t = sweptHit(projectile.previous, projectile.position, target.previous, target.position, target.radius);
        if (t !== null && t < contact)
        {
          contact = t;
          victim = target;
        }
      }
      if (!victim) continue;
      projectile.alive = false;
      victim.health--;
      victim.flash = 0.15;
      this.hits++;
      this.events.push(
      {
        type: 'hit',
        position:
        {
          ...victim.position
        }
      });
      if (victim.health <= 0) this.destroyTarget(victim);
    }
    this.advanceMissiles(dt);
    for (const target of this.targets)
    {
      if (!target.alive) continue;
      target.attackClock -= dt;
      if (target.position.z >= -350 && target.position.z < -70 && target.attacks < this.tuning.burst && target.attackClock <= 0) this.attack(target);
      if (target.routeDistance >= target.route.at(-1).distance)
      {
        target.alive = false;
        this.escaped++;
        this.combo = 0;
        this.events.push(
        {
          type: 'escaped'
        });
      }
    }
    this.targets = this.targets.filter(target => target.alive);
    // Enemy tracers are arcade attack cues. Damage arrives when they reach the
    // player, while the player's rounds continue to use the shared ballistics core.
    for (const shot of this.enemyShots)
    {
      Object.assign(shot.previous, shot.position);
      shot.age += dt;
      if (shot.age < 0) continue;
      if (!shot.launched)
      {
        const source = this.targets.find(target => target.id === shot.sourceId);
        if (!source)
        {
          shot.age = shot.duration;
          continue;
        }
        const speed = Math.hypot(source.velocity.x, source.velocity.y, source.velocity.z) || 1;
        const cy = Math.cos(source.heading),
          sy = Math.sin(source.heading),
          cb = Math.cos(source.bank),
          sb = Math.sin(source.bank),
          sp = Math.sin(source.pitch),
          cp = Math.cos(source.pitch);
        shot.origin = {
          x: source.position.x + (cy * cb + sy * sp * sb) * shot.wing + source.velocity.x / speed * 4,
          y: source.position.y + sb * cp * shot.wing + source.velocity.y / speed * 4,
          z: source.position.z + (-sy * cb + cy * sp * sb) * shot.wing + source.velocity.z / speed * 4
        };
        Object.assign(shot.previous, shot.origin);
        shot.duration = Math.hypot(shot.impact.x - shot.origin.x, shot.impact.y - shot.origin.y, shot.impact.z - shot.origin.z) / 420;
        for (const axis of ['x', 'y', 'z']) shot.velocity[axis] = (shot.impact[axis] - shot.origin[axis]) / shot.duration;
        shot.velocity.y += 4.9 * shot.duration;
        shot.launched = true;
      }
      const flight = Math.min(shot.age, shot.duration);
      for (const axis of ['x', 'y', 'z']) shot.position[axis] = shot.origin[axis] + shot.velocity[axis] * flight;
      shot.position.y -= 4.9 * flight * flight;
      const t = Math.min(1, shot.age / shot.duration);
      if (t === 1)
      {
        this.takeDamage(shot.damage, shot.impact);
        if (this.state !== 'playing') return;
      }
    }
    this.enemyShots = this.enemyShots.filter(shot => shot.age < 0 || (shot.launched && shot.age < shot.duration));
    const regenTime = Math.max(0, this.time - Math.max(this.time - dt, this.lastDamage + REGEN_DELAY));
    this.health = Math.min(MAX_HEALTH, this.health + REGEN_RATE * regenTime);
    this.spawnClock -= dt;
    if (this.spawnClock <= 0 && this.targets.length < this.tuning.count + this.wave - 1)
    {
      this.spawnTarget();
      this.spawnClock = this.tuning.interval / (1 + (this.wave - 1) * 0.15);
    }
    if (this.remaining <= 0) this.finish('survived');
  }

  dispose()
  {
    this.projectiles.dispose();
    this.targets.length = 0;
    this.enemyShots.length = 0;
    this.missiles.length = 0;
    this.flares.length = 0;
    this.events.length = 0;
  }
}