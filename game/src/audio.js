// Procedural sound: every effect is generated with WebAudio oscillators and
// filtered noise — no audio files, no network. Created lazily on the first
// user gesture, since browsers block audio before one.

export class SoundBank {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.muted = false;
    this.engine = null;      // { osc, gain, filter }
    this.siren = null;       // { osc, gain, phase }
    this.sirenOn = false;
  }

  ensure() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
    } catch {
      return;
    }
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.5;
    this.master.connect(this.ctx.destination);
    // Engine hum: a sawtooth through a low-pass, pitch follows speed.
    const osc = this.ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.value = 55;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 420;
    const gain = this.ctx.createGain();
    gain.gain.value = 0;
    osc.connect(filter); filter.connect(gain); gain.connect(this.master);
    osc.start();
    this.engine = { osc, gain, filter };
    // Police siren: a triangle wave alternating two tones.
    const sOsc = this.ctx.createOscillator();
    sOsc.type = 'triangle';
    sOsc.frequency.value = 700;
    const sGain = this.ctx.createGain();
    sGain.gain.value = 0;
    sOsc.connect(sGain); sGain.connect(this.master);
    sOsc.start();
    this.siren = { osc: sOsc, gain: sGain, phase: 0 };
  }

  setMuted(muted) {
    this.muted = muted;
    if (this.master) this.master.gain.value = muted ? 0 : 0.5;
  }

  /** speedFrac 0..1 while driving; 0 silences the engine. */
  engineHum(speedFrac, driving) {
    if (!this.engine) return;
    const t = this.ctx.currentTime;
    this.engine.gain.gain.setTargetAtTime(driving ? 0.05 + 0.06 * speedFrac : 0, t, 0.1);
    this.engine.osc.frequency.setTargetAtTime(52 + 130 * speedFrac, t, 0.08);
    this.engine.filter.frequency.setTargetAtTime(320 + 900 * speedFrac, t, 0.1);
  }

  sirenTick(dt, wanted) {
    if (!this.siren) return;
    const on = wanted > 0;
    const t = this.ctx.currentTime;
    if (on !== this.sirenOn) {
      this.sirenOn = on;
      this.siren.gain.gain.setTargetAtTime(on ? 0.045 : 0, t, 0.2);
    }
    if (on) {
      this.siren.phase += dt;
      const hi = Math.floor(this.siren.phase / 0.42) % 2 === 0;
      this.siren.osc.frequency.setTargetAtTime(hi ? 880 : 660, t, 0.05);
    }
  }

  /** A short burst of filtered noise, fading out. */
  noiseBurst(duration, volume, freq) {
    if (!this.ctx) return;
    const len = Math.floor(this.ctx.sampleRate * duration);
    const buffer = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < len; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = this.ctx.createBufferSource();
    src.buffer = buffer;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass'; filter.frequency.value = freq;
    const gain = this.ctx.createGain();
    gain.gain.value = volume;
    src.connect(filter); filter.connect(gain); gain.connect(this.master);
    src.start();
  }

  /** A short rising sine blip. */
  blip(freq, duration, volume) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, t);
    osc.frequency.exponentialRampToValueAtTime(freq * 1.5, t + duration);
    const gain = this.ctx.createGain();
    gain.gain.value = volume;
    gain.gain.exponentialRampToValueAtTime(0.001, t + duration);
    osc.connect(gain); gain.connect(this.master);
    osc.start(t); osc.stop(t + duration + 0.02);
  }

  gunshot() { this.noiseBurst(0.14, 0.5, 1800); }
  punch() { this.noiseBurst(0.08, 0.35, 900); }
  pickup() { this.blip(660, 0.12, 0.3); setTimeout(() => this.blip(990, 0.16, 0.3), 90); }
  cash() {
    this.blip(880, 0.1, 0.3);
    setTimeout(() => this.blip(1174, 0.1, 0.3), 80);
    setTimeout(() => this.blip(1568, 0.2, 0.3), 160);
  }
  click() { this.blip(440, 0.06, 0.2); }
  busted() { this.blip(220, 0.5, 0.4); }
}
