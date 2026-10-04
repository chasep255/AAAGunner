import test from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';
import createPhysics from '../build/physics.js';
import { A10Game, tankHit, JDAM_RELOAD } from '../web/src/a10/game.js';
import { AttackFlight, COMBAT_RADIUS, add, sub, scale, length, unit, terrainHeight, groundContact } from '../web/src/a10/flight.js';
import * as THREE from '../web/vendor/three/three.module.js';
register('./three-loader.js', import.meta.url);
const { A10View } = await import('../web/src/a10/scene.js');
const physics = await createPhysics();
const dt = 1 / 60;
const random = (seed = 7) => () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
function game(t)
{
  const g = new A10Game(physics, random());
  g.start('relaxed');
  t.after(() => g.dispose());
  return g;
}
const run = (g, seconds, fire = false) => { for (let i = 0; i < seconds / dt; i++) { g.update(dt, g.flight.forward, fire); g.events.length = 0; } };

test('mouse and keys steer, throttle is bounded, centering levels the aircraft', () => {
  const f = new AttackFlight();
  for (let i = 0; i < 180; i++) f.update(dt, { x: .6, y: .3, faster: true });
  assert.ok(f.position.x > 40 && f.position.y > 300, 'mouse right/up turns right and climbs');
  assert.ok(f.speed > 145 && f.throttle <= 1);
  for (let i = 0; i < 180; i++) f.update(dt, {});
  assert.ok(Math.abs(f.bank) < .001 && Math.abs(f.pitch) < .001);
  for (let i = 0; i < 600; i++) f.update(dt, { slower: true, left: true });
  assert.equal(f.throttle, 0);
  assert.ok(f.speed >= 95 && f.bank > 0);
});

test('edge assist brings aircraft back into the combat area without teleporting', () => {
  const f = new AttackFlight();
  f.position = { x: COMBAT_RADIUS + 20, y: 250, z: 0 };
  f.heading = -Math.PI / 2;
  let maximumStep = 0;
  for (let i = 0; i < 1800; i++) { const p = { ...f.position }; f.update(dt, {}); maximumStep = Math.max(maximumStep, length(sub(f.position, p))); }
  assert.ok(Math.hypot(f.position.x, f.position.z) < COMBAT_RADIUS);
  assert.ok(maximumStep < 4);
});

test('swept tank collisions reject rounds above armor and resolve moving targets', () => {
  const tank = { position: { x: 0, y: 14, z: 0 }, previous: { x: 0, y: 14, z: 0 }, heading: 0 };
  assert.notEqual(tankHit({ x: 0, y: 14, z: 30 }, { x: 0, y: 14, z: -30 }, tank), null);
  assert.equal(tankHit({ x: 0, y: 20, z: 30 }, { x: 0, y: 20, z: -30 }, tank), null);
  tank.previous.x = -20; tank.position.x = 20;
  assert.notEqual(tankHit({ x: 0, y: 14, z: 10 }, { x: 0, y: 14, z: -10 }, tank), null);
});

test('cannon rounds inherit velocity, fly in any direction and ignore later aircraft turns', t => {
  const g = game(t);
  g.flight.position = { x: 3000, y: 600, z: -4000 };
  g.flight.heading = Math.PI;
  g.flight.velocity = scale(g.flight.forward, 150);
  g.advanceWeapons(dt, true);
  const shot = g.projectiles.lastFired;
  const start = { ...shot.position };
  g.flight.heading = -Math.PI / 2;
  g.advanceWeapons(dt, false);
  assert.ok(shot.position.z > start.z + 18, 'forward +Z shot includes aircraft velocity');
  assert.ok(Math.abs(shot.position.x - start.x) < .1, 'turn does not rotate an airborne round');
});

test('a strafing burst damages and destroys a tank once, with gun accuracy credit', t => {
  const g = game(t);
  const target = g.targets[0];
  g.targets = [target];
  g.flight.position = { x: target.position.x, y: target.position.y + 50, z: target.position.z + 250 };
  g.flight.pitch = Math.atan2(-50, 250);
  g.flight.velocity = scale(g.flight.forward, 145);
  for (let i = 0; i < 100; i++) g.advanceWeapons(dt, true);
  assert.equal(target.alive, false);
  assert.equal(g.destroyed, 1);
  assert.equal(g.hits, 8);
  assert.equal(g.score, 150);
});

test('JDAM captures coordinates, impacts armor, consumes ammunition and rearms', t => {
  const g = game(t), tank = g.targets[0];
  g.targets = [tank];
  assert.equal(g.jdamTarget(), tank);
  assert.equal(g.dropJdam(), true);
  assert.equal(g.missileAmmo, 3);
  assert.equal(g.dropJdam(), false, 'release spacing');
  const bomb = g.bombs[0];
  assert.notEqual(bomb.destination, tank.position);
  const destination = { ...bomb.destination };
  for (let i = 0; i < 1000 && g.bombs.length; i++) g.advanceWeapons(dt, false);
  assert.equal(g.bombs.length, 0);
  assert.equal(tank.alive, false);
  assert.equal(g.hits, 0, 'bomb hits do not count as cannon accuracy');
  assert.deepEqual(bomb.destination, destination);
  run(g, JDAM_RELOAD + .1);
  assert.equal(g.missileAmmo, 4);
  assert.equal(g.missileCooldown, 0);
});

test('JDAM requires altitude, a live target, ammunition and playing state', t => {
  const g = game(t);
  g.flight.position.y = terrainHeight(g.flight.position.x, g.flight.position.z) + 30;
  assert.equal(g.dropJdam(), false);
  g.flight.position.y = 270;
  g.missileAmmo = 0;
  assert.equal(g.dropJdam(), false);
  g.missileAmmo = 4;
  g.pause();
  assert.equal(g.dropJdam(), false);
  g.resume();
  g.targets.forEach(t => t.alive = false);
  assert.equal(g.dropJdam(), false);
  assert.equal(g.missileAmmo, 4);
});

test('JDAM glide guidance reaches marked coordinates at low and high altitude', t => {
  const g = game(t);
  for (const [altitude, range] of [[80, 2200], [250, 1300], [800, 2200]])
  {
    g.start('relaxed');
    const tank = g.targets[0]; g.targets = [tank];
    g.flight.position = { x: 0, y: terrainHeight(0, range) + altitude, z: range };
    assert.equal(g.dropJdam(), true, `release at ${altitude}m / ${range}m`);
    for (let i = 0; i < 1800 && g.bombs.length; i++) g.advanceWeapons(dt, false);
    assert.equal(tank.alive, false, `impact at ${altitude}m / ${range}m`);
  }
});

test('released JDAM does not follow a tank that moves away from its coordinates', t => {
  const g = game(t), tank = g.targets[0]; g.targets = [tank];
  g.dropJdam();
  const destination = { ...g.bombs[0].destination };
  tank.position.x += 160; tank.previous = { ...tank.position };
  for (let i = 0; i < 1000 && g.bombs.length; i++) g.advanceWeapons(dt, false);
  assert.ok(g.events.some(e => e.type === 'bombImpact' && length(sub(e.position, destination)) < 10));
  assert.ok(tank.alive);
});

test('tank fire is simulated, can hit, and can be evaded', t => {
  const g = game(t), tank = g.targets[0];
  g.targets = [tank];
  for (let i = 0; i < 600; i++) g.moveTanks(dt);
  assert.ok(g.enemyShots.length > 0);
  assert.ok(g.enemyShots.every(s => length(s.velocity) > 430));
  const p = g.flight.position;
  g.enemyShots = [{ position: add(p, { x: -12, y: 0, z: 0 }), previous: {}, velocity: { x: 1440, y: 0, z: 0 }, age: 0, alive: true, launched: true }];
  g.flight.previous = { ...p };
  g.advanceWeapons(dt, false);
  assert.equal(g.health, 95);
  g.enemyShots = [{ position: add(p, { x: -12, y: 50, z: 0 }), previous: {}, velocity: { x: 1440, y: 0, z: 0 }, age: 0, alive: true, launched: true }];
  g.advanceWeapons(dt, false);
  assert.equal(g.health, 95, 'a missed shot causes no damage');
});

test('pause freezes flight and combat; stop and restart clear weapons and restore health', t => {
  const g = game(t);
  g.dropJdam();
  g.update(dt, g.flight.forward, true);
  g.pause();
  const snapshot = JSON.stringify([g.flight, g.time, g.health, g.heat, g.missileCooldown, g.bombs, g.enemyShots]);
  run(g, 2, true);
  assert.equal(JSON.stringify([g.flight, g.time, g.health, g.heat, g.missileCooldown, g.bombs, g.enemyShots]), snapshot);
  g.resume(); g.update(dt, g.flight.forward, true);
  assert.ok(g.time > dt);
  g.stop(); assert.equal(g.bombs.length, 0); assert.equal(g.enemyShots.length, 0);
  assert.ok(g.projectiles.slots.every(s => !s.alive));
  g.start('frenzy');
  assert.equal(g.health, 100); assert.equal(g.shots, 0); assert.equal(g.missileAmmo, 4);
  assert.equal(g.targets.length, 14); assert.deepEqual(g.input, {});
});

test('terrain contact, overheating, death and round success have distinct outcomes', t => {
  const g = game(t);
  g.targets = [];
  for (let i = 0; i < 310; i++) g.advanceWeapons(dt, true);
  assert.ok(g.overheated);
  const shots = g.shots;
  for (let i = 0; i < 60; i++) g.advanceWeapons(dt, true);
  assert.equal(g.shots, shots);
  for (let i = 0; i < 240; i++) g.advanceWeapons(dt, false);
  assert.equal(g.overheated, false);
  g.flight.position.y = 0; g.update(dt, g.flight.forward, false);
  assert.equal(g.endReason, 'crashed');
  g.start('arcade'); g.damagePlayer(100);
  assert.equal(g.endReason, 'shotDown');
  g.start('arcade'); g.time = 300 - dt / 2; g.update(dt, g.flight.forward, false);
  assert.equal(g.endReason, 'survived');
  assert.notEqual(groundContact({ x: 0, y: 100, z: 0 }, { x: 0, y: -100, z: 0 }), null);
});

test('chase camera and gun sight align through turns, and muzzle reset preserves the nose', t => {
  const g = game(t), view = Object.create(A10View.prototype);
  view.scene = new THREE.Scene(); view.glowTexture = null;
  view.camera = new THREE.PerspectiveCamera(58, 1.5, .1, 18000);
  view.flightDirection = new THREE.Vector3(); view.aim = new THREE.Vector3();
  view.buildTurret();
  for (const heading of [-2, 0, 1.2]) for (const pitch of [-.3, 0, .3])
  {
    g.flight.heading = heading; g.flight.pitch = pitch; g.flight.bank = -.8;
    view.syncFlight(g);
    const end = add(g.flight.muzzle, scale(g.flight.forward, 1800));
    const hit = groundContact(g.flight.muzzle, end);
    const p = hit === null ? end : add(g.flight.muzzle, scale(sub(end, g.flight.muzzle), hit));
    const projected = new THREE.Vector3().copy(p).project(view.camera), reticle = view.reticleAt();
    assert.ok(Math.abs(reticle.x - projected.x) < 1e-8 && Math.abs(reticle.y - projected.y) < 1e-8);
    const meshForward = new THREE.Vector3(0, 0, -1).applyQuaternion(view.aircraft.quaternion);
    assert.ok(meshForward.distanceTo(new THREE.Vector3().copy(g.flight.forward)) < 1e-8);
    view.aircraft.updateMatrixWorld(true);
    const tip = view.cannons[0].localToWorld(new THREE.Vector3(0, 0, -.6));
    assert.ok(tip.distanceTo(new THREE.Vector3().copy(g.flight.muzzle)) < 1e-8);
  }
  view.missileSmoke = { clear() {} }; view.smoke = []; view.particles = []; view.explosions = [];
  const gunPosition = view.cannons[0].position.clone(); view.clearEffects();
  assert.ok(view.cannons[0].position.equals(gunPosition));
});

test('full patrol retains finite flight state and bounded combat pools through all waves', t => {
  const g = game(t);
  g.start('frenzy');
  let peakTanks = 0, peakShots = 0;
  for (let i = 0; i < 18002 && g.state === 'playing'; i++)
  {
    // Keep the test pilot alive to exercise all waves and arena return assistance.
    g.health = 100;
    if (i % 1000 === 0) g.dropJdam();
    g.update(dt, g.flight.forward, i % 300 < 45);
    g.events.length = 0;
    peakTanks = Math.max(peakTanks, g.targets.length);
    peakShots = Math.max(peakShots, g.enemyShots.length);
    assert.ok(Number.isFinite(length(g.flight.position)));
    assert.ok(g.flight.altitude > 4);
    assert.ok(g.projectiles.slots.length <= 320 && g.bombs.length <= 8);
  }
  assert.equal(g.endReason, 'survived');
  assert.equal(g.wave, 3);
  assert.ok(peakTanks <= 26 && peakShots <= 128);
});
