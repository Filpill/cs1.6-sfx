# CS 1.6 Soundboard

A Counter-Strike 1.6 soundboard web application themed after the Steam 2003 client UI. Built with Flask, HTMX, TypeScript, and the Web Audio API.

## What It Does

The app serves a browsable, playable collection of CS 1.6 game sounds organised by category (weapons, radio, ambience, vox, etc.). It provides three distinct interaction modes depending on the sound category:

- **Standard soundboard** -- a grid of buttons that each play a single sound clip on click. Used for most categories (radio, ambience, items, player, etc.).
- **Weapons buy menu** -- weapons grouped by class (Pistols, Shotguns, SMGs, Rifles, Machine Guns, Equipment) in a layout styled after the CS 1.6 buy menu. Each weapon card shows the weapon image and provides fire, reload, and deploy buttons. Fire buttons support hold-to-fire with per-weapon fire rates derived from actual CS 1.6 RPM values.
- **Sentence builder** -- an autocomplete-driven word picker for the vox/fvox voice directories. Users type partial words, select from a dropdown, build a sentence as removable chips, and play it back as a seamless audio sequence. A "Current Time" button in the menu bar announces the time using vox words.

## Tech Stack

| Layer    | Technology                          |
|----------|-------------------------------------|
| Backend  | Flask (Python 3.10+), Jinja2        |
| Frontend | HTMX 2.0, TypeScript, Web Audio API |
| Bundler  | esbuild                             |
| Styling  | Embedded CSS (Steam 2003 theme)     |

No database. All sound data is derived at runtime from the filesystem.

## Project Structure

```
app.py                          Flask app, routes, weapon classification logic
templates/
  index.html                    Main page (CSS, layout, HTMX wiring)
  partials/
    categories.html             Category tab bar (HTMX partial)
    soundboard.html             Sound content area (3 rendering modes)
static/
  js/main.ts                    TypeScript source (audio, sentence builder, hold-to-fire)
  dist/main.js                  Compiled bundle (esbuild output)
  cstrike/
    sound/
      weapons/                  ~150 weapon .wav files
      vox/                      Male AI voice words
      fvox/                     Female AI voice words
      radio/                    Radio commands
      ambience/, events/, ...   Other sound categories
      sentences.txt             Sentence definitions for fvox
    gfx/vgui/                   Weapon PNG icons (converted from TGA)
```

## Key Features

### Weapon Sound Classification

`app.py` classifies each weapon `.wav` file into fire, reload, or deploy using regex patterns. It handles:

- Fire variants (ak47-1, ak47-2), silenced/unsilenced, burst modes (glock18 burst, famas burst)
- Reload sequences ordered by mechanical step (clipout, clipin, boltpull, sliderelease, etc.)
- Deploy actions (draw, silencer on/off)
- Knife subcategories (air slash, wall hit, player hit, stab) with distinct fire rates

Weapons are then grouped into cards by canonical name and organised into classes matching the CS 1.6 buy menu.

### Hold-to-Fire

Fire buttons use `mousedown`/`mouseup` event delegation with `setInterval` to repeat shots at the weapon's fire rate. A random sound variant is chosen once on press and held for the duration. Overlapping Web Audio `BufferSource` nodes produce the layered gunfire effect.

### Sentence Builder

The `/words/<game>/<voice_dir>` endpoint returns available `.wav` stems as JSON. The TypeScript client fetches and caches this list, then filters it as the user types. Selected words appear as chips. Playback schedules each word's `AudioBuffer` sequentially using `start(when)` with accumulated durations.

### HTMX Partial Loading

Category and game tab switches use HTMX `hx-get` to swap content without full page reloads. The `htmx:afterSwap` event reinitialises sentence builders after DOM updates.

## Running

```bash
# Install Python dependencies
uv sync

# Build TypeScript
npm install
npm run build

# Run dev server
python app.py
```

The app runs at `http://localhost:5000` by default.
