import
{
  buildGunFlightTable,
  gunAimPoint
}
from './gun-sight.js';

// Positions are metres; +Y is up, forward is −Z. Aircraft, damage, heat, and
// visual sizes are arcade tuning; the gun uses published 20 mm velocity and BC.
export const ROUND_SECONDS = 300;
export const STEP = 1 / 60;
export const MAX_SHOTS = 160;
// MKE product catalogue: 20×102 six-barrel cannon MV; M56 A3 HEI-T G1 BC/mass.
// https://www.scribd.com/document/862494715/MKE-INC-PRODUCT-CATALOUGE-ENG
// The ammunition table's 1030 m/s is measured at 23.7 m, not at the muzzle.
export const GUN_AMMO = Object.freeze(
{
  name: '20×102 mm HEI-T',
  muzzleVelocity: 987,
  bc: .4933883,
  mass: .103,
  diameter: .020
});
export const GUN_SPEED = GUN_AMMO.muzzleVelocity;
// Game culling boundary, not a maximum ballistic range.
export const GUN_RANGE = 2000;
export const GUN_LIFETIME = 6;
export const MAX_ENEMY_SHOTS = 128;
export const MAX_BOMBS = 12;
const TURN_DISTANCE = 1100;
export const MAX_HEALTH = 75;
export const REGEN_DELAY = 5;
export const REGEN_RATE = 4;
export const MISSILE_RELOAD = 3;
export const MISSILE_MAGAZINE = 5;
export const MAX_MISSILES = MISSILE_MAGAZINE + Math.ceil(ROUND_SECONDS / MISSILE_RELOAD);
export const MISSILE_RANGE = 4000;
// Gameplay tuning, not specifications for a real aircraft or weapon.
export const MISSILE_SPEED = 480;
export const MISSILE_ACCELERATION = 220;
export const MISSILE_TURN_RATE = .38;
// Give the player time to react once an attacker is visible and unobstructed.
export const ATTACK_REACTION_TIME = 1.5;
export const AIRCRAFT_BANK_LIMIT = .75;
export const AIRCRAFT_ROLL_RATE = .4;
export const AIRCRAFT_PITCH_RATE = .12;
const ENEMY_ROUND_SPEED = 650;
const PLAYER_POSITION = {
  x: 0,
  y: 8,
  z: 0
};
const clamp = (value, low, high) => Math.max(low, Math.min(high, value));

export function aircraftForward(target)
{
  const cp = Math.cos(target.pitch);
  return {
    x: -Math.sin(target.heading) * cp,
    y: Math.sin(target.pitch),
    z: -Math.cos(target.heading) * cp
  };
}

function turnTowards(direction, desired, limit)
{
  const dot = clamp(direction.x * desired.x + direction.y * desired.y + direction.z * desired.z, -1, 1);
  const angle = Math.acos(dot);
  if (angle <= limit) return {
    ...desired
  };
  if (angle < 1e-8) return {
    ...direction
  };
  const tangent = {
    x: desired.x - direction.x * dot,
    y: desired.y - direction.y * dot,
    z: desired.z - direction.z * dot
  };
  let length = Math.hypot(tangent.x, tangent.y, tangent.z);
  if (length < 1e-8)
  {
    Object.assign(tangent, Math.abs(direction.y) < .9 ?
    {
      x: -direction.z,
      y: 0,
      z: direction.x
    } :
    {
      x: 0,
      y: -direction.z,
      z: direction.y
    });
    length = Math.hypot(tangent.x, tangent.y, tangent.z);
  }
  const result = {};
  for (const axis of ['x', 'y', 'z']) result[axis] = direction[axis] * Math.cos(limit) + tangent[axis] / length * Math.sin(limit);
  return result;
}

function leadTime(offset, velocity, speed)
{
  const a = velocity.x ** 2 + velocity.y ** 2 + velocity.z ** 2 - speed ** 2;
  const b = 2 * (offset.x * velocity.x + offset.y * velocity.y + offset.z * velocity.z);
  const c = offset.x ** 2 + offset.y ** 2 + offset.z ** 2;
  const discriminant = b * b - 4 * a * c;
  if (Math.abs(a) < 1e-8) return b < 0 ? clamp(-c / b, 0, 4) : 0;
  if (discriminant < 0) return 0;
  const roots = [(-b - Math.sqrt(discriminant)) / (2 * a), (-b + Math.sqrt(discriminant)) / (2 * a)].filter(t => t > 0);
  return roots.length ? Math.min(4, ...roots) : 0;
}

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
    damage: 1.125,
    bombDamage: 35,
    burst: 2,
    flares: 0.25
  },
  arcade:
  {
    speed: 1,
    interval: 3.2,
    count: 4,
    radius: 1,
    damage: 1.95,
    bombDamage: 48,
    burst: 2,
    flares: 0.5
  },
  frenzy:
  {
    speed: 1.3,
    interval: 2.2,
    count: 6,
    radius: 0.9,
    damage: 2.625,
    bombDamage: 60,
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

// Sample the travelled segment, then refine the first terrain/water crossing.
function surfaceContact(a, b)
{
  const steps = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z) / 4));
  const above = t =>
  {
    const x = a.x + (b.x - a.x) * t,
      z = a.z + (b.z - a.z) * t;
    return a.y + (b.y - a.y) * t - surfaceHeight(x, z);
  };
  if (above(0) <= 0) return 0;
  for (let step = 1; step <= steps; step++)
  {
    let high = step / steps;
    if (above(high) > 0) continue;
    let low = (step - 1) / steps;
    for (let i = 0; i < 8; i++)
    {
      const middle = (low + high) / 2;
      if (above(middle) > 0) low = middle;
      else high = middle;
    }
    return high;
  }
  return null;
}

class ProjectilePool
{
  constructor(physics)
  {
    this.physics = physics;
    this.slots = [];
    // Length is unused with spin disabled; no unpublished dimension is assumed.
    this.base = new physics.Bullet(GUN_AMMO.mass, GUN_AMMO.diameter, 0, GUN_AMMO.bc, physics.DragFunction.G1);
    this.atmosphere = new physics.Atmosphere();
    this.launchPosition = new physics.Vector3D(0, 8, 0);
    this.launchVelocity = new physics.Vector3D(0, 0, 0);
    this.flightTable = buildGunFlightTable(physics, this.base, this.atmosphere, GUN_SPEED, GUN_RANGE, GUN_LIFETIME);
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
    // Published muzzle velocity feeds the same gravity and G1 drag integration.
    const speed = GUN_SPEED;
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
      projectile.simulator.simulate(GUN_RANGE, dt, dt);
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
      if (!Number.isFinite(projectile.position.x + projectile.position.y + projectile.position.z)) projectile.alive = false;
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
  constructor(physics, random = Math.random, isAttackVisible = () => false, flightHalfWidth = distance => distance * .5)
  {
    this.isAttackVisible = isAttackVisible;
    this.flightHalfWidth = flightHalfWidth;
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
    this.bombs = [];
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
    this.spawnTarget();
  }

  get remaining()
  {
    return Math.max(0, ROUND_SECONDS - this.time);
  }
  get wave()
  {
    return Math.min(3, 1 + Math.floor(this.time / (ROUND_SECONDS / 3)));
  }
  get aircraftLimit()
  {
    return Math.ceil((this.tuning.count + this.wave - 1) * 1.25);
  }
  get accuracy()
  {
    return this.shots ? Math.round(100 * this.hits / this.shots) : 0;
  }
  get healthPercent()
  {
    return 100 * this.health / MAX_HEALTH;
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
    const bearing = Math.atan(this.flightHalfWidth(1) * .6) * (sector * (.65 + rand() * .3) + (rand() - .5) * .12);
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
    const range = Math.max(1, Math.hypot(x, z));
    const outward = {
      x: x / range,
      z: z / range
    };
    const turnRadius = this.turnRadius();
    const lane = side * turnRadius;
    const offset = path === 'sweep' ? 320 : path === 'cross' ? -280 : 160;
    const route = makeRoute([
      position,
      {
        x: clamp(x * .6 - outward.z * bend * offset * .3, -this.flightHalfWidth(1800) * .5, this.flightHalfWidth(1800) * .5),
        y: y * .82 + (path === 'swoop' ? 60 : 0),
        z: z * .7 + outward.x * bend * offset
      },
      {
        x: lane,
        y: 180,
        z: -2100
      },
      {
        x: lane * .8,
        y: 130,
        z: -1700
      }
    ]);
    const first = route[1];
    const heading = Math.atan2(-(first.x - x), -(first.z - z));
    const pitch = Math.atan2(first.y - y, Math.hypot(first.x - x, first.z - z));
    const cruiseSpeed = (95 + rand() * 25) * this.tuning.speed * (1 + (this.wave - 1) * .15);
    const turnSpeed = Math.min(cruiseSpeed * .85, Math.sqrt(9.81 * Math.tan(.7) * turnRadius), turnRadius * .14);
    const target = {
      id: ++this.nextId,
      kind,
      path,
      age: 0,
      phase: rand() * Math.PI * 2,
      speed: Math.min(cruiseSpeed, Math.sqrt(turnSpeed * turnSpeed + 8 * Math.max(0, -z - TURN_DISTANCE - 220))),
      cruiseSpeed,
      side,
      turnRadius,
      bombDropped: false,
      passes: 0,
      route,
      routeDistance: 0,
      routeIndex: 0,
      flightPhase: 'approach',
      pitchRate: 0,
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
      pitch,
      bank: 0,
      radius: 8 * this.tuning.radius,
      attacks: 0,
      attackClock: 0,
      visibleFor: 0,
      muzzleFlash: 0,
      flareCooldown: 0,
      health: kind === 'wing' ? 3 : 2,
      flash: 0,
      alive: true
    };
    this.targets.push(target);
  }

  turnRadius()
  {
    const width = this.flightHalfWidth(1) * .72;
    return Math.max(100, Math.min(540, TURN_DISTANCE * width / Math.sqrt(1 + width * width) * .5));
  }

  beginTurn(target, phase)
  {
    target.flightPhase = phase;
    if (phase === 'break') target.side = Math.sign(target.position.x) || target.side;
    target.turnStart = target.heading;
  }

  moveTarget(target, dt, firing)
  {
    if (dt <= 0) return;
    Object.assign(target.previous, target.position);
    target.age += dt;
    target.turnRadius += (this.turnRadius() - target.turnRadius) * (1 - Math.exp(-dt));
    const range = Math.hypot(target.position.x, target.position.z);
    const threatened = (firing && range < 1400) || this.missiles.some(missile => missile.targetId === target.id && Math.hypot(missile.position.x - target.position.x, missile.position.y - target.position.y, missile.position.z - target.position.z) < 850);
    target.evasion += ((threatened ? 1 : 0) - target.evasion) * (1 - Math.exp(-dt * .8));
    if (target.flightPhase === 'approach' && target.position.z > -2100) target.flightPhase = 'run';
    if (target.flightPhase === 'run' && target.position.z > -TURN_DISTANCE) this.beginTurn(target, 'break');
    if (target.flightPhase === 'egress' && target.position.z < -3100) this.beginTurn(target, 'return');
    if (['break', 'return'].includes(target.flightPhase) && Math.abs(target.heading - target.turnStart) >= Math.PI - .12)
    {
      if (target.flightPhase === 'return')
      {
        target.flightPhase = 'run';
        target.attacks = 0;
        target.bombDropped = false;
        target.passes++;
      }
      else target.flightPhase = 'egress';
    }
    const turning = target.flightPhase === 'break' || target.flightPhase === 'return';
    const turnSpeed = Math.min(target.cruiseSpeed * .85, Math.sqrt(9.81 * Math.tan(.7) * target.turnRadius), target.turnRadius * .14);
    const distanceToTurn = target.flightPhase === 'egress' ? target.position.z + 3100 : -target.position.z - TURN_DISTANCE;
    const desiredSpeed = turning ? turnSpeed : Math.min(target.cruiseSpeed, Math.sqrt(turnSpeed * turnSpeed + 8 * Math.max(0, distanceToTurn - 220)));
    target.speed += clamp(desiredSpeed - target.speed, -4 * dt, 3 * dt);
    let destination;
    if (target.flightPhase === 'approach')
    {
      let closest = Infinity;
      for (let i = target.routeIndex; i < target.route.length; i++)
      {
        const point = target.route[i];
        const distance = Math.hypot(point.x - target.position.x, point.y - target.position.y, point.z - target.position.z);
        if (distance < closest)
        {
          closest = distance;
          target.routeIndex = i;
        }
      }
      target.routeDistance = target.route[target.routeIndex].distance;
      let ahead = target.routeIndex;
      const lookAhead = target.routeDistance + Math.max(240, target.speed * 2.5);
      while (ahead < target.route.length - 1 && target.route[ahead].distance < lookAhead) ahead++;
      destination = target.route[ahead];
    }
    else if (target.flightPhase === 'run') destination = PLAYER_POSITION;
    else destination = {
      x: -target.side * target.turnRadius,
      y: 240,
      z: -3700
    };
    const dx = destination.x - target.position.x,
      dy = destination.y - target.position.y,
      dz = destination.z - target.position.z;
    const desiredHeading = Math.atan2(-dx, -dz) + (target.flightPhase === 'run' ? Math.sin(target.age * .45 + target.phase) * target.evasion * .035 : 0);
    const headingError = Math.atan2(Math.sin(desiredHeading - target.heading), Math.cos(desiredHeading - target.heading));
    const desiredBank = turning ? -target.side * Math.atan(target.speed * target.speed / (9.81 * target.turnRadius)) : clamp(Math.atan(headingError * .8 * target.speed / 9.81), -AIRCRAFT_BANK_LIMIT, AIRCRAFT_BANK_LIMIT);
    target.bank += clamp(clamp(desiredBank, -AIRCRAFT_BANK_LIMIT, AIRCRAFT_BANK_LIMIT) - target.bank, -AIRCRAFT_ROLL_RATE * dt, AIRCRAFT_ROLL_RATE * dt);
    target.heading += 9.81 * Math.tan(target.bank) / target.speed * dt;
    // Raise the nose during a gun pass so gravity does not send every round short.
    const horizontalRange = Math.hypot(dx, dz);
    const gunFlightTime = horizontalRange / ((ENEMY_ROUND_SPEED + target.speed) * Math.cos(target.pitch));
    const aimHeight = dy + (target.flightPhase === 'run' ? 4.905 * gunFlightTime * gunFlightTime : 0);
    const desiredPitch = turning ? clamp((180 - target.position.y) * .002, -.08, .12) : clamp(Math.atan2(aimHeight, horizontalRange), -.25, .3);
    const pitchRate = clamp((desiredPitch - target.pitch) * .8, -AIRCRAFT_PITCH_RATE, AIRCRAFT_PITCH_RATE);
    target.pitchRate += (pitchRate - target.pitchRate) * (1 - Math.exp(-dt * 2));
    target.pitch += target.pitchRate * dt;
    const forward = aircraftForward(target);
    for (const axis of ['x', 'y', 'z'])
    {
      target.velocity[axis] = forward[axis] * target.speed;
      target.position[axis] += target.velocity[axis] * dt;
    }
    target.flash = Math.max(0, target.flash - dt);
    target.muzzleFlash = Math.max(0, target.muzzleFlash - dt);
    target.flareCooldown = Math.max(0, target.flareCooldown - dt);
  }

  updateAttackVisibility(target, dt)
  {
    const range = Math.hypot(target.position.x, target.position.y - 8, target.position.z);
    const visible = target.alive && range <= GUN_RANGE && this.isAttackVisible(target) && surfaceContact(PLAYER_POSITION, target.position) === null;
    target.visibleFor = visible ? Math.min(ATTACK_REACTION_TIME, target.visibleFor + dt) : 0;
  }

  canAttack(target)
  {
    if (target.visibleFor < ATTACK_REACTION_TIME || !this.isAttackVisible(target)) return false;
    const dx = -target.position.x,
      dy = 8 - target.position.y,
      dz = -target.position.z;
    const distance = Math.hypot(dx, dy, dz);
    if (!target.alive || distance < 160 || distance > 1400 || !['approach', 'run'].includes(target.flightPhase)) return false;
    const forward = aircraftForward(target);
    return (forward.x * dx + forward.y * dy + forward.z * dz) / distance > Math.cos(.09);
  }

  gunLead(direction)
  {
    let best = null,
      alignment = .91;
    for (const target of this.targets)
    {
      if (!target.alive) continue;
      const x = target.position.x,
        y = target.position.y - 8,
        z = target.position.z;
      const distance = Math.hypot(x, y, z);
      const dot = (x * direction.x + y * direction.y + z * direction.z) / distance;
      if (dot <= alignment) continue;
      const solution = gunAimPoint(target, this.projectiles.flightTable, GUN_RANGE);
      if (solution)
      {
        best = solution;
        alignment = dot;
      }
    }
    return best;
  }

  missileTarget(direction)
  {
    let best = null,
      alignment = 0.985;
    for (const target of this.targets)
    {
      if (!target.alive) continue;
      const
      {
        x,
        z
      } = target.position, y = target.position.y - 8;
      const distance = Math.hypot(x, y, z);
      if (distance < 10 || distance > MISSILE_RANGE) continue;
      // All-aspect game seeker: an approaching aircraft can be locked head-on.
      const dot = (x * direction.x + y * direction.y + z * direction.z) / distance;
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
        x: -3.5,
        y: 7,
        z: -1.5
      },
      previous:
      {
        x: -3.5,
        y: 7,
        z: -1.5
      },
      direction:
      {
        x: direction.x,
        y: direction.y,
        z: direction.z
      },
      id: ++this.nextId,
      speed: 180,
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
      for (const axis of ['x', 'y', 'z'])
      {
        flare.position[axis] += flare.velocity[axis] * dt;
        flare.velocity[axis] *= Math.exp(-dt * 1.2);
      }
      flare.velocity.y -= 9.81 * dt;
    }
    this.flares = this.flares.filter(flare => flare.age < 3);
    for (const missile of this.missiles)
    {
      missile.age += dt;
      Object.assign(missile.previous, missile.position);
      const target = this.targets.find(item => item.id === missile.targetId && item.alive);
      if (target && !missile.flareChecked && Math.hypot(target.position.x - missile.position.x, target.position.y - missile.position.y, target.position.z - missile.position.z) < 350)
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
            drift: this.random() < 0.5 ? -27 : 27,
            velocity:
            {
              x: target.velocity.x * .7 + (this.random() - .5) * 50,
              y: target.velocity.y * .7 - 8,
              z: target.velocity.z * .7
            }
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
      const previousSpeed = missile.speed;
      missile.speed = Math.min(MISSILE_SPEED, missile.speed + MISSILE_ACCELERATION * dt);
      if (destination)
      {
        const offset = {
          x: destination.x - missile.position.x,
          y: destination.y - missile.position.y,
          z: destination.z - missile.position.z
        };
        const distance = Math.hypot(offset.x, offset.y, offset.z);
        const alignment = distance ? (offset.x * missile.direction.x + offset.y * missile.direction.y + offset.z * missile.direction.z) / distance : 1;
        if (alignment < .5)
        {
          // A target outside the seeker cone is lost; do not loop back after a pass.
          missile.targetId = null;
          missile.decoyId = null;
        }
        else if (distance > 0)
        {
          const velocity = (missile.decoyId !== null ? decoy : target)?.velocity ??
          {
            x: 0,
            y: 0,
            z: 0
          };
          const lead = leadTime(offset, velocity, missile.speed);
          for (const axis of ['x', 'y', 'z']) offset[axis] += velocity[axis] * lead;
          const length = Math.hypot(offset.x, offset.y, offset.z);
          if (length > 0)
          {
            for (const axis of ['x', 'y', 'z']) offset[axis] /= length;
            missile.direction = turnTowards(missile.direction, offset, Math.min(MISSILE_TURN_RATE, 140 / missile.speed) * dt);
          }
        }
      }
      for (const axis of ['x', 'y', 'z']) missile.position[axis] += missile.direction[axis] * (previousSpeed + missile.speed) * .5 * dt;
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
        for (const aircraft of [...this.targets, ...this.bombs])
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
          if (victim.kind === 'bomb') this.destroyBomb(victim);
          else this.destroyTarget(victim);
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

  dropBomb(target)
  {
    const distance = Math.hypot(target.position.x, target.position.y - 8, target.position.z);
    if (target.bombDropped || this.bombs.length >= MAX_BOMBS || distance > 1080 || target.visibleFor < ATTACK_REACTION_TIME || !this.isAttackVisible(target) || !['run', 'break'].includes(target.flightPhase)) return;
    target.bombDropped = true;
    const position = {
      x: target.position.x,
      y: target.position.y - 4,
      z: target.position.z
    };
    // Fictional glide-bomb arc gives a readable warning and time to intercept it.
    const duration = 3.2 + distance / 1800;
    const impact = {
      x: (this.random() - .5) * 24,
      y: 3,
      z: (this.random() - .5) * 24
    };
    const velocity = {
      x: (impact.x - position.x) / duration,
      y: (impact.y - position.y + 4.905 * duration * duration) / duration,
      z: (impact.z - position.z) / duration
    };
    this.bombs.push(
    {
      id: ++this.nextId,
      kind: 'bomb',
      position,
      previous:
      {
        ...position
      },
      velocity,
      age: 0,
      duration,
      radius: 7,
      damage: this.tuning.bombDamage,
      alive: true
    });
    this.events.push(
    {
      type: 'bombDrop',
      position:
      {
        ...position
      }
    });
  }

  moveBombs(dt)
  {
    for (const bomb of this.bombs)
    {
      if (!bomb.alive) continue;
      Object.assign(bomb.previous, bomb.position);
      bomb.age += dt;
      for (const axis of ['x', 'y', 'z']) bomb.position[axis] += bomb.velocity[axis] * dt;
      bomb.position.y -= 4.905 * dt * dt;
      bomb.velocity.y -= 9.81 * dt;
    }
  }

  destroyBomb(bomb)
  {
    if (!bomb.alive) return;
    bomb.alive = false;
    this.score += 50;
    this.events.push(
    {
      type: 'bombDestroyed',
      position:
      {
        ...bomb.position
      },
      points: 50
    });
  }

  resolveBombs()
  {
    for (const bomb of this.bombs)
    {
      if (!bomb.alive) continue;
      const contact = surfaceContact(bomb.previous, bomb.position);
      if (contact !== null)
      {
        for (const axis of ['x', 'y', 'z']) bomb.position[axis] = bomb.previous[axis] + (bomb.position[axis] - bomb.previous[axis]) * contact;
        bomb.alive = false;
        this.events.push(
        {
          type: 'bombImpact',
          position:
          {
            ...bomb.position
          }
        });
        const distance = Math.hypot(bomb.position.x, bomb.position.y - 3, bomb.position.z);
        if (distance < 70) this.takeDamage(bomb.damage * (1 - distance / 70),
        {
          ...bomb.position
        });
        if (this.state !== 'playing') return;
      }
      else if (bomb.age > 8) bomb.alive = false;
    }
    this.bombs = this.bombs.filter(bomb => bomb.alive);
  }

  attack(target)
  {
    if (!this.canAttack(target)) return;
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
      origin:
      {
        ...origin
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
      duration: 6,
      alive: true,
      velocity:
      {
        x: 0,
        y: 0,
        z: 0
      },
      // Damage is per hit, not shared across the entire burst.
      damage: this.tuning.damage
    });
    target.attacks++;
    target.attackClock = .9;
    target.muzzleFlash = .09;
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
    this.bombs.length = 0;
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
    this.bombs.length = 0;
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

    for (const target of this.targets)
    {
      this.moveTarget(target, dt, firing && !this.overheated);
      this.updateAttackVisibility(target, dt);
    }

    this.moveBombs(dt);

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
          this.heat = Math.min(1, this.heat + 0.009);
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
      let victim = null;
      const groundContact = surfaceContact(projectile.previous, projectile.position);
      let contact = groundContact ?? Infinity;
      for (const target of [...this.targets, ...this.bombs])
      {
        if (!target.alive) continue;
        const t = sweptHit(projectile.previous, projectile.position, target.previous, target.position, target.radius);
        if (t !== null && t < contact)
        {
          contact = t;
          victim = target;
        }
      }
      if (contact === Infinity)
      {
        if (projectile.age > GUN_LIFETIME || Math.hypot(projectile.position.x, projectile.position.y - 8, projectile.position.z) > GUN_RANGE) projectile.alive = false;
        continue;
      }
      projectile.alive = false;
      const impact = {};
      for (const axis of ['x', 'y', 'z']) impact[axis] = projectile.previous[axis] + (projectile.position[axis] - projectile.previous[axis]) * contact;
      this.events.push(
      {
        type: 'shellImpact',
        position: impact
      });
      if (!victim) continue;
      if (victim.kind === 'bomb')
      {
        this.hits++;
        this.destroyBomb(victim);
        continue;
      }
      // HE hit damage is a game rule, independent of the sourced flight data.
      victim.health -= 2;
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
      if (target.attacks < this.tuning.burst && target.attackClock <= 0 && this.canAttack(target)) this.attack(target);
      this.dropBomb(target);
    }
    this.targets = this.targets.filter(target => target.alive);
    this.resolveBombs();
    if (this.state !== 'playing') return;
    this.advanceEnemyShots(dt);
    if (this.state !== 'playing') return;
    const regenTime = Math.max(0, this.time - Math.max(this.time - dt, this.lastDamage + REGEN_DELAY));
    this.health = Math.min(MAX_HEALTH, this.health + REGEN_RATE * regenTime);
    this.spawnClock -= dt;
    if (this.spawnClock <= 0 && this.targets.length < this.aircraftLimit)
    {
      this.spawnTarget();
      this.spawnClock = this.tuning.interval / (1 + (this.wave - 1) * 0.15);
    }
    if (this.remaining <= 0) this.finish('survived');
  }

  advanceEnemyShots(dt)
  {
    for (const shot of this.enemyShots)
    {
      Object.assign(shot.previous, shot.position);
      shot.age += dt;
      if (shot.age < 0) continue;
      if (!shot.launched)
      {
        const source = this.targets.find(target => target.id === shot.sourceId);
        // Every round needs both nose alignment and a visible, unobstructed attacker.
        if (!source || !this.canAttack(source))
        {
          shot.alive = false;
          continue;
        }
        const forward = aircraftForward(source);
        const cy = Math.cos(source.heading),
          sy = Math.sin(source.heading),
          cb = Math.cos(source.bank),
          sb = Math.sin(source.bank),
          sp = Math.sin(source.pitch),
          cp = Math.cos(source.pitch);
        const right = {
          x: cy * cb + sy * sp * sb,
          y: sb * cp,
          z: -sy * cb + cy * sp * sb
        };
        const up = {
          x: right.y * forward.z - right.z * forward.y,
          y: right.z * forward.x - right.x * forward.z,
          z: right.x * forward.y - right.y * forward.x
        };
        const spreadX = (this.random() - .5) * .008,
          spreadY = (this.random() - .5) * .008;
        for (const axis of ['x', 'y', 'z'])
        {
          shot.origin[axis] = source.position[axis] + right[axis] * shot.wing + forward[axis] * 4;
          shot.velocity[axis] = source.velocity[axis] + (forward[axis] + right[axis] * spreadX + up[axis] * spreadY) * ENEMY_ROUND_SPEED;
        }
        Object.assign(shot.previous, shot.origin);
        shot.launched = true;
        source.muzzleFlash = .09;
      }
      for (const axis of ['x', 'y', 'z']) shot.position[axis] = shot.origin[axis] + shot.velocity[axis] * shot.age;
      shot.position.y -= 4.905 * shot.age * shot.age;
      const contact = sweptHit(shot.previous, shot.position, PLAYER_POSITION, PLAYER_POSITION, 12);
      if (contact !== null)
      {
        for (const axis of ['x', 'y', 'z']) shot.position[axis] = shot.previous[axis] + (shot.position[axis] - shot.previous[axis]) * contact;
        shot.alive = false;
        this.takeDamage(shot.damage,
        {
          ...shot.position
        });
        if (this.state !== 'playing') return;
      }
      else if (shot.position.y <= surfaceHeight(shot.position.x, shot.position.z))
      {
        shot.alive = false;
        this.events.push(
        {
          type: 'enemyImpact',
          position:
          {
            ...shot.position
          }
        });
      }
      else if (shot.age >= shot.duration) shot.alive = false;
    }
    this.enemyShots = this.enemyShots.filter(shot => shot.alive);
  }

  dispose()
  {
    this.projectiles.dispose();
    this.targets.length = 0;
    this.enemyShots.length = 0;
    this.missiles.length = 0;
    this.flares.length = 0;
    this.bombs.length = 0;
    this.events.length = 0;
  }
}