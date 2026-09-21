/* 音效：WebAudio 程序化合成（无音频文件）。
 * 首次用户交互后才创建 AudioContext；提供静音开关；AudioContext 不可用时全部静默降级（null 守卫）。 */
'use strict';

const GengAudio = (function () {
  let ctx = null;
  let master = null;
  let muted = false;

  function ensure() {
    if (muted) return null;
    if (ctx) {
      if (ctx.state === 'suspended') { try { ctx.resume(); } catch (e) {} }
      return ctx;
    }
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.5;
      master.connect(ctx.destination);
      return ctx;
    } catch (e) { return null; }
  }

  /* 用户手势后调用一次，解锁音频 */
  function unlock() {
    const c = ensure();
    if (c && c.state === 'suspended') { try { c.resume(); } catch (e) {} }
  }

  function setMuted(m) {
    muted = !!m;
    if (master) { try { master.gain.value = muted ? 0 : 0.5; } catch (e) {} }
  }
  function isMuted() { return muted; }

  function tone(opts) {
    const c = ensure();
    if (!c) return;
    const o = opts || {};
    const t0 = c.currentTime;
    const osc = c.createOscillator();
    const gain = c.createGain();
    osc.type = o.type || 'sine';
    osc.frequency.setValueAtTime(o.f0, t0);
    if (o.f1) osc.frequency.exponentialRampToValueAtTime(Math.max(20, o.f1), t0 + (o.dur || 0.1));
    const vol = (o.vol == null ? 0.3 : o.vol);
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, vol), t0 + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + (o.dur || 0.1));
    osc.connect(gain); gain.connect(master);
    osc.start(t0); osc.stop(t0 + (o.dur || 0.1) + 0.02);
  }

  function noise(opts) {
    const c = ensure();
    if (!c) return;
    const o = opts || {};
    const dur = o.dur || 0.2;
    const buf = c.createBuffer(1, Math.max(1, Math.floor(c.sampleRate * dur)), c.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
    const src = c.createBufferSource();
    src.buffer = buf;
    const filter = c.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = o.cutoff || 900;
    const gain = c.createGain();
    gain.gain.value = o.vol == null ? 0.25 : o.vol;
    src.connect(filter); filter.connect(gain); gain.connect(master);
    src.start();
  }

  /* ---- 具体音效 ---- */
  let collectStreak = 0;

  function collect(combo) {
    const n = Math.min(11, Math.max(0, (combo || 1) - 1));
    const base = 520 * Math.pow(1.0595, n * 2);
    tone({ f0: base, f1: base * 1.35, dur: 0.11, type: 'triangle', vol: 0.26 });
    tone({ f0: base * 2, f1: base * 2.4, dur: 0.07, type: 'sine', vol: 0.12 });
  }
  function hit() {
    tone({ f0: 220, f1: 70, dur: 0.28, type: 'sawtooth', vol: 0.22 });
    noise({ dur: 0.22, cutoff: 700, vol: 0.2 });
  }
  function start() {
    tone({ f0: 330, f1: 660, dur: 0.16, type: 'triangle', vol: 0.24 });
    setTimeout(function () { tone({ f0: 495, f1: 990, dur: 0.18, type: 'triangle', vol: 0.22 }); }, 120);
  }
  function countdownBeep(last) { tone({ f0: last ? 880 : 660, dur: last ? 0.2 : 0.09, type: 'square', vol: last ? 0.18 : 0.1 }); }
  function finish(score, max) {
    const ratio = max > 0 ? Math.max(0, Math.min(1, score / max)) : 0;
    const notes = ratio > 0.7 ? [523, 659, 784, 1047] : (ratio > 0.35 ? [523, 659, 784] : [392, 440]);
    notes.forEach(function (f, i) {
      setTimeout(function () { tone({ f0: f, dur: 0.22, type: 'triangle', vol: 0.24 }); }, i * 130);
    });
  }
  function gameOver() {
    [400, 320, 240, 170].forEach(function (f, i) {
      setTimeout(function () { tone({ f0: f, f1: f * 0.85, dur: 0.24, type: 'sawtooth', vol: 0.18 }); }, i * 150);
    });
  }
  function click() { tone({ f0: 700, f1: 900, dur: 0.05, type: 'sine', vol: 0.14 }); }
  function pause() { tone({ f0: 500, f1: 350, dur: 0.12, type: 'sine', vol: 0.14 }); }

  return {
    unlock: unlock,
    setMuted: setMuted,
    isMuted: isMuted,
    collect: collect,
    hit: hit,
    start: start,
    countdownBeep: countdownBeep,
    finish: finish,
    gameOver: gameOver,
    click: click,
    pause: pause,
  };
})();

if (typeof window !== 'undefined') window.GengAudio = GengAudio;
