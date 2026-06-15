# CS 1.6 Soundboard

An interactive web soundboard for Counter-Strike 1.6 game sounds, styled after the Steam 2003 client UI.

## Features

- **Weapon Soundboard** — CS 1.6 buy menu layout with fire, reload, and deploy sounds per weapon. Hold-to-fire plays at accurate RPM-derived fire rates.
- **Sentence Builder** — Autocomplete-driven word picker for composing and playing back VOX/FVOX voice sequences.
- **Standard Soundboard** — Button grid for radio commands, ambience, events, and other sound categories.
- **Footstep Sounds** — Grouped by surface type (tile, metal, water, etc.) with texture previews.
- **Time Announcement** — Reads the current time aloud using VOX words.

## Tech Stack

| Layer    | Technology                  |
|----------|-----------------------------|
| Backend  | Flask (Python 3.10+)        |
| Frontend | HTMX 2.0, TypeScript 5.4   |
| Audio    | Web Audio API               |
| Bundler  | esbuild                     |
| Styling  | Vanilla CSS (Steam 2003 theme) |

## Setup

```bash
# Python dependencies
uv sync

# JS dependencies
npm install

# Build TypeScript
npm run build

# Run dev server
python app.py
```

The app runs at `http://localhost:5000`.

Use `npm run watch` for automatic TypeScript rebuilds during development.

## Project Structure

```
app.py                  # Flask routes and sound classification logic
templates/
  index.html            # Main page with embedded CSS
  partials/             # HTMX partials for categories and soundboard
static/
  js/main.ts            # Audio playback, sentence builder, hold-to-fire
  dist/                 # Compiled JS output
  cstrike/
    sound/              # CS 1.6 .wav files (weapons, vox, radio, etc.)
    gfx/vgui/           # Weapon icon images
docs/
  overview.md           # Detailed project documentation
```
