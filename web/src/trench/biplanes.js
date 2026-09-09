import
{
  sweptHit
}
from '../game.js';
import
{
  TRENCH_CAMERA
}
from './terrain.js';
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
export const BIPLANE_HEALTH = 4.4;
const ZERO = {
  x: 0,
  y: 0,
  z: 0
};
const AIRFRAME = [
{
  part: 'engine',
  center: [0, 0, -1.55],
  radii: [.43, .48, .7],
  damage: 2.25
},
{
  part: 'fuselage',
  center: [0, 0, .15],
  radii: [.48, .55, 2.1],
  damage: 1.1
},
{
  part: 'wing',
  center: [0, 1.05, -.2],
  radii: [4.3, .18, .8],
  damage: .9
},
{
  part: 'wing',
  center: [0, -.36, -.2],
  radii: [4.3, .18, .8],
  damage: .9
},
{
  part: 'tail',
  center: [0, .38, 2.7],
  radii: [1.35, .6, .65],
  damage: 1.2
}];
export function biplaneHit(start, end, plane)
{
  // Inverse of the model's yaw, pitch and bank, including translation this step.
  const c = Math.cos(plane.heading),
    s = Math.sin(plane.heading),
    cp = Math.cos(plane.pitch),
    sp = Math.sin(plane.pitch),
    cb = Math.cos(plane.bank),
    sb = Math.sin(plane.bank);
  const local = (point, position) =>
  {
    const x = point.x - position.x,
      y = point.y - position.y,
      z = point.z - position.z;
    const right = c * x + s * z;
    const up = -s * sp * x + cp * y + c * sp * z;
    return {
      x: right * cb + up * sb,
      y: -right * sb + up * cb,
      z: -s * cp * x - sp * y + c * cp * z
    };
  };
  const a = local(start, plane.previous),
    b = local(end, plane.position);
  let closest = null;
  for (const shape of AIRFRAME)
  {
    const scaled = point => (
    {
      x: (point.x - shape.center[0]) / shape.radii[0],
      y: (point.y - shape.center[1]) / shape.radii[1],
      z: (point.z - shape.center[2]) / shape.radii[2]
    });
    const fraction = sweptHit(scaled(a), scaled(b), ZERO, ZERO, 1);
    if (fraction !== null && (!closest || fraction < closest.fraction)) closest = {
      fraction,
      part: shape.part,
      damage: shape.damage,
      side: Math.sign(a.x + (b.x - a.x) * fraction)
    };
  }
  return closest;
}
export function damageBiplane(game, plane, hit)
{
  if (!plane.alive || plane.disabled || !hit) return;
  plane.health = Math.max(0, plane.health - hit.damage);
  if (plane.health > 1e-8) return;
  plane.health = 0;
  plane.disabled = true;
  plane.crashAge = 0;
  plane.failSide = hit.side || plane.side;
  plane.muzzleFlash = 0;
  game.aircraftKills++;
  game.score += 150;
  game.events.push(
  {
    type: 'destroyed',
    kind: 'biplane',
    position:
    {
      ...plane.position
    },
    velocity:
    {
      ...plane.velocity
    },
    points: 150
  });
}
export function biplaneSpread(distance)
{
  // Angular dispersion narrows as the pilot closes; misses still follow the gun axis.
  return .002 + .005 * clamp(distance / 450, 0, 1);
}

function advanceDisabled(game, plane, dt)
{
  if (plane.crashed)
  {
    plane.wreckAge += dt;
    if (plane.wreckAge > 12) plane.alive = false;
    return;
  }
  plane.crashAge += dt;
  plane.heading += plane.failSide * Math.min(.2, plane.crashAge * .06) * dt;
  plane.bank += plane.failSide * (.2 + plane.crashAge * .12) * dt;
  const speed = Math.max(25, Math.hypot(plane.velocity.x, plane.velocity.z) - dt * 2);
  plane.velocity.x = Math.sin(plane.heading) * speed;
  plane.velocity.z = -Math.cos(plane.heading) * speed;
  plane.velocity.y -= (2.2 + Math.min(7, plane.crashAge * 1.1)) * dt;
  plane.pitch = Math.atan2(plane.velocity.y, speed);
  for (const axis of ['x', 'y', 'z']) plane.position[axis] += plane.velocity[axis] * dt;
  const ground = game.terrain.height(plane.position.x, plane.position.z);
  if (plane.position.y <= ground + .55)
  {
    plane.position.y = ground + .55;
    plane.crashed = true;
    plane.wreckAge = 0;
    plane.pitch = -.08;
    plane.bank = plane.failSide * .18;
    game.events.push(
    {
      type: 'planeCrash',
      position:
      {
        x: plane.position.x,
        y: ground,
        z: plane.position.z
      },
      velocity:
      {
        ...plane.velocity
      }
    });
    plane.velocity = {
      x: 0,
      y: 0,
      z: 0
    };
  }
  if (plane.crashAge > 18 || Math.hypot(plane.position.x, plane.position.z) > 1200) plane.alive = false;
}
export function advanceBiplanes(game, dt)
{
  game.raidClock -= dt;
  if (game.raidClock <= 0 && game.biplanes.length < 2)
  {
    const side = game.random() < .5 ? -1 : 1;
    const position = {
      x: side * (60 + game.random() * 70),
      y: 55 + game.random() * 20,
      z: -650
    };
    const delta = {
      x: -position.x,
      y: TRENCH_CAMERA.y - position.y,
      z: TRENCH_CAMERA.z - position.z
    };
    const length = Math.hypot(delta.x, delta.y, delta.z),
      speed = 53 + game.random() * 8;
    game.biplanes.push(
    {
      id: ++game.nextId,
      kind: 'biplane',
      alive: true,
      position,
      previous:
      {
        ...position
      },
      velocity:
      {
        x: delta.x / length * speed,
        y: delta.y / length * speed,
        z: delta.z / length * speed
      },
      speed,
      heading: Math.atan2(delta.x, -delta.z),
      pitch: Math.asin(delta.y / length),
      bank: 0,
      side,
      turning: false,
      age: 0,
      radius: 4.2,
      health: BIPLANE_HEALTH,
      disabled: false,
      crashed: false,
      crashAge: 0,
      wreckAge: 0,
      shotClock: .3,
      muzzleFlash: 0
    });
    game.raidClock = game.difficulty === 'frenzy' ? 36 : 49;
    game.events.push(
    {
      type: 'airRaid'
    });
  }
  for (const plane of game.biplanes)
  {
    Object.assign(plane.previous, plane.position);
    plane.age += dt;
    if (plane.disabled)
    {
      advanceDisabled(game, plane, dt);
      continue;
    }
    plane.shotClock -= dt;
    plane.muzzleFlash = Math.max(0, plane.muzzleFlash - dt);
    if (plane.position.z > -300) plane.turning = true;
    if (plane.turning)
    {
      plane.bank += clamp(plane.side * .62 - plane.bank, -dt * .6, dt * .6);
      plane.heading += plane.side * .24 * dt;
      plane.pitch += clamp(.22 - plane.pitch, -dt * .12, dt * .12);
      plane.velocity = {
        x: Math.sin(plane.heading) * Math.cos(plane.pitch) * plane.speed,
        y: Math.sin(plane.pitch) * plane.speed,
        z: -Math.cos(plane.heading) * Math.cos(plane.pitch) * plane.speed
      };
    }
    for (const axis of ['x', 'y', 'z']) plane.position[axis] += plane.velocity[axis] * dt;
    const distance = Math.hypot(plane.position.x, plane.position.y, plane.position.z);
    const visible = Math.abs(plane.position.x) + 7 < game.halfWidth(-plane.position.z) * .78;
    if (!plane.turning && visible && distance < 450 && plane.shotClock <= 0 && game.enemyShots.length < 128)
    {
      plane.shotClock = .18;
      plane.muzzleFlash = .1;
      const angle = game.random() * Math.PI * 2,
        radius = Math.sqrt(game.random()) * biplaneSpread(distance);
      const xError = Math.cos(angle) * radius,
        yError = Math.sin(angle) * radius;
      const c = Math.cos(plane.heading),
        s = Math.sin(plane.heading),
        cp = Math.cos(plane.pitch),
        sp = Math.sin(plane.pitch);
      const direction = {
        x: s * cp + c * xError - s * sp * yError,
        y: sp + cp * yError,
        z: -c * cp + s * xError + c * sp * yError
      };
      const length = Math.hypot(direction.x, direction.y, direction.z);
      const velocity = {
        x: direction.x / length * 640,
        y: direction.y / length * 640 + 4.905 * distance / 640,
        z: direction.z / length * 640
      };
      game.enemyShots.push(
      {
        id: ++game.nextId,
        age: 0,
        alive: true,
        launched: true,
        side: 'enemy',
        source: 'biplane',
        damage: 4,
        position:
        {
          ...plane.position
        },
        previous:
        {
          ...plane.position
        },
        velocity
      });
      if (plane.age - (plane.lastSound || -10) > .8)
      {
        game.events.push(
        {
          type: 'planeFire',
          position:
          {
            ...plane.position
          }
        });
        plane.lastSound = plane.age;
      }
    }
    if (plane.age > 30 || plane.position.z < -850 || Math.abs(plane.position.x) > 520) plane.alive = false;
  }
  game.biplanes = game.biplanes.filter(plane => plane.alive);
}