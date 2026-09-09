import
{
  TRENCH_CAMERA
}
from './terrain.js';
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
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
      health: 3,
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
      const velocity = {
        x: plane.velocity.x / plane.speed * 640 + (game.random() - .5) * 4,
        y: plane.velocity.y / plane.speed * 640 + 4.905 * distance / 640 + (game.random() - .5) * 3,
        z: plane.velocity.z / plane.speed * 640
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