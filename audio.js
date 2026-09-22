(() => {
  'use strict';

  let ctx = null;
  let masterGain = null;
  let currentTrack = null;
  let stopCurrent = null;

  function ensureCtx() {
    if (!ctx) {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      masterGain = ctx.createGain();
      masterGain.gain.value = 0.45;
      masterGain.connect(ctx.destination);
    }
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }

  function fadeTo(gainNode, target, time) {
    const now = ctx.currentTime;
    gainNode.gain.cancelScheduledValues(now);
    gainNode.gain.setValueAtTime(gainNode.gain.value, now);
    gainNode.gain.linearRampToValueAtTime(target, now + time);
  }

  function fadeOutAndStop(nodes, gainNodesToFade) {
    const now = ctx.currentTime;
    gainNodesToFade.forEach(g => {
      g.gain.cancelScheduledValues(now);
      g.gain.setValueAtTime(g.gain.value, now);
      g.gain.linearRampToValueAtTime(0, now + 1.1);
    });
    setTimeout(() => {
      nodes.forEach(n => {
        try { n.stop && n.stop(); } catch (e) { /* already stopped */ }
        try { n.disconnect && n.disconnect(); } catch (e) { /* already disconnected */ }
      });
    }, 1250);
  }

  // 暖光序曲：低音区开放排列和弦，三角波+低通滤波带来柔和的谐波质感，
  // 每个音由两个轻微失谐的振荡器组成温暖的合唱感，避免纯正弦音簇的"粗糙/头痛感"
  function startPad() {
    const freqs = [130.81, 196.0, 329.63]; // C3, G3, E4 —— 音程拉开的开放排列，而非紧密音簇
    const nodes = [];
    const noteGains = [];

    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 1100;
    filter.Q.value = 0.3;
    filter.connect(masterGain);
    nodes.push(filter);

    freqs.forEach((f, i) => {
      [-3, 3].forEach(cents => {
        const osc = ctx.createOscillator();
        osc.type = 'triangle';
        osc.frequency.value = f;
        osc.detune.value = cents;
        const g = ctx.createGain();
        g.gain.value = 0;
        osc.connect(g);
        g.connect(filter);
        osc.start();
        fadeTo(g, 0.05, 4);

        const detuneLFO = ctx.createOscillator();
        detuneLFO.frequency.value = 0.035 + i * 0.012;
        const detuneGain = ctx.createGain();
        detuneGain.gain.value = 3;
        detuneLFO.connect(detuneGain);
        detuneGain.connect(osc.detune);
        detuneLFO.start();

        nodes.push(osc, g, detuneLFO, detuneGain);
        noteGains.push(g);
      });
    });

    return () => fadeOutAndStop(nodes, noteGains);
  }

  // 雨声白噪音：滤波白噪音 + 缓慢的音量律动
  function startRain() {
    const bufferSize = ctx.sampleRate * 2;
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;

    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.loop = true;

    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 850;

    const g = ctx.createGain();
    g.gain.value = 0;

    src.connect(filter);
    filter.connect(g);
    g.connect(masterGain);
    src.start();
    fadeTo(g, 0.32, 2.2);

    const swell = ctx.createOscillator();
    swell.frequency.value = 0.06;
    const swellGain = ctx.createGain();
    swellGain.gain.value = 0.07;
    swell.connect(swellGain);
    swellGain.connect(g.gain);
    swell.start();

    const nodes = [src, filter, g, swell, swellGain];
    return () => fadeOutAndStop(nodes, [g]);
  }

  // 颂钵回响：低沉持续音 + 随机间隔的钵音
  function startBowl() {
    let active = true;
    const timers = [];

    const droneGain = ctx.createGain();
    droneGain.gain.value = 0;
    droneGain.connect(masterGain);
    const drone = ctx.createOscillator();
    drone.type = 'sine';
    drone.frequency.value = 110;
    drone.connect(droneGain);
    drone.start();
    fadeTo(droneGain, 0.035, 3);

    function strike() {
      if (!active) return;
      const base = 220 + Math.random() * 60;
      [1, 2.01, 3.5].forEach((mult, idx) => {
        const osc = ctx.createOscillator();
        osc.type = 'sine';
        osc.frequency.value = base * mult;
        const g = ctx.createGain();
        g.gain.value = 0;
        osc.connect(g);
        g.connect(masterGain);
        osc.start();
        const now = ctx.currentTime;
        const peak = idx === 0 ? 0.2 : 0.07;
        g.gain.linearRampToValueAtTime(peak, now + 0.06);
        g.gain.exponentialRampToValueAtTime(0.0001, now + 5.5);
        osc.stop(now + 6);
      });
      timers.push(setTimeout(strike, 7000 + Math.random() * 5000));
    }
    strike();

    return () => {
      active = false;
      timers.forEach(t => clearTimeout(t));
      fadeOutAndStop([drone, droneGain], [droneGain]);
    };
  }

  const STARTERS = { pad: startPad, rain: startRain, bowl: startBowl };

  window.AmbientAudio = {
    play(trackId) {
      if (!STARTERS[trackId]) return;
      ensureCtx();
      if (currentTrack === trackId) return;
      if (stopCurrent) { stopCurrent(); stopCurrent = null; }
      currentTrack = trackId;
      stopCurrent = STARTERS[trackId]();
    },
    stop() {
      if (stopCurrent) { stopCurrent(); stopCurrent = null; }
      currentTrack = null;
    },
    setVolume(v) {
      ensureCtx();
      masterGain.gain.value = Math.max(0, Math.min(1, v));
    },
    current() {
      return currentTrack;
    },
    isPlaying() {
      return currentTrack !== null;
    },
  };
})();
