import { ROUND_SECONDS, sweptHit } from '../game.js';
import { AirborneProjectiles } from './projectiles.js';
import { RANGE, STATIONS, FormationFlight, AirborneSight, add, sub, scale, length, unit, dot, clamp, sectorOf } from './flight.js';

const TUNING = {
  relaxed: { count: 4, interval: 7, damage: 1.8, spread: .021 },
  arcade: { count: 5, interval: 5, damage: 2.5, spread: .016 },
  frenzy: { count: 7, interval: 3.5, damage: 3.3, spread: .012 }
};
const ZERO = { x: 0, y: 0, z: 0 };
const MAX_HULL = 120;

function localPoint(point, center, target)
{
  const p = sub(point, center), h = target.heading, pitch = target.pitch, bank = target.bank;
  const x = Math.cos(h) * p.x - Math.sin(h) * p.z;
  const z = Math.sin(h) * p.x + Math.cos(h) * p.z;
  const y = Math.cos(pitch) * p.y + Math.sin(pitch) * z;
  return { x: Math.cos(bank) * x + Math.sin(bank) * y, y: -Math.sin(bank) * x + Math.cos(bank) * y, z: -Math.sin(pitch) * p.y + Math.cos(pitch) * z };
}

// Swept ellipsoids for the body, main wings and tail, in aircraft coordinates.
export function fighterHit(a, b, target)
{
  const from = localPoint(a, target.previous, target), to = localPoint(b, target.position, target);
  let first = null;
  for (const [center, size] of [[ZERO, { x: .95, y: 1, z: 5.1 }],
    [{ x: 0, y: 0, z: 0 }, { x: 5.8, y: .4, z: 1.25 }],
    [{ x: 0, y: .3, z: 3.8 }, { x: 2.3, y: .5, z: 1 }]])
  {
    const scaled = p => ({ x: (p.x - center.x) / size.x, y: (p.y - center.y) / size.y, z: (p.z - center.z) / size.z });
    const t = sweptHit(scaled(from), scaled(to), ZERO, ZERO, 1);
    if (t !== null && (first === null || t < first)) first = t;
  }
  return first;
}

export class BomberGame
{
  constructor(physics, random = Math.random, isVisible = () => true, muzzlePosition = null)
  {
    this.random = random;
    this.isVisible = isVisible;
    this.muzzlePosition = muzzlePosition;
    this.audioProfile = 'b17';
    this.station = 'tail';
    this.airspeed = 95;
    this.time = 0;
    this.flight = new FormationFlight(this.airspeed);
    this.projectiles = new AirborneProjectiles(physics, this);
    this.support = new AirborneProjectiles(physics, this);
    this.hostile = new AirborneProjectiles(physics, this, 790);
    this.sight = new AirborneSight(physics, this.projectiles);
    this.events = [];
    this.nextId = 0;
    this.start('arcade');
    this.state = 'ready';
    this.events.length = 0;
  }

  start(difficulty)
  {
    this.tuning = TUNING[difficulty] || TUNING.arcade;
    this.flight = new FormationFlight(this.airspeed);
    for (const pool of [this.projectiles, this.support, this.hostile]) pool.clear();
    this.targets = [];
    this.enemyShots = [];
    this.missiles = [];
    this.bombs = [];
    this.flares = [];
    this.missileAmmo = this.missileCooldown = 0;
    this.events.length = 0;
    this.time = this.score = this.hits = this.shots = this.destroyed = this.allyKills = this.combo = this.bestCombo = 0;
    this.lastKill = -100;
    this.health = MAX_HULL;
    this.endReason = null;
    this.spool = 0;
    this.stationGuns = Object.fromEntries(Object.keys(STATIONS).map(key => [key, { heat: 0, overheated: false }]));
    this.nextBarrel = this.shotClock = this.spawnSector = 0;
    this.spawnClock = 5;
    this.flakClock = 3;
    this.flak = [];
    this.player = { id: 'player', alive: true, position: { x: 0, y: 8, z: 0 }, previous: { x: 0, y: 8, z: 0 }, radius: 4 };
    this.allies = [[-43, -9, -122], [53, 15, -165], [-65, 22, 160], [75, -15, 210]].map(([x, y, z], i) => ({
      id: `bomber-${i}`, position: { x, y: 8 + y, z }, previous: { x, y: 8 + y, z }, home: { x, y: 8 + y, z }, velocity: { ...ZERO },
      alive: true, health: 75, radius: 5, flash: 0, cooldown: .3 + i * .6, burst: 0, deadAge: 0, aim: { x: 0, y: 0, z: -1 }
    }));
    this.state = 'playing';
    this.spawnTarget(this.station, 430);
    this.spawnTarget(this.station, 620);
    this.spawnTarget(this.station === 'port' ? 'starboard' : 'port', 650);
    this.spawnTarget(this.station === 'starboard' ? 'nose' : 'starboard', 850);
  }

  get remaining() { return Math.max(0, ROUND_SECONDS - this.time); }
  get wave() { return Math.min(3, 1 + Math.floor(this.time / 100)); }
  get accuracy() { return this.shots ? Math.round(100 * this.hits / this.shots) : 0; }
  get healthPercent() { return this.health / MAX_HULL * 100; }
  get regenerating() { return false; }
  get heat() { return this.stationGuns[this.station].heat; }
  get overheated() { return this.stationGuns[this.station].overheated; }

  setStation(key)
  {
    if (!Object.hasOwn(STATIONS, key)) return;
    this.station = key;
    this.shotClock = this.nextBarrel = this.spool = 0;
  }

  spawnTarget(sector = Object.keys(STATIONS)[this.spawnSector++ % Object.keys(STATIONS).length], initialDistance = null)
  {
    const forward = STATIONS[sector].forward;
    const right = { x: -forward.z, y: 0, z: forward.x };
    const distance = initialDistance ?? 650 + this.random() * 350;
    const position = add(add(scale(forward, distance), scale(right, (this.random() - .5) * distance * .28)), { x: 0, y: 8 + (this.random() - .5) * distance * .16, z: 0 });
    const victims = [this.player, ...this.allies.filter(a => a.alive)];
    const victim = this.random() < .48 ? this.player : victims[Math.floor(this.random() * victims.length)];
    const direction = unit(sub(victim.position, position));
    const health = this.nextId % 2 ? 12 : 10;
    this.targets.push({ id: ++this.nextId, kind: this.nextId % 2 ? 'bf109' : 'fw190', alive: true, health, maxHealth: health, hitFlash: 0, position, previous: { ...position },
      velocity: sub(scale(direction, 175), { x: 0, y: 0, z: this.airspeed }), worldVelocity: add(this.flight.rotate(scale(direction, 175)), this.flight.meanWind), heading: Math.atan2(-direction.x, -direction.z), pitch: Math.asin(direction.y), bank: 0,
      direction, victim, phase: 'approach', age: 0, phaseAge: 0, seen: 0, cooldown: 1, muzzleFlash: 0, burst: 0, deadAge: 0,
      side: this.random() < .5 ? -1 : 1 });
    this.events.push({ type: 'fighterInbound', sector });
  }

  spread(direction, amount)
  {
    const right = unit({ x: -direction.z, y: 0, z: direction.x });
    const up = { x: -direction.y * right.z, y: direction.z * right.x - direction.x * right.z, z: direction.y * right.x };
    const angle = this.random() * Math.PI * 2, radius = Math.sqrt(this.random()) * amount;
    return unit(add(direction, add(scale(right, Math.cos(angle) * radius), scale(up, Math.sin(angle) * radius))));
  }

  moveTarget(target, dt)
  {
    target.previous = { ...target.position };
    target.position = this.flight.carryPoint(target.position);
    target.direction = this.flight.carryDirection(target.direction);
    target.age += dt;
    target.phaseAge += dt;
    target.muzzleFlash = Math.max(0, target.muzzleFlash - dt);
    target.hitFlash = Math.max(0, target.hitFlash - dt);
    if (!target.alive)
    {
      target.deadAge += dt;
      target.worldVelocity.y -= 18 * dt;
      target.position = add(target.position, scale(this.flight.rotate(target.worldVelocity, -this.flight.heading), dt));
      target.velocity = scale(sub(target.position, target.previous), 1 / dt);
      target.bank += target.side * dt * 1.5;
      target.pitch -= dt * .15;
      return;
    }
    if (!target.victim.alive) target.victim = this.player;
    const offset = sub(target.victim.position, target.position), distance = length(offset);
    if (target.phase === 'approach' && (distance < 125 || target.phaseAge > 22))
    {
      target.phase = 'break';
      target.phaseAge = 0;
      target.escape = unit(add(scale(target.direction, .35), { x: target.direction.z * target.side, y: target.side * .3, z: -target.direction.x * target.side }));
    }
    const desired = target.phase === 'approach' ? unit(sub(offset, scale(target.velocity, distance / 850))) : target.escape;
    const oldHeading = target.heading;
    target.direction = unit(add(target.direction, scale(sub(desired, target.direction), Math.min(1, dt * .6))));
    // Aircraft nose follows its air velocity, not its velocity relative to our
    // camera. A head-on fighter closes much faster than one chasing the tail.
    const enginePower = .78 + .22 * target.health / target.maxHealth;
    target.worldVelocity = add(this.flight.rotate(scale(target.direction, (170 + this.wave * 5) * enginePower)), this.flight.meanWind);
    target.position = add(target.position, scale(this.flight.rotate(target.worldVelocity, -this.flight.heading), dt));
    target.velocity = scale(sub(target.position, target.previous), 1 / dt);
    target.heading = Math.atan2(-target.direction.x, -target.direction.z);
    target.pitch = Math.asin(target.direction.y);
    const turn = Math.atan2(Math.sin(target.heading - oldHeading), Math.cos(target.heading - oldHeading));
    target.bank += (clamp(-turn / dt * 1.4, -.9, .9) - target.bank) * Math.min(1, dt * 3);
    const visible = this.isVisible(target);
    target.seen = visible ? target.seen + dt : 0;
    target.cooldown -= dt;
    // Other stations have their own sectors. Off-screen fighters may attack
    // wingmen, but cannot damage the player without a visible reaction window.
    const canAttack = target.phase === 'approach' && distance < 680 && distance > 140 &&
      dot(target.direction, desired) > .995 && (target.victim !== this.player || target.seen > 1.5);
    if (!canAttack) { target.burst = 0; return; }
    if (target.cooldown > 0) return;
    if (!target.burst)
    {
      target.burst = 8;
      this.events.push({ type: 'planeFire', position: { ...target.position } });
    }
    const inherited = target.velocity;
    // Fixed forward guns; slight dispersion and a modest ballistic elevation.
    const direction = this.spread(unit(add(target.direction, { x: 0, y: distance * 9.81 / (2 * 790 ** 2), z: 0 })), this.tuning.spread);
    const origin = add(target.position, scale(target.direction, 5.3));
    if (this.hostile.fire(direction, origin, 0, inherited))
    {
      const shot = this.hostile.lastFired;
      shot.owner = target.id;
      shot.launched = true;
      shot.victim = target.victim;
      shot.damage = this.tuning.damage;
    }
    target.muzzleFlash = .13;
    target.burst--;
    target.cooldown = target.burst ? .12 : 2.5 + this.random();
  }

  updateAllies(dt)
  {
    const claimed = new Set();
    for (const ally of this.allies)
    {
      ally.previous = { ...ally.position };
      ally.flash = Math.max(0, ally.flash - dt);
      if (!ally.alive)
      {
        ally.deadAge += dt;
        ally.position.y -= (12 + ally.deadAge * 6) * dt;
        ally.position.z -= 25 * dt;
        continue;
      }
      ally.position = add(ally.home, { x: Math.sin(this.time * .22 + ally.home.z) * 2, y: Math.sin(this.time * .4 + ally.home.x) * 1.5, z: 0 });
      ally.velocity = scale(sub(ally.position, ally.previous), 1 / dt);
      ally.cooldown -= dt;
      if (ally.cooldown > 0) continue;
      const candidates = this.targets.filter(t => t.alive && length(sub(t.position, ally.position)) < 900);
      candidates.sort((a, b) => (length(sub(a.position, ally.position)) + (claimed.has(a.id) ? 350 : 0)) - (length(sub(b.position, ally.position)) + (claimed.has(b.id) ? 350 : 0)));
      const target = candidates[0];
      if (!target) continue;
      claimed.add(target.id);
      const distance = length(sub(target.position, ally.position)), time = distance / 740;
      const aim = add(target.position, add(scale(sub(target.velocity, ally.velocity), time), { x: 0, y: 4.905 * time * time, z: this.airspeed * .07 * time * time }));
      ally.aim = unit(sub(aim, ally.position));
      const origin = add(add(ally.position, { x: 0, y: 2, z: 0 }), scale(ally.aim, 2));
      // Supporting crews avoid firing through another bomber.
      if ([this.player, ...this.allies].some(b => b !== ally && b.alive && sweptHit(origin, target.position, b.position, b.position, b.radius + 2) !== null)) continue;
      if (!ally.burst)
      {
        ally.burst = 6;
        this.events.push({ type: 'allyShot', position: { ...origin } });
      }
      this.support.fire(this.spread(ally.aim, .009 + distance * .000008), origin, 0, ally.velocity);
      ally.flash = .1;
      ally.burst--;
      ally.cooldown = ally.burst ? .14 : 2.1 + this.random() * 1.5;
    }
  }

  damageFighter(target, player)
  {
    if (!target.alive) return;
    target.health--;
    target.hitFlash = .18;
    if (player) { this.hits++; this.events.push({ type: 'hit', position: { ...target.position } }); }
    if (target.health > 0) return;
    target.alive = false;
    target.muzzleFlash = 0;
    let points = 0;
    if (player)
    {
      this.destroyed++;
      this.combo = Math.min(5, this.combo + 1);
      this.bestCombo = Math.max(this.bestCombo, this.combo);
      this.lastKill = this.time;
      points = 100 * this.combo;
      this.score += points;
    }
    else this.allyKills++;
    this.events.push({ type: 'fighterDown', player, points, position: { ...target.position }, velocity: { ...target.velocity } });
  }

  resolveRounds(pool, player, dt)
  {
    pool.advance(dt);
    for (const shot of pool.slots)
    {
      if (!shot.alive) continue;
      let victim = null, first = Infinity;
      for (const target of this.targets)
      {
        if (!target.alive) continue;
        const hit = fighterHit(shot.previous, shot.position, target);
        if (hit !== null && hit < first) { first = hit; victim = target; }
      }
      if (victim) { shot.alive = false; this.damageFighter(victim, player); }
      if (shot.age > 4 || length(shot.position) > RANGE) shot.alive = false;
    }
  }

  gunLead(direction)
  {
    const origin = STATIONS[this.station].position;
    let best = null, alignment = .92;
    for (const target of this.targets)
    {
      if (!target.alive) continue;
      const match = dot(unit(sub(target.position, origin)), direction);
      if (match > alignment && length(sub(target.position, origin)) < RANGE) { best = target; alignment = match; }
    }
    return best ? this.sight.solve(best, origin, this.flight, this.time) : null;
  }

  updateFlak(dt)
  {
    this.flakClock -= dt;
    if (this.flakClock <= 0)
    {
      // Ground batteries lead the formation. Bursts stay fixed in world space
      // after detonation, so banking aircraft fly past the expanding black smoke.
      const victim = this.random() < .5 ? this.player : this.allies[Math.floor(this.random() * this.allies.length)];
      const delay = 1.5;
      const aim = add(this.flight.toWorld(victim.position), scale(this.flight.groundVelocity, delay));
      const angle = this.random() * Math.PI * 2, miss = 35 + this.random() * 150;
      this.flak.push({ worldPosition: add(aim, { x: Math.cos(angle) * miss, y: (this.random() - .5) * 110, z: Math.sin(angle) * miss }), delay, life: 6, exploded: false });
      this.flakClock = 1.2 + this.random() * 1.2;
    }
    for (const burst of this.flak)
    {
      burst.delay -= dt;
      burst.position = this.flight.toLocal(burst.worldPosition);
      if (burst.delay > 0) continue;
      if (!burst.exploded)
      {
        burst.exploded = true;
        this.events.push({ type: 'flakBurst', position: { ...burst.position } });
        for (const bomber of [this.player, ...this.allies])
        {
          if (!bomber.alive) continue;
          const distance = length(sub(burst.position, bomber.position));
          if (distance >= 48) continue;
          const damage = (1 - distance / 48) * 9;
          if (bomber === this.player)
          {
            this.health = Math.max(0, this.health - damage);
            this.events.push({ type: 'damage' });
          }
          else
          {
            bomber.health = Math.max(0, bomber.health - damage);
            if (!bomber.health) { bomber.alive = false; bomber.flash = 0; this.events.push({ type: 'bomberLost', position: { ...bomber.position } }); }
          }
        }
      }
      burst.life -= dt;
    }
    this.flak = this.flak.filter(b => b.life > 0);
  }

  updatePlayerGun(dt, direction, firing)
  {
    for (const [key, gun] of Object.entries(this.stationGuns))
    {
      if (key !== this.station || !firing || gun.overheated) gun.heat = Math.max(0, gun.heat - dt * .19);
      if (gun.heat < .32) gun.overheated = false;
    }
    const gun = this.stationGuns[this.station], station = STATIONS[this.station];
    const inArc = this.station === 'top' || (this.station === 'ball' ? direction.y < -.015 : dot(direction, station.forward) > .45);
    const canFire = firing && !gun.overheated && inArc;
    this.spool = canFire ? 1 : 0;
    if (canFire)
    {
      this.shotClock += dt * 12 * station.guns;
      while (this.shotClock >= 1 && !gun.overheated)
      {
        this.shotClock--;
        const barrel = this.nextBarrel % station.guns;
        const origin = this.muzzlePosition ? this.muzzlePosition(barrel, direction) : station.position;
        if (this.projectiles.fire(this.spread(direction, .0025 + gun.heat * .003), origin, barrel))
        {
          this.shots++;
          this.nextBarrel++;
          gun.heat = Math.min(1, gun.heat + .005 / station.guns);
          this.events.push({ type: 'shot', barrel });
          if (gun.heat >= 1) gun.overheated = true;
        }
      }
    }
    else this.shotClock = 0;
  }

  update(dt, direction, firing)
  {
    if (this.state !== 'playing' || !Number.isFinite(dt) || dt <= 0) return;
    dt = Math.min(dt, this.remaining);
    // Launch from the start-of-step muzzle pose, then advance both aircraft
    // and rounds through the same interval. Otherwise new rounds jump ahead
    // by one tick of inherited aircraft velocity, especially at waist stations.
    this.updatePlayerGun(dt, direction, firing);
    this.time += dt;
    this.flight.advance(dt, this.time);
    this.updateFlak(dt);
    if (this.health <= 0) { this.player.alive = false; this.finish('flak'); return; }
    if (this.time - this.lastKill > 5) this.combo = 0;
    this.targets.forEach(t => this.moveTarget(t, dt));
    this.updateAllies(dt);
    this.targets = this.targets.filter(t => t.alive ? !(t.phase === 'break' && t.phaseAge > 12) : t.deadAge < 7);
    this.spawnClock -= dt;
    if (this.spawnClock <= 0 && this.targets.filter(t => t.alive).length < this.tuning.count + this.wave - 1)
    {
      this.spawnTarget();
      this.spawnClock = this.tuning.interval;
    }
    this.resolveRounds(this.projectiles, true, dt);
    this.resolveRounds(this.support, false, dt);
    this.hostile.advance(dt);
    for (const shot of this.hostile.slots)
    {
      if (!shot.alive) continue;
      const victim = shot.victim;
      if (victim?.alive && sweptHit(shot.previous, shot.position, victim.previous, victim.position, victim.radius) !== null)
      {
        shot.alive = false;
        if (victim === this.player)
        {
          this.health = Math.max(0, this.health - shot.damage);
          this.events.push({ type: 'damage' });
          if (!this.health) { this.player.alive = false; this.finish('shot-down'); return; }
        }
        else
        {
          victim.health = Math.max(0, victim.health - shot.damage);
          if (!victim.health)
          {
            victim.alive = false;
            victim.flash = 0;
            this.events.push({ type: 'bomberLost', position: { ...victim.position } });
          }
        }
      }
      if (shot.age > 4 || length(shot.position) > 1800) shot.alive = false;
    }
    this.enemyShots = this.hostile.slots.filter(s => s.alive).slice(0, 128);
    if (this.remaining <= 0) this.finish('survived');
  }

  pause() { if (this.state === 'playing') { this.state = 'paused'; this.spool = this.shotClock = 0; } }
  resume() { if (this.state === 'paused') this.state = 'playing'; }
  stop()
  {
    this.state = 'stopped';
    this.spool = this.shotClock = 0;
    for (const pool of [this.projectiles, this.support, this.hostile]) pool.clear();
    this.enemyShots = [];
    this.flak = [];
    this.targets.forEach(t => t.muzzleFlash = 0);
    this.allies.forEach(a => a.flash = 0);
    this.events.length = 0;
  }
  finish(reason)
  {
    const events = this.events.slice();
    this.stop();
    this.events.push(...events);
    this.state = 'ended';
    this.endReason = reason;
    this.events.push({ type: 'ended' });
  }
  dispose()
  {
    this.sight.dispose();
    for (const pool of [this.projectiles, this.support, this.hostile]) pool.dispose();
  }
}

export { sectorOf };
