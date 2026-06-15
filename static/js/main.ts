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
    when += buf.duration;
  }
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
    "attention",
    "_comma",
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

// ---- Sentence Builder ----

const wordListCache = new Map<string, string[]>();

async function fetchWordList(game: string, voiceDir: string): Promise<string[]> {
  const key = `${game}/${voiceDir}`;
  const cached = wordListCache.get(key);
  if (cached) return cached;
  const res = await fetch(`/words/${game}/${voiceDir}`);
  const words: string[] = await res.json();
  wordListCache.set(key, words);
  return words;
}

function initSentenceBuilder(root: HTMLElement): void {
  const game = root.dataset.game!;
  const voiceDir = root.dataset.voiceDir!;
  const chipsEl = root.querySelector<HTMLElement>("#sb-chips")!;
  const inputEl = root.querySelector<HTMLInputElement>("#sb-input")!;
  const dropdownEl = root.querySelector<HTMLElement>("#sb-dropdown")!;
  const playBtn = root.querySelector<HTMLElement>("#sb-play")!;
  const clearBtn = root.querySelector<HTMLElement>("#sb-clear")!;

  const selectedWords: string[] = [];
  let wordList: string[] = [];
  let activeIndex = -1;

  fetchWordList(game, voiceDir).then((words) => {
    wordList = words;
  });

  function renderChips(): void {
    chipsEl.innerHTML = "";
    selectedWords.forEach((word, i) => {
      const chip = document.createElement("span");
      chip.className = "sb-chip";
      chip.textContent = word;
      const x = document.createElement("span");
      x.className = "sb-chip-x";
      x.textContent = "x";
      x.addEventListener("click", () => {
        selectedWords.splice(i, 1);
        renderChips();
      });
      chip.appendChild(x);
      chipsEl.appendChild(chip);
    });
  }

  function showDropdown(matches: string[]): void {
    dropdownEl.innerHTML = "";
    activeIndex = -1;
    if (matches.length === 0) {
      dropdownEl.classList.remove("open");
      return;
    }
    matches.forEach((word, i) => {
      const opt = document.createElement("div");
      opt.className = "sb-option";
      opt.textContent = word;
      opt.addEventListener("mousedown", (e) => {
        e.preventDefault();
        selectWord(word);
      });
      dropdownEl.appendChild(opt);
    });
    dropdownEl.classList.add("open");
  }

  function selectWord(word: string): void {
    selectedWords.push(word);
    renderChips();
    inputEl.value = "";
    dropdownEl.classList.remove("open");
    inputEl.focus();
  }

  function updateActive(): void {
    const opts = dropdownEl.querySelectorAll<HTMLElement>(".sb-option");
    opts.forEach((opt, i) => {
      opt.classList.toggle("active", i === activeIndex);
    });
    if (activeIndex >= 0 && opts[activeIndex]) {
      opts[activeIndex].scrollIntoView({ block: "nearest" });
    }
  }

  inputEl.addEventListener("input", () => {
    const q = inputEl.value.toLowerCase().trim();
    if (!q) {
      dropdownEl.classList.remove("open");
      return;
    }
    const matches = wordList.filter((w) => w.toLowerCase().includes(q)).slice(0, 50);
    showDropdown(matches);
  });

  inputEl.addEventListener("keydown", (e) => {
    const opts = dropdownEl.querySelectorAll<HTMLElement>(".sb-option");
    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (opts.length > 0) {
        activeIndex = Math.min(activeIndex + 1, opts.length - 1);
        updateActive();
      }
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      if (opts.length > 0) {
        activeIndex = Math.max(activeIndex - 1, 0);
        updateActive();
      }
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (activeIndex >= 0 && opts[activeIndex]) {
        selectWord(opts[activeIndex].textContent!);
      } else if (opts.length > 0) {
        selectWord(opts[0].textContent!);
      }
    } else if (e.key === "Escape") {
      dropdownEl.classList.remove("open");
    }
  });

  inputEl.addEventListener("blur", () => {
    dropdownEl.classList.remove("open");
  });

  playBtn.addEventListener("click", () => {
    if (selectedWords.length === 0) return;
    const files = selectedWords.map(
      (w) => `/static/${game}/sound/${voiceDir}/${w}.wav`
    );
    playSounds(files);
  });

  clearBtn.addEventListener("click", () => {
    selectedWords.length = 0;
    renderChips();
    inputEl.value = "";
    dropdownEl.classList.remove("open");
  });
}

function setupSentenceBuilders(): void {
  document.querySelectorAll<HTMLElement>(".sentence-builder").forEach((el) => {
    if (!el.dataset.sbInit) {
      el.dataset.sbInit = "1";
      initSentenceBuilder(el);
    }
  });
}

// Init on page load
setupSentenceBuilders();

// ---- Weapon fire: hold-to-fire ----

// Hold-to-fire state
let fireActive = false;
let fireInterval: number | null = null;
let fireCycleIndex = 0;

function startFiring(
  files: string[],
  rate: number,
  btn: HTMLElement
): void {
  stopFiring();
  fireActive = true;
  btn.classList.add("firing");

  const mode = btn.dataset.fireMode || "random";
  let chosen: string;

  if (mode === "cycle") {
    fireCycleIndex = 0;
  } else {
    chosen = files[Math.floor(Math.random() * files.length)];
  }

  async function fireOnce(): Promise<void> {
    if (!fireActive) return;
    const url =
      mode === "cycle"
        ? `/static/${files[fireCycleIndex++ % files.length]}`
        : `/static/${chosen}`;
    if (ctx.state === "suspended") await ctx.resume();
    const buf = await fetchBuffer(url);
    if (!fireActive) return;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.connect(gainNode);
    src.start();
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
}

// Fire button: mousedown starts, mouseup/mouseleave stops
document.addEventListener("mousedown", (e) => {
  const btn = (e.target as Element).closest<HTMLElement>("[data-fire]");
  if (!btn) return;
  e.preventDefault();
  const files: string[] = JSON.parse(btn.dataset.fire!);
  const rate = parseInt(btn.dataset.fireRate || "100", 10);
  startFiring(files, rate, btn);
});

document.addEventListener("mouseup", () => {
  if (fireActive) stopFiring();
});

document.addEventListener("mouseleave", () => {
  if (fireActive) stopFiring();
});

// Re-init after HTMX swaps
document.addEventListener("htmx:afterSwap", () => {
  setupSentenceBuilders();
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
