// Coordinates translate with the formation: +Z is the bomber's nose, -Z its tail.
export const ALTITUDE = 6000;
export const BROWNING = Object.freeze({ mass: .046, diameter: .0127, bc: .62, muzzleVelocity: 880 });
export const RANGE = 1400;
export const FORMATION_OFFSETS = Object.freeze([
  [-43, -9, -122], [53, 15, -165], [-65, 22, 160], [75, -15, 210],
  [-120, 48, -235], [145, 58, -285], [-180, -45, -55], [190, -62, 70],
  [-145, 70, 295], [160, 38, 345], [-235, -75, 235], [255, 85, -150]
]);
export const STATIONS = Object.freeze({
  tail: { label: 'Tail', key: '1', guns: 2, position: { x: 0, y: 8, z: -13 }, forward: { x: 0, y: 0, z: -1 } },
  port: { label: 'Port waist', key: '2', guns: 1, position: { x: -1.5, y: 8, z: -4 }, forward: { x: -1, y: 0, z: 0 } },
  starboard: { label: 'Starboard waist', key: '3', guns: 1, position: { x: 1.5, y: 8, z: -4 }, forward: { x: 1, y: 0, z: 0 } },
  nose: { label: 'Nose', key: '4', guns: 1, position: { x: 0, y: 8, z: 12 }, forward: { x: 0, y: 0, z: 1 } },
  ball: { label: 'Ball turret', key: '5', guns: 2, rotating: true, minPitch: -1.48, maxPitch: 0, position: { x: 0, y: 5.7, z: .2 }, forward: { x: 0, y: -.72, z: -.694 } },
  top: { label: 'Upper turret', key: '6', guns: 2, rotating: true, minPitch: 0, maxPitch: 1.48, position: { x: 0, y: 10.3, z: 3 }, forward: { x: 0, y: .3, z: -.954 } }
});
export const add = (a, b) => ({ x: a.x + b.x, y: a.y + b.y, z: a.z + b.z });
export const sub = (a, b) => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
export const scale = (a, n) => ({ x: a.x * n, y: a.y * n, z: a.z * n });
export const length = a => Math.hypot(a.x, a.y, a.z);
export const unit = a => scale(a, 1 / (length(a) || 1));
export const dot = (a, b) => a.x * b.x + a.y * b.y + a.z * b.z;
export const clamp = (a, lo, hi) => Math.max(lo, Math.min(hi, a));

export function sectorOf(position)
{
  if (position.y < -Math.hypot(position.x, position.z) * .55) return 'ball';
  if (position.y > Math.hypot(position.x, position.z) * .4) return 'top';
  if (Math.abs(position.x) > Math.abs(position.z)) return position.x < 0 ? 'port' : 'starboard';
  return position.z < 0 ? 'tail' : 'nose';
}

export class FormationFlight
{
  constructor(airspeed = 95, meanWind = { x: 12, y: 0, z: -4 })
  {
    this.airspeed = airspeed;
    this.meanWind = { ...meanWind };
    // Level flight drifts with the steady air mass. Ground speed is NOT airspeed.
    this.groundVelocity = add({ x: 0, y: 0, z: airspeed }, meanWind);
    this.position = { ...ZERO };
    this.heading = this.bank = this.yawRate = 0;
    this.previousPosition = { ...ZERO };
    this.previousHeading = 0;
  }

  advance(dt, time)
  {
    this.previousPosition = { ...this.position };
    this.previousHeading = this.heading;
    // The pilot makes gentle coordinated course changes through the flak belt.
    this.bank = Math.sin(Math.max(0, time - 5) * .14) * .23;
    this.yawRate = -9.81 * Math.tan(this.bank) / this.airspeed;
    this.heading += this.yawRate * dt;
    this.groundVelocity = add(this.rotate({ x: 0, y: 0, z: this.airspeed }), this.meanWind);
    this.position = add(this.position, scale(this.groundVelocity, dt));
  }

  rotate(v, heading = this.heading)
  {
    return { x: Math.cos(heading) * v.x + Math.sin(heading) * v.z, y: v.y, z: -Math.sin(heading) * v.x + Math.cos(heading) * v.z };
  }
  toWorld(p) { return add(this.position, this.rotate(p)); }
  toLocal(p) { return this.rotate(sub(p, this.position), -this.heading); }
  carryPoint(p) { return this.toLocal(add(this.previousPosition, this.rotate(p, this.previousHeading))); }
  carryDirection(v) { return this.rotate(v, this.previousHeading - this.heading); }
  worldVelocity(v, p = ZERO)
  {
    return add(this.groundVelocity, this.rotate(add(v, { x: this.yawRate * p.z, y: 0, z: -this.yawRate * p.x })));
  }

  worldWind(time, position)
  {
    return add(this.meanWind, {
      x: 2.8 * Math.sin(time * .37 + position.z * .0017),
      y: .65 * Math.sin(time * .51 + position.x * .002),
      z: 1.8 * Math.sin(time * .29 + position.x * .0013)
    });
  }

  relativeWind(time, position)
  {
    // Galilean transform: v_round = muzzle + v_shooter - v_formation;
    // w = w_world - v_formation. Drag sees exactly v_round - w.
    // A player round therefore starts at muzzle speed in this translating frame;
    // subtracting the bomber speed again would count the slipstream twice.
    return this.rotate(sub(this.worldWind(time, this.toWorld(position)), this.groundVelocity), -this.heading);
  }
}
const ZERO = { x: 0, y: 0, z: 0 };

// Solve the optional sight with the same WASM drag, altitude and changing wind
// as live rounds. The coast's one-dimensional still-air lookup is not valid here.
export class AirborneSight
{
  constructor(physics, pool)
  {
    this.physics = physics;
    this.pool = pool;
    this.simulator = new physics.BallisticsSimulator();
    this.simulator.setAtmosphere(pool.atmosphere);
    this.trajectory = this.simulator.getTrajectory();
    this.origin = new physics.Vector3D(0, 0, 0);
    this.velocity = new physics.Vector3D(0, 0, 0);
    this.wind = new physics.Vector3D(0, 0, 0);
  }

  solve(target, origin, flight, now)
  {
    const worldOrigin = flight.toWorld(origin), targetPosition = flight.toWorld(target.position);
    const targetVelocity = flight.worldVelocity(target.velocity, target.position);
    const inheritedVelocity = flight.worldVelocity(ZERO, origin);
    const offset = sub(targetPosition, worldOrigin), distance = length(offset);
    if (distance < 30 || distance > RANGE) return null;
    let time = distance / (this.pool.speed * .85);
    let direction = unit(add(offset, scale(sub(targetVelocity, inheritedVelocity), time)));
    for (let pass = 0; pass < 5; pass++)
    {
      Object.assign(this.origin, worldOrigin);
      Object.assign(this.velocity, add(scale(direction, this.pool.speed), inheritedVelocity));
      const bullet = new this.physics.Bullet(this.pool.base, this.origin, this.velocity, 0);
      this.simulator.setInitialBullet(bullet);
      bullet.delete();
      let point = { ...worldOrigin };
      for (let t = 0; t < time - 1e-7;)
      {
        const dt = Math.min(1 / 30, time - t);
        Object.assign(this.wind, flight.worldWind(now + t, point));
        this.simulator.setWind(this.wind);
        this.simulator.simulate(100000, dt / 2, dt);
        const state = this.simulator.getCurrentBullet(), p = state.getPosition();
        point = { x: p.x, y: p.y, z: p.z };
        p.delete();
        state.delete();
        this.trajectory.clear();
        t += dt;
      }
      const error = sub(add(targetPosition, scale(targetVelocity, time)), point);
      const along = dot(error, direction);
      direction = unit(add(direction, scale(sub(error, scale(direction, along)), 1 / (this.pool.speed * time))));
      time = clamp(time + along / (this.pool.speed * .75), .025, 4);
    }
    return { position: add(origin, scale(flight.rotate(direction, -flight.heading), distance)), distance, time, targetId: target.id };
  }

  dispose()
  {
    this.simulator.delete();
    this.origin.delete();
    this.velocity.delete();
    this.wind.delete();
  }
}
