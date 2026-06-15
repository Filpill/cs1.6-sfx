const ctx = new AudioContext();
const gainNode = ctx.createGain();
gainNode.connect(ctx.destination);

const volumeSlider = document.getElementById("volume-slider") as HTMLInputElement | null;
if (volumeSlider) {
  gainNode.gain.value = parseInt(volumeSlider.value, 10) / 100;
  volumeSlider.addEventListener("input", () => {
    gainNode.gain.value = parseInt(volumeSlider.value, 10) / 100;
  });
}

const bufferCache = new Map<string, AudioBuffer>();
const activeSources: AudioBufferSourceNode[] = [];

async function fetchBuffer(url: string): Promise<AudioBuffer> {
  const cached = bufferCache.get(url);
  if (cached) return cached;
  const res = await fetch(url);
  const arr = await res.arrayBuffer();
  const buf = await ctx.decodeAudioData(arr);
  bufferCache.set(url, buf);
  return buf;
}

async function playSounds(files: string[]): Promise<void> {
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

const NUMBER_WORDS: Record<number, string[]> = {
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
  59: ["fifty", "nine"],
};

function buildTimeFiles(game: string): string[] {
  const now = new Date();
  const h = now.getHours();
  const m = now.getMinutes();
  const s = now.getSeconds();

  const words: string[] = [
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
    "seconds",
  ];

  return words.map((w) => `/static/${game}/sound/vox/${w}.wav`);
}


// ---- Weapon fire: hold-to-fire ----

// Hold-to-fire state
let fireActive = false;
let fireInterval: number | null = null;
let fireCycleIndex = 0;
const SHELL_DELAY = 0.3; // seconds delay for casing drop
const SHELL_VOLUME = 0.3; // shell casing volume relative to master

function startFiring(
  files: string[],
  rate: number,
  btn: HTMLElement,
  playShell: boolean = true
): void {
  stopFiring();
  fireActive = true;
  btn.classList.add("firing");
  updateStopBtn();

  const mode = btn.dataset.fireMode || "random";
  let chosen: string;

  if (mode === "cycle") {
    fireCycleIndex = 0;
  } else {
    chosen = files[Math.floor(Math.random() * files.length)];
  }

  // Derive shell casing path from the first fire file's game directory
  const gameDir = files[0].split("/")[0];
  const shellUrl = playShell ? `/static/${gameDir}/sound/weapons/pl_shell1.wav` : "";

  async function fireOnce(): Promise<void> {
    if (!fireActive) return;
    const url =
      mode === "cycle"
        ? `/static/${files[fireCycleIndex++ % files.length]}`
        : `/static/${chosen}`;
    if (ctx.state === "suspended") await ctx.resume();

    const fetches: Promise<AudioBuffer>[] = [fetchBuffer(url)];
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

    // Shell casing with slight delay at reduced volume
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

function stopFiring(): void {
  fireActive = false;
  if (fireInterval !== null) {
    clearInterval(fireInterval);
    fireInterval = null;
  }
  document
    .querySelectorAll<HTMLElement>(".weapon-fire-btn.firing")
    .forEach((b) => b.classList.remove("firing"));
  updateStopBtn();
}

// Fire button: mousedown starts, mouseup/mouseleave stops
document.addEventListener("mousedown", (e) => {
  const btn = (e.target as Element).closest<HTMLElement>("[data-fire]");
  if (!btn) return;
  e.preventDefault();
  const files: string[] = JSON.parse(btn.dataset.fire!);
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

// ---- Sound button click handlers ----

document.addEventListener("click", (e) => {
  const btn = (e.target as Element).closest<HTMLElement>(
    "[data-sound], [data-sounds], [data-tell-time]"
  );
  if (!btn) return;

  // Tell time button
  if (btn.dataset.tellTime !== undefined) {
    const game = btn.dataset.tellTime || "cstrike";
    playSounds(buildTimeFiles(game));
    return;
  }

  // Sentence button — multiple files played in sequence
  const soundsAttr = btn.dataset.sounds;
  if (soundsAttr) {
    const files: string[] = JSON.parse(soundsAttr);
    playSounds(files.map((f) => `/static/${f}`));
    return;
  }

  // Single sound button
  const src = btn.dataset.sound;
  if (!src) return;

  playSounds([src]);
});

// ---- Stop / Play-Pause ----

const stopAllBtn = document.getElementById("stop-all-btn");

function updateStopBtn(): void {
  if (!stopAllBtn) return;
  stopAllBtn.textContent = activeSources.length > 0 || fireActive ? "\u23F8" : "\u25B6";
}

function stopAll(): void {
  stopFiring();
  for (const src of activeSources) {
    src.stop();
  }
  activeSources.length = 0;
  updateStopBtn();
}

stopAllBtn?.addEventListener("click", stopAll);
