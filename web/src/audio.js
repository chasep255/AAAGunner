// Reusable sound buffers combine sharp transients, filtered noise, and low-end body.
// Delayed world sounds use the simulation clock, so pausing freezes their arrival.
export function synthesizeSound(kind, sampleRate = 44100)
{
  const duration = {
    gun: .18,
    maxim: .28,
    whistle: 2,
    reload: .65,
    enemy: 1.15,
    impact: 1.15,
    explosion: 3.2,
    missile: 1.4,
    hit: .28,
    motor: 1,
    engine: 2,
    bombAlert: .85
  } [kind];
  const samples = new Float32Array(Math.ceil(duration * sampleRate));
  let seed = 771,
    low = 0,
    mid = 0;
  for (let i = 0; i < samples.length; i++)
  {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    const noise = seed / 2147483648 - 1,
      t = i / sampleRate;
    low += .018 * (noise - low);
    mid += .19 * (noise - mid);
    let value = 0;
    if (kind === 'gun' || kind === 'enemy' || kind === 'maxim')
    {
      const shot = kind === 'enemy' ? t % .075 : t;
      const gate = kind === 'enemy' && t > .85 ? Math.exp(-(t - .85) * 16) : 1;
      value = gate * ((noise - mid) * Math.exp(-shot * 260) * .8 + mid * Math.exp(-shot * 48) * 1.1 + Math.sin(2 * Math.PI * (125 * shot - 150 * shot * shot)) * Math.exp(-shot * 44) * .45);
    }
    if (kind === 'impact' || kind === 'explosion')
    {
      const big = kind === 'explosion',
        decay = big ? 2.1 : 5;
      const crack = (noise - mid) * Math.exp(-t * 70) * .75;
      const body = low * 5 * Math.exp(-t * decay) + Math.sin(2 * Math.PI * (big ? 47 : 75) * t) * Math.exp(-t * (big ? 4 : 13)) * .6;
      const debris = (noise - mid) * Math.pow(Math.max(0, Math.sin(t * 57) * Math.sin(t * 23)), 10) * Math.exp(-t * (big ? 1.8 : 4)) * .55;
      value = crack + body + debris;
    }
    if (kind === 'bombAlert')
    {
      const pulse = t % .28;
      value = Math.sin(2 * Math.PI * (pulse < .12 ? 1050 : 700) * t) * Math.min(1, pulse * 180) * Math.exp(-pulse * 13) * .5;
    }
    if (kind === 'maxim') value += Math.sin(2 * Math.PI * 82 * t) * Math.exp(-t * 23) * .5 + mid * Math.exp(-Math.max(0, t - .065) * 40) * .25;
    if (kind === 'whistle') value = (Math.sin(2 * Math.PI * (1550 * t - 250 * t * t)) * .16 + mid * .3) * Math.sin(Math.PI * t / 2);
    if (kind === 'reload') value = (noise - mid) * (Math.exp(-t * 65) + Math.exp(-Math.abs(t - .32) * 100) * .65) * .5;
    if (kind === 'missile') value = (mid * 2.2 + low * 2.2) * Math.min(1, t * 90) * Math.exp(-t * 2.7) + Math.sin(2 * Math.PI * 58 * t) * Math.exp(-t * 13) * .5;
    if (kind === 'hit') value = (noise - mid) * Math.exp(-t * 55) * .75 + Math.sin(2 * Math.PI * 1700 * t) * Math.exp(-t * 35) * .14;
    if (kind === 'motor') value = (Math.sin(2 * Math.PI * 70 * t) + .45 * Math.sin(2 * Math.PI * 140 * t) + .18 * Math.sin(2 * Math.PI * 350 * t)) * .27;
    if (kind === 'engine') value = (Math.sin(2 * Math.PI * 58 * t) + .35 * Math.sin(2 * Math.PI * 116 * t) + .2 * Math.sin(2 * Math.PI * 174 * t)) * (.23 + .025 * Math.sin(2 * Math.PI * 13 * t));
    samples[i] = Math.tanh(value * 1.2);
  }
  return samples;
}

export class GameAudio
{
  constructor()
  {
    this.enabled = true;
    this.level = .8;
    this.active = false;
    this.pending = [];
    this.voices = new Set();
  }
  unlock()
  {
    if (!this.enabled) return;
    try
    {
      if (!this.context)
      {
        const Context = window.AudioContext || window.webkitAudioContext;
        if (!Context) return;
        this.context = new Context(
        {
          latencyHint: 'interactive'
        });
        this.master = this.context.createGain();
        this.master.gain.value = 0;
        this.compressor = this.context.createDynamicsCompressor();
        this.compressor.threshold.value = -8;
        this.compressor.knee.value = 12;
        this.compressor.ratio.value = 5;
        this.compressor.attack.value = .003;
        this.compressor.release.value = .18;
        this.compressor.connect(this.master).connect(this.context.destination);
        this.reverb = this.context.createConvolver();
        const impulse = this.context.createBuffer(2, this.context.sampleRate * 1.1, this.context.sampleRate);
        for (let channel = 0; channel < 2; channel++)
        {
          const data = impulse.getChannelData(channel);
          for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * Math.exp(-i / this.context.sampleRate * 7) * .009;
          for (const [delay, gain] of [
              [.085, .28],
              [.19, .17],
              [.34, .1],
              [.57, .055]
            ]) data[Math.floor((delay + channel * .012) * this.context.sampleRate)] += gain;
        }
        this.reverb.buffer = impulse;
        this.echoLevel = this.context.createGain();
        this.echoLevel.gain.value = .16;
        this.reverb.connect(this.echoLevel).connect(this.compressor);
        this.bank = {};
        for (const kind of ['gun', 'maxim', 'whistle', 'reload', 'enemy', 'impact', 'explosion', 'missile', 'hit', 'motor', 'engine', 'bombAlert'])
        {
          const data = synthesizeSound(kind, this.context.sampleRate);
          const buffer = this.context.createBuffer(1, data.length, this.context.sampleRate);
          buffer.copyToChannel(data, 0);
          this.bank[kind] = buffer;
        }
        this.motor = this.loop('motor');
        this.engine = this.loop('engine');
      }
      this.context.resume().catch(() =>
      {});
    }
    catch (error)
    {
      console.warn('Game audio unavailable:', error);
    }
  }
  loop(kind)
  {
    const source = this.context.createBufferSource(),
      gain = this.context.createGain(),
      pan = this.context.createStereoPanner();
    source.buffer = this.bank[kind];
    source.loop = true;
    gain.gain.value = 0;
    source.connect(gain).connect(pan).connect(this.compressor);
    source.start();
    return {
      source,
      gain,
      pan
    };
  }
  setVolume(value)
  {
    this.level = Math.max(0, Math.min(1, value));
    this.applyVolume();
  }
  applyVolume()
  {
    if (this.master) this.master.gain.setTargetAtTime(this.enabled && this.active ? this.level : 0, this.context.currentTime, .025);
  }
  play(kind, position = null, gain = 1)
  {
    if (!this.context || !this.enabled || !this.active || this.context.state !== 'running') return;
    if (this.voices.size >= 64) return;
    const source = this.context.createBufferSource(),
      volume = this.context.createGain(),
      pan = this.context.createStereoPanner();
    source.buffer = this.bank[kind];
    source.playbackRate.value = .96 + Math.random() * .08;
    volume.gain.value = gain;
    pan.pan.value = position ? Math.max(-.95, Math.min(.95, position.x / Math.max(25, Math.abs(position.z)))) : 0;
    source.connect(volume).connect(pan).connect(this.compressor);
    pan.connect(this.reverb);
    this.voices.add(source);
    source.onended = () =>
    {
      this.voices.delete(source);
      source.disconnect();
      volume.disconnect();
      pan.disconnect();
    };
    source.start();
  }
  event(kind, position, time)
  {
    if (kind === 'bombAlert')
    {
      this.play('bombAlert', null, .55);
      return;
    }
    if (kind === 'maxim' || kind === 'reload' || kind === 'whistle')
    {
      this.play(kind, position, kind === 'whistle' ? .22 : kind === 'reload' ? .4 : .58);
      return;
    }
    if (kind === 'gun')
    {
      this.play('gun', null, .48);
      return;
    }
    if (kind === 'missile')
    {
      this.play('missile', null, .7);
      return;
    }
    if (kind === 'impact')
    {
      this.play('impact', position, .85);
      return;
    }
    if (kind === 'hit')
    {
      this.play('hit', position, .2);
      return;
    }
    const distance = position ? Math.hypot(position.x, position.y - 8, position.z) : 0;
    this.pending.push(
    {
      kind: kind === 'ally' ? 'maxim' : kind === 'shellImpact' ? 'explosion' : kind === 'distantImpact' ? 'impact' : kind,
      position,
      time: time + distance / 343,
      gain: kind === 'ally' ? .3 : kind === 'shellImpact' ? .65 / (1 + distance / 450) : kind === 'distantImpact' ? .85 / (1 + distance / 200) : kind === 'explosion' ? 1.1 / (1 + distance / 650) : .5 / (1 + distance / 450)
    });
  }
  update(spool, game = null)
  {
    this.active = game?.state === 'playing';
    this.applyVolume();
    if (!this.context) return;
    const now = this.context.currentTime;
    this.motor.gain.gain.setTargetAtTime(this.active && game?.audioProfile !== 'trench' ? spool * .13 : 0, now, .04);
    this.motor.source.playbackRate.setTargetAtTime(.7 + spool * .6, now, .05);
    let nearest = null,
      range = Infinity;
    if (this.active)
      for (const target of game.targets)
      {
        const distance = Math.hypot(target.position.x, target.position.y - 8, target.position.z);
        if (distance < range)
        {
          range = distance;
          nearest = target;
        }
      }
    this.engine.gain.gain.setTargetAtTime(nearest && game?.audioProfile !== 'trench' ? .18 / (1 + range / 180) : 0, now, .15);
    if (nearest)
    {
      this.engine.pan.pan.setTargetAtTime(Math.max(-1, Math.min(1, nearest.position.x / Math.max(50, Math.abs(nearest.position.z)))), now, .15);
      this.engine.source.playbackRate.setTargetAtTime(nearest.velocity.z > 0 ? 1.12 : .86, now, .3);
    }
    if (this.active)
    {
      for (const sound of this.pending)
        if (sound.time <= game.time) this.play(sound.kind, sound.position, sound.gain);
      this.pending = this.pending.filter(sound => sound.time > game.time);
    }
  }
  clear()
  {
    this.pending = [];
    for (const source of this.voices) source.stop();
    this.voices.clear();
  }
  dispose()
  {
    this.clear();
    if (this.context) this.context.close().catch(() =>
    {});
  }
}