// A fixed pool of splashes and rivulets drawn over the view, without blocking controls.
export class ScreenBlood
{
  constructor(canvas, random = Math.random)
  {
    this.canvas = canvas;
    this.context = canvas.getContext('2d');
    this.random = random;
    this.clear();
  }
  clear()
  {
    this.drops = [];
    this.fatal = false;
    this.age = 0;
    this.context.clearRect(0, 0, this.canvas.width, this.canvas.height);
  }
  hit(fatal = false)
  {
    this.fatal ||= fatal;
    this.age = 0;
    const r = this.random;
    for (let i = 0; i < (fatal ? 48 : 12); i++)
    {
      const edge = r() < .5;
      this.drops.push(
      {
        x: edge ? (r() < .5 ? r() * .23 : .77 + r() * .23) : r(),
        y: edge ? r() * .75 : r() * .20,
        size: (fatal ? .006 : .003) + r() * (fatal ? .022 : .008),
        length: (fatal ? .16 : .04) + r() * (fatal ? .44 : .1),
        delay: r() * .55,
        speed: .045 + r() * .075,
        age: 0,
        fatal,
        shade: Math.floor(70 + r() * 45)
      });
    }
    this.drops = this.drops.slice(-72);
  }
  update(dt, reducedMotion = false)
  {
    this.age += dt;
    const canvas = this.canvas,
      ctx = this.context;
    const width = canvas.clientWidth,
      height = canvas.clientHeight;
    if (!width || !height) return;
    const ratio = Math.min(globalThis.devicePixelRatio || 1, 2);
    if (canvas.width !== Math.round(width * ratio) || canvas.height !== Math.round(height * ratio))
    {
      canvas.width = Math.round(width * ratio);
      canvas.height = Math.round(height * ratio);
    }
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.clearRect(0, 0, width, height);
    if (this.fatal)
    {
      const glow = ctx.createRadialGradient(width * .5, height * .48, height * .18, width * .5, height * .48, Math.max(width, height) * .68);
      glow.addColorStop(0, 'rgba(70,0,0,.04)');
      glow.addColorStop(.65, 'rgba(80,0,0,.35)');
      glow.addColorStop(1, 'rgba(35,0,0,.88)');
      ctx.fillStyle = glow;
      ctx.fillRect(0, 0, width, height);
    }
    for (const drop of this.drops)
    {
      drop.age += dt;
      const fade = drop.fatal ? .88 : Math.max(0, 1 - drop.age / 4) * .65;
      if (!fade) continue;
      const length = reducedMotion ? drop.length * .35 : Math.min(drop.length, Math.max(0, drop.age - drop.delay) * drop.speed);
      const x = drop.x * width,
        y = drop.y * height,
        size = drop.size * height,
        end = y + length * height;
      ctx.globalAlpha = fade;
      ctx.fillStyle = `rgb(${drop.shade},4,8)`;
      ctx.beginPath();
      ctx.ellipse(x, y, size * 1.5, size, drop.x * 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(x - size * .36, y);
      ctx.bezierCurveTo(x - size * .2, y + size * 2, x - size * .20, end - size, x - size * .23, end);
      ctx.quadraticCurveTo(x, end + size * .8, x + size * .23, end);
      ctx.bezierCurveTo(x + size * .20, end - size, x + size * .2, y + size * 2, x + size * .36, y);
      ctx.closePath();
      ctx.fill();
      ctx.globalAlpha = fade * .22;
      ctx.fillStyle = '#dd3a32';
      ctx.beginPath();
      ctx.ellipse(x - size * .08, end, size * .055, size * .25, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    this.drops = this.drops.filter(drop => drop.fatal || drop.age < 4);
  }
}