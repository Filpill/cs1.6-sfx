"use strict";
(() => {
  // static/js/main.ts
  var ctx = new AudioContext();
  var gainNode = ctx.createGain();
  gainNode.connect(ctx.destination);
  var soundEvents = [];
  var totalSoundsPlayed = 0;
  var sessionStart = Date.now();
  function recordSoundPlayed() {
    totalSoundsPlayed++;
    soundEvents.push(Date.now());
    drawChart();
    updateChartStats();
  }
  function updateChartStats() {
    const totalEl = document.getElementById("chart-total");
    const rateEl = document.getElementById("chart-rate");
    if (totalEl) totalEl.textContent = String(totalSoundsPlayed);
    if (rateEl) {
      const elapsedMin = (Date.now() - sessionStart) / 6e4;
      const rate = elapsedMin > 0 ? totalSoundsPlayed / elapsedMin : 0;
      rateEl.textContent = rate.toFixed(1);
    }
  }
  function drawChart() {
    const canvas = document.getElementById("activity-chart");
    if (!canvas) return;
    const container = canvas.parentElement;
    const dpr = window.devicePixelRatio || 1;
    const rect = container.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    const c = canvas.getContext("2d");
    c.scale(dpr, dpr);
    const W = rect.width;
    const H = rect.height;
    const pad = { top: 12, right: 12, bottom: 24, left: 32 };
    const plotW = W - pad.left - pad.right;
    const plotH = H - pad.top - pad.bottom;
    c.fillStyle = "#1e1e18";
    c.fillRect(0, 0, W, H);
    if (soundEvents.length === 0) {
      c.fillStyle = "#706e62";
      c.font = "11px Tahoma, Arial, sans-serif";
      c.textAlign = "center";
      c.textBaseline = "middle";
      c.fillText("Play a sound to begin tracking", W / 2, H / 2);
      return;
    }
    const now = Date.now();
    const points = [];
    points.push({ t: 0, v: 0 });
    for (let i = 0; i < soundEvents.length; i++) {
      const t = (soundEvents[i] - sessionStart) / 1e3;
      points.push({ t, v: i + 1 });
    }
    const totalElapsed = (now - sessionStart) / 1e3;
    points.push({ t: totalElapsed, v: totalSoundsPlayed });
    const maxT = Math.max(totalElapsed, 10);
    const rawMaxV = totalSoundsPlayed;
    const maxV = Math.max(Math.ceil(rawMaxV / 5) * 5, 5);
    c.strokeStyle = "#2a2a20";
    c.lineWidth = 1;
    const ySteps = 5;
    c.fillStyle = "#706e62";
    c.font = "10px Tahoma, Arial, sans-serif";
    c.textAlign = "right";
    c.textBaseline = "middle";
    for (let i = 0; i <= ySteps; i++) {
      const val = Math.round(maxV / ySteps * i);
      const y = pad.top + plotH - i / ySteps * plotH;
      c.beginPath();
      c.moveTo(pad.left, y);
      c.lineTo(pad.left + plotW, y);
      c.stroke();
      c.fillText(String(val), pad.left - 4, y);
    }
    const xSteps = 4;
    c.textAlign = "center";
    c.textBaseline = "top";
    for (let i = 0; i <= xSteps; i++) {
      const val = maxT / xSteps * i;
      const x = pad.left + i / xSteps * plotW;
      c.beginPath();
      c.moveTo(x, pad.top);
      c.lineTo(x, pad.top + plotH);
      c.stroke();
      let label;
      if (maxT >= 120) {
        label = (val / 60).toFixed(1) + "m";
      } else {
        label = Math.round(val) + "s";
      }
      c.fillText(label, x, pad.top + plotH + 4);
    }
    function toX(t) {
      return pad.left + t / maxT * plotW;
    }
    function toY(v) {
      return pad.top + plotH - v / maxV * plotH;
    }
    c.beginPath();
    c.moveTo(toX(points[0].t), toY(points[0].v));
    for (let i = 1; i < points.length; i++) {
      c.lineTo(toX(points[i].t), toY(points[i - 1].v));
      c.lineTo(toX(points[i].t), toY(points[i].v));
    }
    c.lineTo(toX(points[points.length - 1].t), toY(0));
    c.lineTo(toX(points[0].t), toY(0));
    c.closePath();
    c.fillStyle = "rgba(106, 122, 62, 0.2)";
    c.fill();
    c.beginPath();
    c.moveTo(toX(points[0].t), toY(points[0].v));
    for (let i = 1; i < points.length; i++) {
      c.lineTo(toX(points[i].t), toY(points[i - 1].v));
      c.lineTo(toX(points[i].t), toY(points[i].v));
    }
    c.strokeStyle = "#8a9a5e";
    c.lineWidth = 1.5;
    c.stroke();
  }
  var volumeSlider = document.getElementById("volume-slider");
  if (volumeSlider) {
    gainNode.gain.value = parseInt(volumeSlider.value, 10) / 100;
    volumeSlider.addEventListener("input", () => {
      gainNode.gain.value = parseInt(volumeSlider.value, 10) / 100;
    });
  }
  var bufferCache = /* @__PURE__ */ new Map();
  var activeSources = [];
  async function fetchBuffer(url) {
    const cached = bufferCache.get(url);
    if (cached) return cached;
    const res = await fetch(url);
    const arr = await res.arrayBuffer();
    const buf = await ctx.decodeAudioData(arr);
    bufferCache.set(url, buf);
    return buf;
  }
  async function playSounds(files) {
    if (ctx.state === "suspended") await ctx.resume();
    const buffers = await Promise.all(files.map(fetchBuffer));
    let when = ctx.currentTime;
    for (const buf of buffers) {
      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.connect(gainNode);
      src.start(when);
      activeSources.push(src);
      src.onended = () => {
        const idx = activeSources.indexOf(src);
        if (idx !== -1) activeSources.splice(idx, 1);
        updateStopBtn();
      };
      when += buf.duration;
      recordSoundPlayed();
    }
    updateStopBtn();
  }
  var NUMBER_WORDS = {
    0: ["zero"],
    1: ["one"],
    2: ["two"],
    3: ["three"],
    4: ["four"],
    5: ["five"],
    6: ["six"],
    7: ["seven"],
    8: ["eight"],
    9: ["nine"],
    10: ["ten"],
    11: ["eleven"],
    12: ["twelve"],
    13: ["thirteen"],
    14: ["fourteen"],
    15: ["fifteen"],
    16: ["sixteen"],
    17: ["seventeen"],
    18: ["eighteen"],
    19: ["nineteen"],
    20: ["twenty"],
    21: ["twenty", "one"],
    22: ["twenty", "two"],
    23: ["twenty", "three"],
    24: ["twenty", "four"],
    25: ["twenty", "five"],
    26: ["twenty", "six"],
    27: ["twenty", "seven"],
    28: ["twenty", "eight"],
    29: ["twenty", "nine"],
    30: ["thirty"],
    31: ["thirty", "one"],
    32: ["thirty", "two"],
    33: ["thirty", "three"],
    34: ["thirty", "four"],
    35: ["thirty", "five"],
    36: ["thirty", "six"],
    37: ["thirty", "seven"],
    38: ["thirty", "eight"],
    39: ["thirty", "nine"],
    40: ["fourty"],
    41: ["fourty", "one"],
    42: ["fourty", "two"],
    43: ["fourty", "three"],
    44: ["fourty", "four"],
    45: ["fourty", "five"],
    46: ["fourty", "six"],
    47: ["fourty", "seven"],
    48: ["fourty", "eight"],
    49: ["fourty", "nine"],
    50: ["fifty"],
    51: ["fifty", "one"],
    52: ["fifty", "two"],
    53: ["fifty", "three"],
    54: ["fifty", "four"],
    55: ["fifty", "five"],
    56: ["fifty", "six"],
    57: ["fifty", "seven"],
    58: ["fifty", "eight"],
    59: ["fifty", "nine"]
  };
  function buildTimeFiles(game) {
    const now = /* @__PURE__ */ new Date();
    const h = now.getHours();
    const m = now.getMinutes();
    const s = now.getSeconds();
    const words = [
      "the",
      "time",
      "is",
      ...NUMBER_WORDS[h],
      "hours",
      "_comma",
      ...NUMBER_WORDS[m],
      "minutes",
      "and",
      ...NUMBER_WORDS[s],
      "seconds"
    ];
    return words.map((w) => `/static/${game}/sound/vox/${w}.wav`);
  }
  var fireActive = false;
  var fireInterval = null;
  var fireCycleIndex = 0;
  var SHELL_DELAY = 0.3;
  var SHELL_VOLUME = 0.3;
  function startFiring(files, rate, btn, playShell = true) {
    stopFiring();
    fireActive = true;
    btn.classList.add("firing");
    updateStopBtn();
    const mode = btn.dataset.fireMode || "random";
    let chosen;
    if (mode === "cycle") {
      fireCycleIndex = 0;
    } else {
      chosen = files[Math.floor(Math.random() * files.length)];
    }
    const gameDir = files[0].split("/")[0];
    const shellUrl = playShell ? `/static/${gameDir}/sound/weapons/pl_shell1.wav` : "";
    async function fireOnce() {
      if (!fireActive) return;
      const url = mode === "cycle" ? `/static/${files[fireCycleIndex++ % files.length]}` : `/static/${chosen}`;
      if (ctx.state === "suspended") await ctx.resume();
      const fetches = [fetchBuffer(url)];
      if (playShell) fetches.push(fetchBuffer(shellUrl));
      const results = await Promise.all(fetches);
      if (!fireActive) return;
      const buf = results[0];
      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.connect(gainNode);
      src.start();
      activeSources.push(src);
      src.onended = () => {
        const idx = activeSources.indexOf(src);
        if (idx !== -1) activeSources.splice(idx, 1);
        updateStopBtn();
      };
      recordSoundPlayed();
      if (playShell) {
        const shellBuf = results[1];
        const shellGain = ctx.createGain();
        shellGain.gain.value = SHELL_VOLUME;
        shellGain.connect(gainNode);
        const shell = ctx.createBufferSource();
        shell.buffer = shellBuf;
        shell.connect(shellGain);
        shell.start(ctx.currentTime + SHELL_DELAY);
        activeSources.push(shell);
        shell.onended = () => {
          const idx = activeSources.indexOf(shell);
          if (idx !== -1) activeSources.splice(idx, 1);
          updateStopBtn();
        };
      }
    }
    fireOnce();
    fireInterval = window.setInterval(fireOnce, rate);
  }
  function stopFiring() {
    fireActive = false;
    if (fireInterval !== null) {
      clearInterval(fireInterval);
      fireInterval = null;
    }
    document.querySelectorAll(".weapon-fire-btn.firing").forEach((b) => b.classList.remove("firing"));
    updateStopBtn();
  }
  document.addEventListener("mousedown", (e) => {
    const btn = e.target.closest("[data-fire]");
    if (!btn) return;
    e.preventDefault();
    const files = JSON.parse(btn.dataset.fire);
    const rate = parseInt(btn.dataset.fireRate || "100", 10);
    const shell = !btn.classList.contains("player-tile");
    startFiring(files, rate, btn, shell);
  });
  document.addEventListener("mouseup", () => {
    if (fireActive) stopFiring();
  });
  document.addEventListener("mouseleave", () => {
    if (fireActive) stopFiring();
  });
  document.addEventListener("click", (e) => {
    const btn = e.target.closest(
      "[data-sound], [data-sounds], [data-tell-time]"
    );
    if (!btn) return;
    if (btn.dataset.tellTime !== void 0) {
      const game = btn.dataset.tellTime || "cstrike";
      playSounds(buildTimeFiles(game));
      return;
    }
    const soundsAttr = btn.dataset.sounds;
    if (soundsAttr) {
      const files = JSON.parse(soundsAttr);
      playSounds(files.map((f) => `/static/${f}`));
      return;
    }
    const src = btn.dataset.sound;
    if (!src) return;
    playSounds([src]);
  });
  var stopAllBtn = document.getElementById("stop-all-btn");
  function updateStopBtn() {
    if (!stopAllBtn) return;
    stopAllBtn.textContent = activeSources.length > 0 || fireActive ? "\u23F8" : "\u25B6";
  }
  function stopAll() {
    stopFiring();
    for (const src of activeSources) {
      src.stop();
    }
    activeSources.length = 0;
    updateStopBtn();
  }
  stopAllBtn?.addEventListener("click", stopAll);
  drawChart();
  window.addEventListener("resize", () => drawChart());
})();
//# sourceMappingURL=main.js.map
