import { INSTRUMENTS } from "./instruments.js";

export function createAudio() {
  const AudioCtx = window.AudioContext || window.webkitAudioContext;
  const ctx = new AudioCtx();
  const master = ctx.createGain();
  master.gain.value = 0.9;
  master.connect(ctx.destination);

  const left = ctx.createGain();
  const right = ctx.createGain();
  const leftPan = ctx.createStereoPanner();
  const rightPan = ctx.createStereoPanner();
  leftPan.pan.value = -0.8;
  rightPan.pan.value = 0.8;
  left.connect(leftPan).connect(master);
  right.connect(rightPan).connect(master);

  const motion = ctx.createOscillator();
  motion.type = "sine";
  motion.frequency.value = 90;
  const motionGain = ctx.createGain();
  motionGain.gain.value = 0;
  const lfo = ctx.createOscillator();
  lfo.frequency.value = 5.2;
  const lfoGain = ctx.createGain();
  lfoGain.gain.value = 0;
  lfo.connect(lfoGain).connect(motion.frequency);
  motion.connect(motionGain).connect(left);
  motion.start();
  lfo.start();

  const link = ctx.createOscillator();
  link.type = "triangle";
  link.frequency.value = 220;
  const linkGain = ctx.createGain();
  linkGain.gain.value = 0;
  link.connect(linkGain).connect(right);
  link.start();

  const noiseBuffer = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
  const data = noiseBuffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;

  let muted = false;
  let lastClickTurn = 0;

  function burst(seconds, freq, gain) {
    if (muted || ctx.state !== "running") return;
    const src = ctx.createBufferSource();
    src.buffer = noiseBuffer;
    const filter = ctx.createBiquadFilter();
    filter.type = "bandpass";
    filter.frequency.value = freq;
    filter.Q.value = 0.7;
    const g = ctx.createGain();
    const now = ctx.currentTime;
    g.gain.setValueAtTime(gain, now);
    g.gain.exponentialRampToValueAtTime(0.0001, now + seconds);
    src.connect(filter).connect(g).connect(left);
    src.start(now);
    src.stop(now + seconds + 0.02);
  }

  function chime(freq) {
    if (muted || ctx.state !== "running") return;
    const now = ctx.currentTime;
    const o = ctx.createOscillator();
    const o2 = ctx.createOscillator();
    o.type = "sine";
    o2.type = "sine";
    o.frequency.value = freq;
    o2.frequency.value = freq * 2.01;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, now);
    g.gain.exponentialRampToValueAtTime(0.05, now + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, now + 0.22);
    const g2 = ctx.createGain();
    g2.gain.value = 0.25;
    o.connect(g).connect(right);
    o2.connect(g2).connect(g);
    o.start(now);
    o2.start(now);
    o.stop(now + 0.24);
    o2.stop(now + 0.24);
  }

  return {
    async resume() {
      if (ctx.state !== "running") await ctx.resume();
    },
    setMuted(v) {
      muted = v;
      master.gain.value = v ? 0 : 0.9;
    },
    get muted() {
      return muted;
    },
    update(state, playing) {
      const now = ctx.currentTime;
      const audible = playing && !muted && state.t < 13203;
      const tilt = Math.hypot(state.tiltx, state.tilty);
      const rate = Math.abs(state.spin);
      motion.frequency.setTargetAtTime(78 + rate * 16, now, 0.08);
      lfoGain.gain.setTargetAtTime(audible ? Math.min(42, tilt * 0.45) : 0, now, 0.1);
      motionGain.gain.setTargetAtTime(audible ? 0.045 : 0, now, 0.08);
      const norm = Math.min(1, Math.max(0, (state.agc + 128) / 18));
      const dropped = state.elev < 3 || state.t > 13200;
      link.frequency.setTargetAtTime(160 + norm * 420, now, 0.1);
      linkGain.gain.setTargetAtTime(audible && !dropped ? 0.018 + norm * 0.02 : 0, now, 0.1);

      const turn = Math.floor(state.turns);
      if (playing && turn > lastClickTurn) {
        lastClickTurn = turn;
        burst(0.025, 2200, 0.09);
      } else if (turn < lastClickTurn) {
        lastClickTurn = turn;
      }
    },
    exposures(list) {
      for (const exp of list) chime(INSTRUMENTS[exp.inst].note);
    },
    event(id) {
      if (id === "entry") burst(0.7, 140, 0.22);
      else if (id === "chute" || id === "stab") burst(0.45, 90, 0.28);
      else if (id === "shield" || id === "cover") burst(0.3, 220, 0.16);
      else if (id === "land") burst(0.55, 70, 0.3);
      else if (id === "loss") burst(0.4, 400, 0.05);
    },
  };
}
