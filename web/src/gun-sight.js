// A sight estimate for the game, calibrated with its own
// WASM flight model. Aircraft can still change course after a shot is fired.
export function buildGunFlightTable(physics, base, atmosphere, speed, range, lifetime)
{
  const position = new physics.Vector3D(0, 0, 0);
  const velocity = new physics.Vector3D(0, 0, -speed);
  const bullet = new physics.Bullet(base, position, velocity, 0);
  const simulator = new physics.BallisticsSimulator();
  const table = [
  {
    distance: 0,
    time: 0,
    drop: 0
  }];
  try
  {
    simulator.setAtmosphere(atmosphere);
    simulator.setInitialBullet(bullet);
    const trajectory = simulator.getTrajectory();
    const dt = 1 / 120;
    for (let step = 1; step <= Math.ceil(lifetime / dt); step++)
    {
      simulator.simulate(range + 100, dt, dt);
      const state = simulator.getCurrentBullet();
      const point = state.getPosition();
      table.push(
      {
        distance: -point.z,
        time: step * dt,
        drop: -point.y
      });
      point.delete();
      state.delete();
      trajectory.clear();
      if (table.at(-1).distance >= range) break;
    }
  }
  finally
  {
    simulator.delete();
    bullet.delete();
    position.delete();
    velocity.delete();
  }
  return table;
}

function flightAt(table, distance)
{
  if (distance > table.at(-1).distance) return null;
  let low = 0,
    high = table.length - 1;
  while (high - low > 1)
  {
    const middle = (low + high) >> 1;
    if (table[middle].distance < distance) low = middle;
    else high = middle;
  }
  const a = table[low],
    b = table[high];
  const fraction = Math.max(0, Math.min(1, (distance - a.distance) / (b.distance - a.distance)));
  return {
    time: a.time + (b.time - a.time) * fraction,
    drop: a.drop + (b.drop - a.drop) * fraction
  };
}

function predictedPosition(target, time)
{
  const position = {
      ...target.position
    },
    velocity = target.velocity;
  const speed = Math.hypot(velocity.x, velocity.y, velocity.z);
  if (speed < .01) return position;
  const heading = Math.atan2(-velocity.x, -velocity.z);
  const pitch = Math.atan2(velocity.y, Math.hypot(velocity.x, velocity.z));
  const turn = 9.81 * Math.tan(target.bank || 0) / speed;
  const dt = time / 12;
  for (let i = 0; i < 12; i++)
  {
    const t = (i + .5) * dt;
    const yaw = heading + turn * t;
    const elevation = Math.max(-.35, Math.min(.4, pitch + (target.pitchRate || 0) * t));
    position.x -= Math.sin(yaw) * Math.cos(elevation) * speed * dt;
    position.y += Math.sin(elevation) * speed * dt;
    position.z -= Math.cos(yaw) * Math.cos(elevation) * speed * dt;
  }
  return position;
}

export function gunAimPoint(target, table, range)
{
  const distance = Math.hypot(target.position.x, target.position.y - 8, target.position.z);
  if (distance > range || distance < 20) return null;
  let flight = flightAt(table, distance),
    point;
  if (!flight) return null;
  for (let i = 0; i < 6; i++)
  {
    point = predictedPosition(target, flight.time);
    const reach = Math.hypot(point.x, point.y - 8, point.z);
    if (reach > range) return null;
    flight = flightAt(table, reach);
    if (!flight) return null;
  }
  point = predictedPosition(target, flight.time);
  point.y += flight.drop;
  return {
    position: point,
    distance,
    time: flight.time,
    targetId: target.id
  };
}