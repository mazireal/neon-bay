// All sound is synthesized with WebAudio: no audio files, nothing to load.
// Engine hum, police siren, gunshots, pickups, mission jingles and a quiet
// synthwave bass loop. Everything starts on the first user gesture.
export function createAudio() {
  let ctx = null;
  let master = null;
  let musicGain = null;
  let engineOsc = null;
  let engineGain = null;
  let sirenOsc = null;
  let sirenGain = null;
  let muted = false;
  let musicTimer = null;
  let musicStep = 0;

  // A simple synthwave bassline: A minor, eight steps, looped.
  const BASS = [55, 55, 65.41, 55, 49, 49, 58.27, 65.41];

  function ensure() {
    if (ctx) {
      if (ctx.state === 'suspended') ctx.resume();
      return true;
    }
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = muted ? 0 : 0.5;
      master.connect(ctx.destination);
      musicGain = ctx.createGain();
      musicGain.gain.value = 0.16;
      musicGain.connect(master);
      // Engine: a sawtooth whose pitch follows speed.
      engineOsc = ctx.createOscillator();
      engineOsc.type = 'sawtooth';
      engineOsc.frequency.value = 50;
      engineGain = ctx.createGain();
      engineGain.gain.value = 0;
      const engineFilter = ctx.createBiquadFilter();
      engineFilter.type = 'lowpass';
      engineFilter.frequency.value = 400;
      engineOsc.connect(engineFilter);
      engineFilter.connect(engineGain);
      engineGain.connect(master);
      engineOsc.start();
      // Siren: a triangle that wails between two tones.
      sirenOsc = ctx.createOscillator();
      sirenOsc.type = 'triangle';
      sirenOsc.frequency.value = 700;
      sirenGain = ctx.createGain();
      sirenGain.gain.value = 0;
      sirenOsc.connect(sirenGain);
      sirenGain.connect(master);
      sirenOsc.start();
      startMusic();
      return true;
    } catch {
      ctx = null;
      return false;
    }
  }

  function startMusic() {
    if (musicTimer !== null) return;
    musicTimer = window.setInterval(() => {
      if (!ctx || muted) return;
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      osc.type = 'triangle';
      osc.frequency.value = BASS[musicStep % BASS.length];
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.5, now);
      g.gain.exponentialRampToValueAtTime(0.001, now + 0.42);
      osc.connect(g);
      g.connect(musicGain);
      osc.start(now);
      osc.stop(now + 0.45);
      musicStep += 1;
    }, 230);
  }

  function blip(freq, dur, type, volume) {
    if (!ctx || muted) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(volume, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + dur);
    osc.connect(g);
    g.connect(master);
    osc.start(now);
    osc.stop(now + dur + 0.02);
  }

  function noiseBurst(dur, volume, filterFreq) {
    if (!ctx || muted) return;
    const now = ctx.currentTime;
    const len = Math.floor(ctx.sampleRate * dur);
    const buffer = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < len; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = filterFreq;
    const g = ctx.createGain();
    g.gain.value = volume;
    src.connect(filter);
    filter.connect(g);
    g.connect(master);
    src.start(now);
  }

  return {
    ensure,
    setMuted(value) {
      muted = value;
      if (master) master.gain.value = muted ? 0 : 0.5;
    },
    isMuted() { return muted; },
    /** speedRatio 0..1 while driving, or null when on foot. */
    engine(speedRatio) {
      if (!ctx) return;
      if (speedRatio === null) {
        engineGain.gain.value = 0;
        return;
      }
      engineOsc.frequency.value = 45 + speedRatio * 130;
      engineGain.gain.value = muted ? 0 : 0.05 + speedRatio * 0.05;
    },
    /** on: siren audible; dt drives the wail. */
    siren(on, time) {
      if (!ctx) return;
      if (!on) {
        sirenGain.gain.value = 0;
        return;
      }
      sirenGain.gain.value = muted ? 0 : 0.05;
      sirenOsc.frequency.value = 650 + Math.sin(time * 6) * 180;
    },
    shoot() {
      noiseBurst(0.09, 0.5, 3000);
      blip(160, 0.08, 'square', 0.25);
    },
    crash(strength) {
      noiseBurst(0.18, Math.min(0.7, 0.2 + strength), 900);
    },
    explosion() {
      noiseBurst(0.6, 0.9, 400);
      blip(60, 0.5, 'sine', 0.8);
    },
    pickup() {
      blip(880, 0.09, 'sine', 0.4);
      window.setTimeout(() => blip(1320, 0.14, 'sine', 0.4), 80);
    },
    missionDone() {
      [523, 659, 784, 1047].forEach((f, i) => window.setTimeout(() => blip(f, 0.22, 'triangle', 0.4), i * 110));
    },
    missionFail() {
      [392, 330, 262].forEach((f, i) => window.setTimeout(() => blip(f, 0.25, 'triangle', 0.35), i * 140));
    },
    busted() {
      [440, 440, 349].forEach((f, i) => window.setTimeout(() => blip(f, 0.3, 'square', 0.25), i * 180));
    },
    click() { blip(660, 0.06, 'sine', 0.3); },
  };
}
