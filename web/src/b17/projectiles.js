import { ProjectilePool } from '../game.js';
import { ALTITUDE, BROWNING, RANGE } from './flight.js';

// Integrate in an inertial world frame. Only presentation/collision coordinates
// follow the aircraft, so a turn never rotates a bullet already in flight.
export class AirborneProjectiles extends ProjectilePool
{
  constructor(physics, game, speed = BROWNING.muzzleVelocity)
  {
    super(physics, { ammo: BROWNING, speed, altitude: ALTITUDE, range: RANGE, lifetime: 4 });
    this.game = game;
    this.windVector = new physics.Vector3D(0, 0, 0);
  }

  fire(direction, origin, barrel = 0, inheritedVelocity = { x: 0, y: 0, z: 0 })
  {
    const flight = this.game.flight;
    const velocity = flight.worldVelocity(inheritedVelocity, origin);
    if (!super.fire(flight.rotate(direction), flight.toWorld(origin), barrel, velocity)) return false;
    const shot = this.lastFired;
    shot.worldPosition = { ...shot.position };
    Object.assign(shot.position, origin);
    Object.assign(shot.previous, origin);
    shot.launchPosition = { ...origin };
    shot.tracerShown = false;
    shot.deferAdvance = false;
    return true;
  }

  advance(dt)
  {
    const flight = this.game.flight;
    for (const shot of this.slots)
    {
      if (!shot.alive) continue;
      // AI shots are emitted after the aircraft has advanced this tick. Their
      // first integration belongs to the following tick, like player launches.
      if (shot.deferAdvance) { shot.deferAdvance = false; continue; }
      Object.assign(shot.previous, shot.position);
      Object.assign(this.windVector, flight.worldWind(this.game.time, shot.worldPosition));
      shot.simulator.setWind(this.windVector);
      // Native simulate's range guard is along world -Z; use time only here and
      // apply the mode's spherical range boundary after converting to the camera.
      shot.simulator.simulate(1e8, dt / 2, dt);
      const state = shot.simulator.getCurrentBullet(), p = state.getPosition();
      Object.assign(shot.worldPosition, { x: p.x, y: p.y, z: p.z });
      Object.assign(shot.position, flight.toLocal(shot.worldPosition));
      p.delete();
      state.delete();
      shot.trajectory.clear();
      shot.age += dt;
      if (!Number.isFinite(shot.position.x + shot.position.y + shot.position.z)) shot.alive = false;
    }
  }

  dispose()
  {
    this.windVector.delete();
    super.dispose();
  }
}
