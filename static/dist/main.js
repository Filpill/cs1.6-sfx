"use strict";
(() => {
  // static/js/main.ts
  var ctx = new AudioContext();
  var gainNode = ctx.createGain();
  gainNode.connect(ctx.destination);
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
})();
//# sourceMappingURL=main.js.map
