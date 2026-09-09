// Shared terrain samples keep visible craters, infantry footing and bullet impacts together.
export const TRENCH_FRONT = 1.2;
export const TRENCH_CAMERA = Object.freeze(
{
  x: 0,
  y: .95,
  z: 3.4
});
export const ALLIED_POSITIONS = Object.freeze([-2.5, 2.5].map(x => Object.freeze(
{
  x,
  y: .65,
  z: TRENCH_CAMERA.z - 1.6
})));
const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
export function baseHeight(x, z)
{
  if (z > TRENCH_FRONT && z < 9 && Math.abs(x) < 28) return -1.7;
  const fade = clamp((-z - 8) / 60, 0, 1);
  return fade * (.3 * Math.sin(x * .083) * Math.sin(z * .052) + .19 * Math.sin(z * .13 + x * .071));
}
export class BattlefieldTerrain
{
  constructor()
  {
    this.step = 1.5;
    this.minX = -252;
    this.minZ = -480;
    this.columns = 337;
    this.rows = 322;
    this.heights = new Float32Array(this.columns * this.rows);
    this.scorch = new Float32Array(this.heights.length);
    this.revision = 0;
    this.reset();
  }
  reset()
  {
    this.craters = [];
    this.scorch.fill(0);
    for (let row = 0; row < this.rows; row++)
      for (let col = 0; col < this.columns; col++) this.heights[row * this.columns + col] = baseHeight(this.minX + col * this.step, this.minZ + row * this.step);
    let seed = 714;
    const random = () =>
    {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      return seed / 4294967296;
    };
    for (let i = 0; i < 44; i++) this.crater((random() - .5) * 300, -23 - random() * 340, 3.1 + random() * 4.5, .7 + random() * .75, true);
    this.crater(-12, -22, 5.2, 1.35, true);
    this.crater(10, -29, 6, 1.4, true);
    this.crater(0, -47, 4.8, 1.2, true);
    this.revision++;
  }
  height(x, z)
  {
    if (z > this.minZ + (this.rows - 1) * this.step || z < this.minZ || x < this.minX || x > -this.minX) return baseHeight(x, z);
    const col = clamp((x - this.minX) / this.step, 0, this.columns - 1.001),
      row = clamp((z - this.minZ) / this.step, 0, this.rows - 1.001);
    const c = Math.floor(col),
      r = Math.floor(row),
      u = col - c,
      v = row - r,
      i = r * this.columns + c;
    return (this.heights[i] * (1 - u) + this.heights[i + 1] * u) * (1 - v) + (this.heights[i + this.columns] * (1 - u) + this.heights[i + this.columns + 1] * u) * v;
  }
  crater(x, z, radius = 5.5, depth = 1.2, old = false)
  {
    // Friendly fire support never excavates the defended position.
    if (z > -35 && !old || this.craters.length >= 160) return null;
    const crater = {
      x,
      z,
      radius,
      depth,
      old,
      id: this.craters.length
    };
    this.craters.push(crater);
    const reach = radius * 1.4;
    const left = Math.max(0, Math.floor((x - reach - this.minX) / this.step)),
      right = Math.min(this.columns - 1, Math.ceil((x + reach - this.minX) / this.step));
    const top = Math.max(0, Math.floor((z - reach - this.minZ) / this.step)),
      bottom = Math.min(this.rows - 1, Math.ceil((z + reach - this.minZ) / this.step));
    for (let r = top; r <= bottom; r++)
      for (let c = left; c <= right; c++)
      {
        const px = this.minX + c * this.step,
          pz = this.minZ + r * this.step;
        const distance = Math.hypot(px - x, pz - z),
          q = distance / radius;
        if (q > 1.4) continue;
        const i = r * this.columns + c;
        const bowl = q < 1 ? -depth * (1 - q * q) ** 2 : 0;
        const rim = depth * .27 * Math.exp(-(((q - 1) / .19) ** 2));
        this.heights[i] = clamp(this.heights[i] + bowl + rim, baseHeight(px, pz) - 2.5, baseHeight(px, pz) + .65);
        this.scorch[i] = Math.max(this.scorch[i], (old ? .45 : .8) * Math.max(0, 1 - q / 1.4));
      }
    this.revision++;
    return crater;
  }
}