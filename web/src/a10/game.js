import { ProjectilePool, ROUND_SECONDS, MAX_ENEMY_SHOTS, sweptHit } from '../game.js';
import { AttackFlight, terrainHeight, groundContact, add, sub, scale, unit, length, dot, clamp } from './flight.js';

// Fictional game tuning, not a weapons or flight-performance model.
export const A10_AMMO = { mass: .39, diameter: .03, bc: .8, muzzleVelocity: 1020 };
export const JDAM_CAPACITY = 4;
export const JDAM_RELOAD = 16;
const TUNING = {
  relaxed: { count: 7, interval: 6, damage: 5, spread: 24 },
  arcade: { count: 10, interval: 4.3, damage: 8, spread: 15 },
  frenzy: { count: 14, interval: 3, damage: 11, spread: 9 }
};

export function tankHit(a, b, tank)
{
  // Hull-sized ellipsoid, swept with the moving tank. No oversized sphere above it.
  const local = (p, center) => {
    const d = sub(p, center), c = Math.cos(tank.heading), s = Math.sin(tank.heading);
    return { x: (c * d.x - s * d.z) / 3.4, y: d.y / 2.6, z: (s * d.x + c * d.z) / 5.6 };
  };
  const zero = { x: 0, y: 0, z: 0 };
  return sweptHit(local(a, tank.previous), local(b, tank.position), zero, zero, 1);
}

export class A10Game
{
  constructor(physics, random = Math.random)
  {
    this.random = random;
    this.audioProfile = 'a10';
    // Native range checks assume -Z travel. Cull ourselves by distance from launch.
    this.projectiles = new ProjectilePool(physics, { ammo: A10_AMMO, speed: A10_AMMO.muzzleVelocity, range: 1e8, lifetime: 3, altitude: 300 });
    this.events = [];
    this.nextId = 0;
    this.start('arcade');
    this.state = 'ready';
    this.events.length = 0;
  }

  start(difficulty)
  {
    this.tuning = TUNING[difficulty] || TUNING.arcade;
    this.flight = new AttackFlight();
    this.input = {};
    this.projectiles.clear();
    this.targets = [];
    this.enemyShots = [];
    this.bombs = [];
    this.missiles = [];
    this.flares = [];
    this.events.length = 0;
    this.time = this.score = this.hits = this.shots = this.destroyed = this.combo = this.bestCombo = 0;
    this.heat = this.spool = this.shotClock = this.spawnClock = this.releaseCooldown = 0;
    this.missileAmmo = JDAM_CAPACITY;
    this.missileCooldown = 0;
    this.lastKill = -100;
    this.health = 100;
    this.overheated = false;
    this.endReason = null;
    this.state = 'playing';
    // An immediately visible first pass; the rest are distributed around the valley.
    this.spawnTank(0, 0);
    this.spawnTank(-110, -150);
    this.spawnTank(130, -230);
    while (this.targets.length < this.tuning.count) this.spawnTank();
  }

  get remaining() { return Math.max(0, ROUND_SECONDS - this.time); }
  get wave() { return Math.min(3, 1 + Math.floor(this.time / 100)); }
  get accuracy() { return this.shots ? Math.round(this.hits / this.shots * 100) : 0; }
  get healthPercent() { return this.health; }
  get regenerating() { return false; }

  spawnTank(x, z)
  {
    if (x === undefined)
    {
      const angle = this.random() * Math.PI * 2, radius = 500 + this.random() * 2600;
      x = Math.sin(angle) * radius; z = Math.cos(angle) * radius;
    }
    const position = { x, y: terrainHeight(x, z) + 2, z };
    this.targets.push({ id: ++this.nextId, kind: 'tank', alive: true, position, previous: { ...position }, home: { ...position },
      velocity: { x: 0, y: 0, z: 0 }, heading: this.random() * Math.PI * 2, pitch: 0, bank: 0,
      health: 100, maxHealth: 100, age: 0, deadAge: 0, muzzleFlash: 0, hitFlash: 0, tracking: 0,
      cooldown: 2 + this.random() * this.tuning.interval, aim: { x: 0, y: 0, z: -1 } });
  }

  jdamTarget()
  {
    if (this.flight.altitude < 65) return null;
    let best = null, alignment = Math.cos(.48);
    for (const tank of this.targets)
    {
      if (!tank.alive) continue;
      const offset = sub(tank.position, this.flight.position), distance = length(offset);
      const score = dot(unit(offset), this.flight.forward);
      if (distance > 2400 || distance < 180 || score <= alignment) continue;
      // Terrain may hide a target behind a ridge.
      if (groundContact(this.flight.position, tank.position) !== null) continue;
      best = tank; alignment = score;
    }
    return best;
  }

  dropJdam()
  {
    if (this.state !== 'playing') return false;
    const target = this.jdamTarget();
    if (!target || this.missileAmmo <= 0 || this.releaseCooldown > 0 || this.bombs.length >= 8)
    {
      this.events.push({ type: 'a10Notice', message: this.missileAmmo <= 0 ? 'JDAM RACK EMPTY · REARMING' : this.releaseCooldown > 0 ? 'WAIT FOR RELEASE' : this.flight.altitude < 65 ? 'JDAM · CLIMB ABOVE 65 M' : 'JDAM · POINT NOSE AT A TANK WITHIN 2.4 KM' });
      return false;
    }
    this.missileAmmo--;
    if (this.missileCooldown <= 0) this.missileCooldown = JDAM_RELOAD;
    this.releaseCooldown = 1.1;
    const position = this.flight.toWorld({ x: this.bombs.length % 2 ? -4 : 4, y: -1.5, z: 0 });
    const destination = { x: target.position.x, y: terrainHeight(target.position.x, target.position.z), z: target.position.z };
    const velocity = { ...this.flight.velocity, y: Math.min(-8, this.flight.velocity.y - 8) };
    const height = Math.max(1, position.y - destination.y);
    // Arcade glide assist extends the descent for distant marked coordinates.
    // It is bounded guidance, not a free-fall bomb or a real JDAM flight model.
    const duration = clamp(Math.max((velocity.y + Math.sqrt(velocity.y ** 2 + 2 * 9.81 * height)) / 9.81, length(sub(destination, position)) / 220), 2, 25);
    velocity.y = Math.max(velocity.y, -height / duration);
    // Fixed coordinates are captured at release; moving armor can leave the blast.
    this.bombs.push({ id: ++this.nextId, alive: true, age: 0, duration, position, previous: { ...position }, velocity, destination });
    this.events.push({ type: 'jdamRelease' });
    return true;
  }

  damageTank(tank, damage, gun = false)
  {
    if (!tank.alive) return;
    tank.health = Math.max(0, tank.health - damage);
    tank.hitFlash = .15;
    if (gun) { this.hits++; this.events.push({ type: 'hit', position: { ...tank.position } }); }
    if (tank.health > 0) return;
    tank.alive = false;
    tank.muzzleFlash = 0;
    this.destroyed++;
    this.combo = this.time - this.lastKill < 8 ? Math.min(5, this.combo + 1) : 1;
    this.bestCombo = Math.max(this.bestCombo, this.combo);
    this.lastKill = this.time;
    const points = 150 * this.combo;
    this.score += points;
    this.events.push({ type: 'destroyed', kind: 'tank', position: { ...tank.position }, points });
  }

  damagePlayer(amount)
  {
    if (this.state !== 'playing') return;
    this.health = Math.max(0, this.health - amount);
    this.events.push({ type: 'damage' });
    if (this.health <= 0) this.end('shotDown');
  }

  moveTanks(dt)
  {
    for (const tank of this.targets)
    {
      tank.previous = { ...tank.position };
      tank.muzzleFlash = Math.max(0, tank.muzzleFlash - dt);
      tank.hitFlash = Math.max(0, tank.hitFlash - dt);
      if (!tank.alive) { tank.deadAge += dt; continue; }
      tank.age += dt;
      tank.heading += Math.sin(tank.age * .15 + tank.id) * dt * .1;
      if (length(sub(tank.position, tank.home)) > 220) tank.heading += dt * .5;
      tank.velocity = { x: -Math.sin(tank.heading) * 3.5, y: 0, z: -Math.cos(tank.heading) * 3.5 };
      tank.position = add(tank.position, scale(tank.velocity, dt));
      tank.position.y = terrainHeight(tank.position.x, tank.position.z) + 2;
      const offset = sub(this.flight.position, tank.position), distance = length(offset);
      tank.aim = unit(offset);
      const clear = distance < 1900 && groundContact(tank.position, this.flight.position) === null;
      tank.tracking = clear ? tank.tracking + dt : 0;
      tank.cooldown -= dt;
      if (tank.tracking < 2 || tank.cooldown > 0 || this.enemyShots.length >= MAX_ENEMY_SHOTS) continue;
      tank.cooldown = (this.tuning.interval + this.random() * 1.8) / (1 + (this.wave - 1) * .16);
      const speed = 440, travel = distance / speed;
      const aim = add(this.flight.position, scale(this.flight.velocity, travel));
      aim.x += (this.random() - .5) * this.tuning.spread;
      aim.z += (this.random() - .5) * this.tuning.spread;
      aim.y += .5 * 9.81 * travel * travel + (this.random() - .5) * this.tuning.spread;
      tank.aim = unit(sub(aim, tank.position));
      const position = add(tank.position, scale(tank.aim, 6));
      this.enemyShots.push({ position, previous: { ...position }, velocity: scale(tank.aim, speed), age: 0, launched: true, alive: true });
      tank.muzzleFlash = .3;
      this.events.push({ type: 'tankShot', position: { ...tank.position } });
    }
    this.targets = this.targets.filter(t => t.alive || t.deadAge < 30);
  }

  advanceWeapons(dt, firing)
  {
    const shooting = firing && !this.overheated;
    this.spool += ((shooting ? 1 : 0) - this.spool) * Math.min(1, dt * 12);
    this.heat = clamp(this.heat + (shooting ? .2 : -.24) * dt, 0, 1);
    if (this.heat >= 1) this.overheated = true;
    if (this.heat < .3) this.overheated = false;
    this.projectiles.advance(dt);
    for (const shot of this.projectiles.slots)
    {
      if (!shot.alive) continue;
      const ground = groundContact(shot.previous, shot.position);
      let first = ground ?? Infinity, victim = null;
      for (const tank of this.targets)
      {
        if (!tank.alive) continue;
        const contact = tankHit(shot.previous, shot.position, tank);
        if (contact !== null && contact < first) { first = contact; victim = tank; }
      }
      if (first !== Infinity)
      {
        shot.alive = false;
        const position = add(shot.previous, scale(sub(shot.position, shot.previous), first));
        this.events.push({ type: 'shellImpact', position });
        if (victim) this.damageTank(victim, 14, true);
      }
      else if (shot.age > 3 || length(sub(shot.position, shot.origin)) > 2000) shot.alive = false;
    }
    if (shooting && !this.overheated)
    {
      this.shotClock += dt;
      while (this.shotClock >= 1 / 60)
      {
        this.shotClock -= 1 / 60;
        const direction = unit(add(this.flight.forward, { x: (this.random() - .5) * .004, y: (this.random() - .5) * .004, z: (this.random() - .5) * .004 }));
        if (this.projectiles.fire(direction, this.flight.muzzle, 0, this.flight.velocity))
        {
          this.projectiles.lastFired.origin = { ...this.flight.muzzle };
          this.shots++;
          this.events.push({ type: 'shot', barrel: 0 });
        }
      }
    }
    else this.shotClock = 0;

    for (const shot of this.enemyShots)
    {
      shot.previous = { ...shot.position };
      shot.velocity.y -= 9.81 * dt;
      shot.position = add(shot.position, scale(shot.velocity, dt));
      shot.age += dt;
      const hit = sweptHit(shot.previous, shot.position, this.flight.previous, this.flight.position, 7);
      const ground = groundContact(shot.previous, shot.position);
      if (hit !== null && (ground === null || hit < ground)) { this.damagePlayer(this.tuning.damage); shot.alive = false; }
      else if (ground !== null || shot.age > 7) shot.alive = false;
    }
    this.enemyShots = this.enemyShots.filter(s => s.alive);
    for (const bomb of this.bombs)
    {
      bomb.previous = { ...bomb.position };
      const remaining = Math.max(.2, bomb.duration - bomb.age);
      for (const axis of ['x', 'y', 'z']) bomb.velocity[axis] += clamp(2 * (bomb.destination[axis] - bomb.position[axis] - bomb.velocity[axis] * remaining) / remaining ** 2, -65, 65) * dt;
      bomb.position = add(bomb.position, scale(bomb.velocity, dt));
      bomb.age += dt;
      const contact = groundContact(bomb.previous, bomb.position);
      if (contact !== null)
      {
        bomb.alive = false;
        const position = add(bomb.previous, scale(sub(bomb.position, bomb.previous), contact));
        this.events.push({ type: 'bombImpact', position });
        for (const tank of this.targets)
        {
          const distance = length(sub(tank.position, position));
          if (tank.alive && distance < 70) this.damageTank(tank, 230 * (1 - distance / 70));
        }
        const distance = length(sub(this.flight.position, position));
        if (distance < 85) this.damagePlayer(80 * (1 - distance / 85));
      }
      if (bomb.age > 30) bomb.alive = false;
    }
    this.bombs = this.bombs.filter(b => b.alive);
  }

  update(dt, _direction, firing)
  {
    if (this.state !== 'playing') return;
    this.time += dt;
    this.flight.update(dt, this.input);
    if (this.flight.altitude <= 4) { this.health = 0; this.end('crashed'); return; }
    this.moveTanks(dt);
    this.advanceWeapons(dt, firing);
    if (this.state !== 'playing') return;
    this.releaseCooldown = Math.max(0, this.releaseCooldown - dt);
    if (this.missileAmmo < JDAM_CAPACITY)
    {
      this.missileCooldown -= dt;
      if (this.missileCooldown <= 0) { this.missileAmmo++; this.missileCooldown = this.missileAmmo < JDAM_CAPACITY ? JDAM_RELOAD : 0; }
    }
    if (this.time - this.lastKill > 8) this.combo = 0;
    this.spawnClock -= dt;
    if (this.spawnClock <= 0)
    {
      this.spawnClock = 5;
      if (this.targets.filter(t => t.alive).length < this.tuning.count + (this.wave - 1) * 3) this.spawnTank();
    }
    if (this.remaining <= 0) this.end('survived');
  }

  pause() { if (this.state === 'playing') this.state = 'paused'; }
  resume() { if (this.state === 'paused') this.state = 'playing'; }
  stop()
  {
    this.state = 'ready'; this.projectiles.clear(); this.enemyShots = []; this.bombs = []; this.events.length = 0; this.spool = 0; this.input = {};
  }
  end(reason)
  {
    if (this.state !== 'playing') return;
    this.state = 'ended'; this.endReason = reason; this.spool = 0;
    this.events.push({ type: 'ended' });
  }
  dispose() { this.projectiles.dispose(); }
}
