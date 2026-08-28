/**
 * Smooth, Cinematic Procedural Audio Engine
 * Replaces harsh raw oscillators with a warm, multi-layered F1 / GT engine purr,
 * resonant low-pass filtering, and soothing aerodynamic wind rush.
 */
export class SoundManager {
  constructor() {
    this._audioCtx     = null;
    this._isReady      = false;
    this._isMuted      = false;
    this._masterVolume = 0.55;

    this._initAudioContext();
  }

  _initAudioContext() {
    try {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (!AudioContextClass) return;

      this._audioCtx = new AudioContextClass();

      // Master Gain
      this.masterGain = this._audioCtx.createGain();
      this.masterGain.gain.value = this._masterVolume;
      this.masterGain.connect(this._audioCtx.destination);

      // ── 1. Warm Engine Low-Pass Filter (removes harsh high buzz) ──
      this.engineFilter = this._audioCtx.createBiquadFilter();
      this.engineFilter.type = 'lowpass';
      this.engineFilter.frequency.value = 350; // starts mellow and warm
      this.engineFilter.Q.value = 2.2;         // pleasant exhaust resonance
      this.engineFilter.connect(this.masterGain);

      // ── 2. Deep Sub-Bass Exhaust Rumble (Sine/Triangle) ───────────
      this.subOsc = this._audioCtx.createOscillator();
      this.subOsc.type = 'triangle';
      this.subOsc.frequency.value = 32;

      this.subGain = this._audioCtx.createGain();
      this.subGain.gain.value = 0.0;
      this.subOsc.connect(this.subGain);
      this.subGain.connect(this.engineFilter);
      this.subOsc.start();

      // ── 3. Mid-Harmonic Cylinder Purr (Mellow Saw/Triangle) ───────
      this.midOsc = this._audioCtx.createOscillator();
      this.midOsc.type = 'sawtooth';
      this.midOsc.frequency.value = 64;

      this.midGain = this._audioCtx.createGain();
      this.midGain.gain.value = 0.0;
      this.midOsc.connect(this.midGain);
      this.midGain.connect(this.engineFilter);
      this.midOsc.start();

      // ── 4. Aerodynamic Wind Whoosh (Filtered Pink/White Noise) ─────
      this._buildWindNode();

      this._isReady = true;

      // Resume on first user interaction
      const resume = () => {
        if (this._audioCtx && this._audioCtx.state === 'suspended') {
          this._audioCtx.resume();
        }
      };
      window.addEventListener('keydown', resume, { once: true });
      window.addEventListener('click',   resume, { once: true });
    } catch (e) {
      console.warn('Web Audio initialization error:', e);
      this._isReady = false;
    }
  }

  _buildWindNode() {
    if (!this._audioCtx) return;

    // Generate 2 seconds of pink/soft noise buffer
    const bufferSize = this._audioCtx.sampleRate * 2;
    const noiseBuffer = this._audioCtx.createBuffer(1, bufferSize, this._audioCtx.sampleRate);
    const output = noiseBuffer.getChannelData(0);
    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;

    for (let i = 0; i < bufferSize; i++) {
      const white = Math.random() * 2 - 1;
      b0 = 0.99886 * b0 + white * 0.0555179;
      b1 = 0.99332 * b1 + white * 0.0750759;
      b2 = 0.96900 * b2 + white * 0.1538520;
      b3 = 0.86650 * b3 + white * 0.3104856;
      b4 = 0.55000 * b4 + white * 0.5329522;
      b5 = -0.7616 * b5 - white * 0.0168980;
      output[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362) * 0.04;
      b6 = white * 0.115926;
    }

    this.windSource = this._audioCtx.createBufferSource();
    this.windSource.buffer = noiseBuffer;
    this.windSource.loop = true;

    this.windFilter = this._audioCtx.createBiquadFilter();
    this.windFilter.type = 'bandpass';
    this.windFilter.frequency.value = 400;
    this.windFilter.Q.value = 1.0;

    this.windGain = this._audioCtx.createGain();
    this.windGain.gain.value = 0.0;

    this.windSource.connect(this.windFilter);
    this.windFilter.connect(this.windGain);
    this.windGain.connect(this.masterGain);
    this.windSource.start();
  }

  update(speedKmh, rpm, isBoosting = false) {
    if (!this._isReady || !this._audioCtx || this._isMuted) return;

    const now       = this._audioCtx.currentTime;
    const safeSpeed = Math.max(0, isFinite(speedKmh) ? speedKmh : 0);
    const safeRpm   = Math.max(800, isFinite(rpm) ? rpm : 800);
    const rpmNorm   = Math.min(1.0, (safeRpm - 800) / 13200);

    // ── Frequency Calculation: Smooth, Mellow Purr (Not squeaky) ──
    // Base fundamental ranges from 36 Hz (idle) up to ~110 Hz at redline
    const fundamental = 36 + rpmNorm * 74;
    this.subOsc.frequency.setTargetAtTime(fundamental, now, 0.08);
    this.midOsc.frequency.setTargetAtTime(fundamental * 2.0, now, 0.08);

    // ── Dynamic Exhaust Filter Opening ─────────────────────────────
    // Opens up gently with throttle from 280 Hz to 850 Hz (no harsh buzzing treble)
    const filterCutoff = 280 + rpmNorm * 650 + (isBoosting ? 200 : 0);
    this.engineFilter.frequency.setTargetAtTime(filterCutoff, now, 0.10);

    // ── Engine Volume Envelopes ───────────────────────────────────
    const engineVolume = 0.03 + (safeSpeed > 2 ? 0.04 + rpmNorm * 0.08 : 0.01);
    this.subGain.gain.setTargetAtTime(engineVolume * 0.85, now, 0.08);
    this.midGain.gain.setTargetAtTime(engineVolume * 0.35, now, 0.08);

    // ── Soothing Wind Whoosh ──────────────────────────────────────
    if (this.windGain && this.windFilter) {
      const speedFactor = Math.min(1.0, safeSpeed / 240);
      const windVol = speedFactor * speedFactor * 0.06;
      const windFreq = 250 + speedFactor * 900;
      this.windGain.gain.setTargetAtTime(windVol, now, 0.15);
      this.windFilter.frequency.setTargetAtTime(windFreq, now, 0.15);
    }
  }

  setMuted(muted) {
    this._isMuted = muted;
    if (this.masterGain && this._audioCtx) {
      this.masterGain.gain.setTargetAtTime(muted ? 0 : this._masterVolume, this._audioCtx.currentTime, 0.05);
    }
  }

  setVolume(volume) {
    this._masterVolume = Math.max(0, Math.min(1, volume));
    if (!this._isMuted && this.masterGain && this._audioCtx) {
      this.masterGain.gain.setTargetAtTime(this._masterVolume, this._audioCtx.currentTime, 0.05);
    }
  }
}
