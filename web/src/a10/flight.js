// Assisted, arcade flight. Metres, seconds, +Y up, nose along local -Z.
export const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
export const add = (a, b) => ({ x: a.x + b.x, y: a.y + b.y, z: a.z + b.z });
export const sub = (a, b) => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
export const scale = (a, s) => ({ x: a.x * s, y: a.y * s, z: a.z * s });
export const length = a => Math.hypot(a.x, a.y, a.z);
export const unit = a => scale(a, 1 / (length(a) || 1));
export const dot = (a, b) => a.x * b.x + a.y * b.y + a.z * b.z;
export const terrainHeight = (x, z) => 12 + 9 * Math.sin(x / 850) * Math.cos(z / 1100);
export const COMBAT_RADIUS = 4800;

export class AttackFlight
{
  constructor()
  {
    this.position = { x: 0, y: 270, z: 1350 };
    this.previous = { ...this.position };
    this.heading = this.pitch = this.bank = 0;
    this.throttle = .58;
    this.speed = 145;
    this.returning = false;
    this.velocity = scale(this.forward, this.speed);
  }

  get forward()
  {
    return { x: -Math.sin(this.heading) * Math.cos(this.pitch), y: Math.sin(this.pitch), z: -Math.cos(this.heading) * Math.cos(this.pitch) };
  }
  get altitude() { return this.position.y - terrainHeight(this.position.x, this.position.z); }
  get muzzle() { return this.toWorld({ x: -.25, y: -.65, z: -9.2 }); }

  toWorld(point)
  {
    const x = Math.cos(this.bank) * point.x - Math.sin(this.bank) * point.y;
    const bankY = Math.sin(this.bank) * point.x + Math.cos(this.bank) * point.y;
    const y = Math.cos(this.pitch) * bankY - Math.sin(this.pitch) * point.z;
    const z = Math.sin(this.pitch) * bankY + Math.cos(this.pitch) * point.z;
    return add(this.position, { x: Math.cos(this.heading) * x + Math.sin(this.heading) * z, y, z: -Math.sin(this.heading) * x + Math.cos(this.heading) * z });
  }

  update(dt, input = {})
  {
    this.previous = { ...this.position };
    this.throttle = clamp(this.throttle + ((input.faster ? 1 : 0) - (input.slower ? 1 : 0)) * dt * .3, 0, 1);
    this.speed += (95 + this.throttle * 95 - this.speed) * Math.min(1, dt * .8);
    let bank = clamp(-(input.x || 0) * 1.05 + ((input.left ? 1 : 0) - (input.right ? 1 : 0)) * .95, -1.15, 1.15);
    let pitch = clamp((input.y || 0) * .64 + ((input.up ? 1 : 0) - (input.down ? 1 : 0)) * .5, -.65, .65);
    const radius = Math.hypot(this.position.x, this.position.z);
    if (radius > COMBAT_RADIUS) this.returning = true;
    if (radius < COMBAT_RADIUS - 650) this.returning = false;
    if (this.returning)
    {
      const desired = Math.atan2(this.position.x, this.position.z);
      const error = Math.atan2(Math.sin(desired - this.heading), Math.cos(desired - this.heading));
      bank = clamp(error * 2, -1.1, 1.1);
      pitch = this.altitude < 180 ? .15 : 0;
    }
    if (this.position.y > 1400) pitch = Math.min(pitch, -.12);
    this.bank += clamp(bank - this.bank, -dt * 1.65, dt * 1.65);
    this.pitch += clamp(pitch - this.pitch, -dt * .48, dt * .48);
    this.heading += this.bank * .5 * (145 / this.speed) * dt;
    this.heading = Math.atan2(Math.sin(this.heading), Math.cos(this.heading));
    this.velocity = scale(this.forward, this.speed);
    this.position = add(this.position, scale(this.velocity, dt));
  }
}

// First terrain crossing along a segment, shared by rounds, bombs and sight.
export function groundContact(a, b)
{
  const delta = sub(b, a), steps = Math.max(1, Math.ceil(length(delta) / 15));
  const above = t => { const p = add(a, scale(delta, t)); return p.y - terrainHeight(p.x, p.z); };
  if (above(0) <= 0) return 0;
  for (let i = 1; i <= steps; i++)
  {
    if (above(i / steps) > 0) continue;
    let lo = (i - 1) / steps, hi = i / steps;
    for (let j = 0; j < 9; j++) { const mid = (lo + hi) / 2; if (above(mid) > 0) lo = mid; else hi = mid; }
    return hi;
  }
  return null;
}
