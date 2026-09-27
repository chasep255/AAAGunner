import test from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';
import createPhysics from '../build/physics.js';
import { BomberGame, fighterHit } from '../web/src/b17/game.js';
import { FormationFlight, STATIONS, BROWNING, ALTITUDE, sub, add, scale, length, unit } from '../web/src/b17/flight.js';
import { AirborneProjectiles } from '../web/src/b17/projectiles.js';
import { ArcadeGame } from '../web/src/game.js';
import { TrenchGame } from '../web/src/trench/game.js';
import * as THREE from '../web/vendor/three/three.module.js';

register('./three-loader.js', import.meta.url);
const { BomberView } = await import('../web/src/b17/scene.js');

const physics = await createPhysics();
const zero = { x: 0, y: 0, z: 0 };
const step = 1 / 60;
const close = (a, b, tolerance = .03) => assert.ok(length(sub(a, b)) < tolerance, `${JSON.stringify(a)} differs from ${JSON.stringify(b)}`);
function random(seed = 11) { return () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; }; }

function gunView()
{
  const view = Object.create(BomberView.prototype);
  view.scene = new THREE.Scene();
  view.camera = new THREE.PerspectiveCamera(60, 1.5, .1, 35000);
  view.scene.add(view.camera);
  view.glowTexture = null;
  view.buildTurret();
  view.frame = new THREE.Group(); view.turretFrame = new THREE.Group();
  view.aim = new THREE.Vector3(); view.localAim = new THREE.Vector3(); view.muzzlePoint = new THREE.Vector3();
  view.flightDirection = new THREE.Vector3(); view.dummy = new THREE.Object3D();
  view.renderer = { getPixelRatio: () => 1 };
  view.buildTracers();
  view.clock = 23;
  view.resetStations();
  return view;
}

test('turret camera, reticle and muzzle stay aligned through traverse and banking', () => {
  const view = gunView();
  const keys = { left: false, right: false, up: false, down: false };
  for (const station of Object.keys(STATIONS)) for (const bank of [-.23, 0, .23])
  {
    const game = { station, state: 'playing', flight: { bank }, spool: 1 };
    if (STATIONS[station].rotating) view.turretAngles[station].yaw = 1.2;
    view.updateStationAim(0, 0, step, game, keys, true);
    const center = view.directionAt(0, 0).clone();
    const aim = view.turretAngles[station];
    const forward = aim ? new THREE.Vector3(Math.sin(aim.yaw) * Math.cos(aim.pitch), Math.sin(aim.pitch), -Math.cos(aim.yaw) * Math.cos(aim.pitch)) : new THREE.Vector3().copy(STATIONS[station].forward).normalize();
    forward.applyAxisAngle(new THREE.Vector3(0, 0, 1), bank);
    assert.ok(center.distanceTo(forward) < 1e-8, `${station}: bank must be applied before aiming`);
    for (const [x, y] of [[0, 0], [.6, -.4], [-.7, .3]])
    {
      const ray = view.directionAt(x, y).clone();
      const muzzle = view.muzzlePosition(0, ray).clone();
      const projected = muzzle.addScaledVector(ray, 500).project(view.camera);
      assert.ok(Math.abs(projected.x - x) < .004 && Math.abs(projected.y - y) < .004, `${station}: muzzle ray misses the sight`);
    }
  }
});

test('ball and upper turrets traverse fully and respect elevation limits', () => {
  const view = Object.create(BomberView.prototype);
  view.camera = new THREE.PerspectiveCamera(); view.clock = 0;
  view.setStation = () => {};
  view.resetStations();
  const keys = { left: false, right: true, up: false, down: true };
  const game = { station: 'ball', state: 'playing', flight: { bank: 0 }, spool: 0 };
  let crossedRear = false;
  for (let i = 0; i < 400; i++)
  {
    view.updateStationAim(0, 0, step, game, keys, true);
    crossedRear ||= Math.abs(view.turretAngles.ball.yaw) > 3;
  }
  assert.ok(crossedRear);
  assert.equal(view.turretAngles.ball.pitch, -1.48);
  game.station = 'top'; keys.down = false; keys.up = true;
  for (let i = 0; i < 200; i++) view.updateStationAim(0, 0, step, game, keys, true);
  assert.equal(view.turretAngles.top.pitch, 1.48);
  keys.down = true; keys.up = false;
  for (let i = 0; i < 250; i++) view.updateStationAim(0, 0, step, game, keys, true);
  assert.equal(view.turretAngles.top.pitch, -1.48, 'upper turret can track below the horizon');
});

test('B-17 tracers emerge from each barrel at 60, 30 and 20 fps without a recoil offset', () => {
  const view = gunView(), game = new BomberGame(physics, random());
  const keys = { left: false, right: false, up: false, down: false };
  try
  {
    game.start('relaxed');
    for (const station of Object.keys(STATIONS)) for (const bank of [-.23, .23])
      for (let ticks = 1; ticks <= 3; ticks++) for (let barrel = 0; barrel < STATIONS[station].guns; barrel++)
    {
      game.projectiles.slots.forEach(s => { s.alive = false; });
      game.setStation(station); game.flight.bank = bank;
      view.updateStationAim(.3, -.2, 0, game, keys, true);
      const direction = view.directionAt(.3, -.2).clone();
      const origin = view.muzzlePosition(barrel, direction).clone();
      game.projectiles.fire(direction, origin, barrel);
      for (let i = 0; i < ticks; i++)
      {
        game.time += step; game.flight.advance(step, game.time); game.projectiles.advance(step);
      }
      view.updateRecoil(view.cannons[barrel], 1);
      close(view.muzzlePosition(barrel, direction), origin, 1e-7);
      view.updatePlayerTracers(game);
      assert.equal(view.tracers.geometry.drawRange.count, 2, `${station}: a fresh round must already be visible`);
      const tail = new THREE.Vector3().fromArray(view.tracerPositions, 3);
      close(tail, origin, 1e-5);
      const shot = game.projectiles.lastFired;
      close(new THREE.Vector3().fromArray(view.tracerPositions), shot.position, 1e-5);
      game.time += step; game.flight.advance(step, game.time); game.projectiles.advance(step);
      view.updatePlayerTracers(game);
      assert.ok(new THREE.Vector3().fromArray(view.tracerPositions, 3).distanceTo(origin) > 1, 'later streaks detach from the gun');
    }
  }
  finally { game.dispose(); }
});

test('new waist rounds share the bomber time step instead of jumping forward with its speed', () => {
  const game = new BomberGame(physics, random());
  try
  {
    for (const speed of [75, 95, 115]) for (const station of ['port', 'starboard'])
    {
      game.airspeed = speed; game.start('relaxed');
      game.targets = []; game.spawnClock = game.flakClock = 100;
      game.setStation(station); game.shotClock = 1;
      game.spread = direction => direction;
      game.update(step, STATIONS[station].forward, true);
      const shot = game.projectiles.lastFired, offset = sub(shot.position, STATIONS[station].position);
      assert.ok(Math.abs(offset.z) < .01, `fresh waist round must not jump ${speed * step}m toward the nose`);
      assert.ok(Math.abs(offset.x) > 14 && Math.abs(offset.x) < 15);
    }
  }
  finally { game.dispose(); }
});

test('upper turret fires at level and downward angles while heat still limits fire', () => {
  const game = new BomberGame(physics, random());
  try
  {
    game.start('relaxed'); game.setStation('top');
    game.targets = []; game.spawnClock = game.flakClock = 100;
    for (const y of [-.95, -.2, 0, .2])
    {
      const before = game.shots, direction = unit({ x: .4, y, z: -.5 });
      for (let i = 0; i < 10; i++) game.update(step, direction, true);
      assert.ok(game.shots > before, `no firing lockout at elevation ${y}`);
    }
    game.stationGuns.top.heat = 1; game.stationGuns.top.overheated = true;
    const before = game.shots;
    game.update(step, { x: 0, y: -.5, z: -.866 }, true);
    assert.equal(game.shots, before, 'overheat still blocks firing');
  }
  finally { game.dispose(); }
});

function nativeShot(origin, velocity, wind, altitude = ALTITUDE)
{
  const base = new physics.Bullet(BROWNING.mass, BROWNING.diameter, 0, BROWNING.bc, physics.DragFunction.G1);
  const p = new physics.Vector3D(origin.x, origin.y, origin.z), v = new physics.Vector3D(velocity.x, velocity.y, velocity.z);
  const w = new physics.Vector3D(wind.x, wind.y, wind.z), atmosphere = physics.Atmosphere.atAltitude(altitude);
  const bullet = new physics.Bullet(base, p, v, 0), simulator = new physics.BallisticsSimulator();
  simulator.setAtmosphere(atmosphere);
  simulator.setWind(w);
  simulator.setInitialBullet(bullet);
  simulator.simulate(1e8, 1 / 120, 1);
  const state = simulator.getCurrentBullet(), point = state.getPosition();
  const result = { x: point.x, y: point.y, z: point.z };
  for (const resource of [point, state, simulator, bullet, atmosphere, w, v, p, base]) resource.delete();
  return result;
}

test('moving-frame and inertial-world ballistics agree (inherited velocity counted once)', () => {
  const aircraft = { x: 12, y: 0, z: 91 }, wind = { x: 12, y: 0, z: -4 }, muzzle = { x: 880, y: 0, z: 0 };
  const world = nativeShot(zero, add(muzzle, aircraft), wind);
  const relative = nativeShot(zero, muzzle, sub(wind, aircraft));
  close(sub(world, aircraft), relative);
  assert.ok(relative.z < -3, 'waist-gun rounds must fall aft of the aircraft');
});

test('steady wind advects aircraft and bullet together; gusts produce additional drift', () => {
  const noWind = nativeShot(zero, { x: 0, y: 0, z: -785 }, zero);
  const wind = { x: 20, y: 0, z: 8 };
  close(sub(nativeShot(zero, add({ x: 0, y: 0, z: -785 }, wind), wind), wind), noWind);
  const gust = nativeShot(zero, { x: 0, y: 0, z: -785 }, { x: 15, y: 0, z: 0 });
  assert.ok(gust.x > .5);
});

test('altitude reduces drag, and forward/rearward shots have different relative trajectories', () => {
  const velocity = { x: 880, y: 0, z: 95 };
  assert.ok(nativeShot(zero, velocity, zero, 6000).x > nativeShot(zero, velocity, zero, 0).x + 20);
  const aft = nativeShot(zero, { x: 0, y: 0, z: -785 }, zero).z - 95;
  const nose = nativeShot(zero, { x: 0, y: 0, z: 975 }, zero).z - 95;
  assert.ok(-aft > nose + 10);
});

test('turning the bomber does not rotate or accelerate a round already in flight', () => {
  const straight = { time: 0, flight: new FormationFlight() }, turning = { time: 0, flight: new FormationFlight() };
  const a = new AirborneProjectiles(physics, straight), b = new AirborneProjectiles(physics, turning);
  try
  {
    a.fire(STATIONS.port.forward, STATIONS.port.position);
    b.fire(STATIONS.port.forward, STATIONS.port.position);
    for (let i = 0; i < 60; i++)
    {
      straight.time = turning.time = (i + 1) * step;
      straight.flight.position = scale(straight.flight.groundVelocity, straight.time);
      turning.flight.advance(step, 15 + turning.time);
      a.advance(step); b.advance(step);
    }
    close(a.lastFired.worldPosition, b.lastFired.worldPosition, .001);
    assert.ok(length(sub(a.lastFired.position, b.lastFired.position)) > 2, 'view coordinates should change during the turn');
  }
  finally { a.dispose(); b.dispose(); }
});

test('wing and fuselage collisions reject empty space around a fighter', () => {
  const target = { position: { ...zero }, previous: { ...zero }, heading: 0, pitch: 0, bank: 0 };
  assert.notEqual(fighterHit({ x: 0, y: 0, z: -20 }, { x: 0, y: 0, z: 20 }, target), null);
  assert.notEqual(fighterHit({ x: 4, y: 0, z: -20 }, { x: 4, y: 0, z: 20 }, target), null);
  assert.equal(fighterHit({ x: 4, y: 3, z: -20 }, { x: 4, y: 3, z: 20 }, target), null);
});

test('support rounds collide and score an allied kill without awarding player points', () => {
  const game = new BomberGame(physics, random());
  try
  {
    const target = game.targets[0];
    Object.assign(target, { position: { x: 0, y: 8, z: -150 }, previous: { x: 0, y: 8, z: -150 }, health: 1, heading: Math.PI, pitch: 0, bank: 0 });
    game.targets = [target];
    game.support.fire({ x: 0, y: 0, z: -1 }, { x: 0, y: 8, z: -20 });
    for (let i = 0; i < 30 && target.alive; i++) game.resolveRounds(game.support, false, step);
    assert.equal(target.alive, false);
    assert.equal(game.allyKills, 1);
    assert.equal(game.score, 0);
    assert.equal(game.destroyed, 0);
    game.damageFighter(target, true);
    assert.equal(game.score, 0);
  }
  finally { game.dispose(); }
});

test('healthy fighters survive multiple hits and award a kill only once', () => {
  const game = new BomberGame(physics, random());
  try
  {
    game.start('arcade');
    const target = game.targets[0], health = target.health;
    assert.ok(health >= 10);
    for (let i = 0; i < health - 1; i++) game.damageFighter(target, true);
    assert.equal(target.alive, true);
    assert.equal(game.destroyed, 0);
    assert.equal(target.health, 1);
    game.damageFighter(target, true);
    assert.equal(target.alive, false);
    assert.equal(game.destroyed, 1);
    assert.equal(game.score, 100);
    game.damageFighter(target, true);
    assert.equal(game.score, 100);
  }
  finally { game.dispose(); }
});

test('flak detonates in world space and can damage the player and a wingman', () => {
  const game = new BomberGame(physics, random());
  try
  {
    game.start('arcade'); game.flakClock = 100;
    for (const bomber of [game.player, game.allies[0]])
      game.flak.push({ worldPosition: game.flight.toWorld(bomber.position), delay: .01, life: 6, exploded: false });
    game.updateFlak(step);
    assert.equal(game.health, 111);
    assert.equal(game.allies[0].health, 66);
    assert.equal(game.events.filter(e => e.type === 'flakBurst').length, 2);
    game.updateFlak(step);
    assert.equal(game.health, 111, 'a burst must not damage twice');
  }
  finally { game.dispose(); }
});

test('all six stations fire from their own position and preserve independent heat', () => {
  const game = new BomberGame(physics, random());
  try
  {
    game.start('relaxed');
    game.targets = []; game.spawnClock = 100; game.flakClock = 100;
    for (const key of Object.keys(STATIONS))
    {
      game.setStation(key);
      const before = game.shots;
      for (let i = 0; i < 60; i++) game.update(step, STATIONS[key].forward, true);
      assert.ok(game.shots - before >= STATIONS[key].guns * 11);
      assert.ok(game.heat > 0);
      assert.ok(Number.isFinite(game.projectiles.lastFired.position.x));
    }
    game.stationGuns.tail.heat = .9;
    game.health = 50;
    game.setStation('nose'); game.setStation('tail');
    assert.equal(game.heat, .9);
    assert.equal(game.health, 50);
  }
  finally { game.dispose(); }
});

test('pause freezes flak, flight, damage and heat; restart restores formation', () => {
  const game = new BomberGame(physics, random());
  try
  {
    game.start('arcade');
    for (let i = 0; i < 600; i++) game.update(step, STATIONS.tail.forward, false);
    game.pause();
    const before = JSON.stringify({ t: game.time, p: game.flight.position, flak: game.flak, hp: game.health, guns: game.stationGuns });
    game.update(1, STATIONS.tail.forward, true);
    assert.equal(JSON.stringify({ t: game.time, p: game.flight.position, flak: game.flak, hp: game.health, guns: game.stationGuns }), before);
    game.resume(); game.allies[0].alive = false; game.health = 30;
    game.start('arcade');
    assert.equal(game.healthPercent, 100);
    assert.equal(game.allies.filter(a => a.alive).length, 4);
    assert.equal(game.flight.heading, 0);
    assert.equal(game.flak.length, 0);
    assert.equal(game.support.slots.filter(s => s.alive).length, 0);
  }
  finally { game.dispose(); }
});

test('full-round simulation has flak, allied kills, damage and bounded pools', () => {
  const game = new BomberGame(physics, random(), () => true);
  try
  {
    game.start('arcade');
    let flak = 0, maxTargets = 0, hit = false;
    for (let i = 0; i < 18001 && game.state === 'playing'; i++)
    {
      game.update(step, STATIONS.tail.forward, false);
      flak += game.events.filter(e => e.type === 'flakBurst').length;
      hit ||= game.healthPercent < 100;
      maxTargets = Math.max(maxTargets, game.targets.length);
      assert.ok(game.enemyShots.length <= 128 && game.flak.length <= 12);
      game.events.length = 0;
    }
    assert.equal(game.state, 'ended');
    assert.ok(flak > 5 && game.allyKills > 0 && hit);
    assert.ok(maxTargets <= 16);
    for (const pool of [game.projectiles, game.support, game.hostile]) assert.ok(pool.slots.length <= 320);
  }
  finally { game.dispose(); }
});

test('aim-ahead solution hits a constant-velocity target with airflow and banking', () => {
  const game = new BomberGame(physics, random());
  try
  {
    game.start('arcade');
    game.flight.advance(step, 15);
    game.setStation('port');
    const target = { id: 42, position: { x: -500, y: 30, z: -60 }, velocity: { x: 40, y: -2, z: -30 } };
    const origin = STATIONS.port.position;
    const solution = game.sight.solve(target, origin, game.flight, game.time);
    const expected = add(game.flight.toWorld(target.position), scale(game.flight.worldVelocity(target.velocity, target.position), solution.time));
    game.projectiles.fire(unit(sub(solution.position, origin)), origin);
    for (let t = 0; t < solution.time - 1e-7;)
    {
      const dt = Math.min(step, solution.time - t);
      game.time += dt; game.projectiles.advance(dt); t += dt;
    }
    close(game.projectiles.lastFired.worldPosition, expected, 1.2);
  }
  finally { game.dispose(); }
});

test('existing Coast and Trench modes still initialize, fire and dispose', () => {
  for (const Game of [ArcadeGame, TrenchGame])
  {
    const game = new Game(physics, random());
    try
    {
      game.start('arcade');
      for (let i = 0; i < 120; i++) game.update(step, { x: 0, y: .1, z: -.995 }, true);
      assert.ok(game.shots > 0 && Number.isFinite(game.healthPercent));
      game.pause(); game.resume(); game.stop();
    }
    finally { game.dispose(); }
  }
});
