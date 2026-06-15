import re
from pathlib import Path

from flask import Flask, jsonify, render_template

app = Flask(__name__)

SENTENCE_DIRS = ("fvox",)
VOICE_DIRS = ("vox", "fvox")

# ---- Weapon sound classification ----

_DEPLOY_RE = re.compile(r"^(.+?)_(deploy\d*|silencer_on|silencer_off|twirl)$")

_RELOAD_ACTIONS: dict[str, int] = {
    "reloadstart": 0, "clipout": 1, "boxout": 1,
    "clipin": 2, "leftclipin": 2, "rightclipin": 3,
    "boxin": 2, "insertshell": 2,
    "forearm": 4, "boltpull": 5, "boltslap": 5,
    "bolt": 5, "chain": 6, "slideback": 7, "slidepull": 7,
    "sliderelease": 8, "cliprelease": 8,
    "coverdown": 9, "coverup": 10, "pump": 11, "slide": 12,
}
_RELOAD_SORTED = sorted(_RELOAD_ACTIONS, key=len, reverse=True)

_FIRE_RE = re.compile(r"^(.+?)(?:-\d+$|_fire(?:-\d+)?$|_unsil-\d+$)")
_BURST_RE = re.compile(r"^(.+?)-burst$")
_FIRE_BARE_RE = re.compile(r"^([a-z]+)(\d+)$")
_KNIFE_AIR_RE = re.compile(r"^knife_slash\d*$")
_KNIFE_WALL_RE = re.compile(r"^knife_hitwall\d*$")
_KNIFE_HIT_RE = re.compile(r"^knife_hit\d*$")
_KNIFE_STAB_RE = re.compile(r"^knife_stab$")
_GENERIC_RELOAD_STEMS = {
    "boltpull", "clipin", "clipout", "slideback", "sliderelease",
    "boltdown", "boltup",
}


_FIRE_OVERRIDES: dict[str, str] = {
    "glock18-1": "glock18_burst",
}


def _classify_weapon_sound(stem: str) -> tuple[str, str, int] | None:
    """Return (weapon_name, category, sort_order) or None."""
    # Manual overrides
    if stem in _FIRE_OVERRIDES:
        return (_FIRE_OVERRIDES[stem], "fire", 0)

    # Deploy
    m = _DEPLOY_RE.match(stem)
    if m:
        return (m.group(1), "deploy", 0)

    # Reload — longest suffix first
    for action in _RELOAD_SORTED:
        suffix = f"_{action}"
        if stem.endswith(suffix):
            weapon = stem[: -len(suffix)]
            if weapon:
                return (weapon, "reload", _RELOAD_ACTIONS[action])

    # Generic reload (generic_reload, generic_shot_reload)
    if stem in ("generic_reload", "generic_shot_reload"):
        return ("generic", "reload", 0)

    # Generic reload with trailing number (boltpull1, clipin1 …)
    bare = re.sub(r"\d+$", "", stem)
    if bare in _GENERIC_RELOAD_STEMS:
        return ("generic", "reload", _RELOAD_ACTIONS.get(bare, 99))

    # Knife attacks → split by target
    if _KNIFE_AIR_RE.match(stem):
        return ("knife_air", "fire", 0)
    if _KNIFE_WALL_RE.match(stem):
        return ("knife_wall", "fire", 0)
    if _KNIFE_HIT_RE.match(stem):
        return ("knife_hit", "fire", 0)
    if _KNIFE_STAB_RE.match(stem):
        return ("knife_stab", "fire", 0)

    # Burst fire → separate entry
    m = _BURST_RE.match(stem)
    if m:
        return (f"{m.group(1)}_burst", "fire", 0)

    # Fire: weapon-N, weapon_fire, weapon_unsil-N
    m = _FIRE_RE.match(stem)
    if m:
        weapon = m.group(1)
        if "_unsil" in stem:
            weapon = f"{weapon}_unsil"
        return (weapon, "fire", 0)

    # Fire: bare-number suffix (awp1, usp1, …)
    m = _FIRE_BARE_RE.match(stem)
    if m:
        return (m.group(1), "fire", 0)

    # Dryfire
    if stem.startswith("dryfire_"):
        return (stem, "fire", 0)

    return None


_FIRE_RATES: dict[str, int] = {
    # SMGs (60000 / RPM = ms between shots)
    "tmp": 75,       # 800 RPM
    "mac10": 67,     # 900 RPM
    "mp5": 75,       # 800 RPM
    "ump45": 100,    # 600 RPM
    "p90": 67,       # 900 RPM
    # Rifles
    "ak47": 125,     # 600 RPM (1.25x)
    "m4a1": 108,     # 700 RPM (1.25x)
    "m4a1_unsil": 108,
    "famas": 120,    # 1000 RPM (2x)
    "galil": 115,    # 650 RPM (1.25x)
    "aug": 110,      # 680 RPM (1.25x)
    "sg552": 104,    # 727 RPM (1.25x)
    # LMG
    "m249": 120,     # 750 RPM (scaled)
    # Burst fire
    "famas_burst": 400, "glock18_burst": 400,
    # Pistols (semi-auto)
    "glock18": 150, "usp": 170, "usp_unsil": 170, "p228": 170,
    "fiveseven": 170, "elite": 170,
    # Slow / bolt-action / semi-auto snipers
    "deagle": 400, "awp": 1500, "scout": 1250,
    "g3sg1": 250, "sg550": 250,
    # Shotguns
    "m3": 1000, "xm1014": 350,
    # Melee
    "knife_air": 400, "knife_wall": 400, "knife_hit": 400, "knife_stab": 1000,
}
_DEFAULT_FIRE_RATE = 100

# Map sound weapon name → canonical weapon (matches gfx/vgui PNG name)
_SOUND_TO_WEAPON: dict[str, str | None] = {
    "ak47": "ak47", "aug": "aug", "awp": "awp",
    "deagle": "deserteagle", "de": "deserteagle",
    "elite": "elites",
    "famas": "famas", "famas_burst": "famas",
    "fiveseven": "fiveseven",
    "g3sg1": "g3sg1", "galil": "galil",
    "glock18": "glock18", "glock18_burst": "glock18",
    "m249": "m249", "m3": "m3",
    "m4a1": "m4a1", "m4a1_unsil": "m4a1",
    "mac10": "mac10", "mp5": "mp5",
    "p228": "p228", "p90": "p90",
    "scout": "scout", "sg550": "sg550", "sg552": "sg552",
    "tmp": "tmp", "ump45": "ump45",
    "usp": "usp45", "usp_unsil": "usp45",
    "xm1014": "xm1014",
    "knife": "knife",
    "knife_air": "knife", "knife_wall": "knife",
    "knife_hit": "knife", "knife_stab": "knife",
    "flashbang": "flashbang", "hegrenade": "hegrenade",
}

_WEAPON_LABELS: dict[str, str] = {
    "ak47": "CV-47", "aug": "Bullpup", "awp": "Magnum Sniper",
    "deserteagle": "Night Hawk", "elites": "Dual Elites",
    "famas": "Clarion 5.56", "fiveseven": "ES Five-Seven",
    "g3sg1": "D3/AU-1", "galil": "IDF Defender",
    "glock18": "9x19mm Sidearm", "m249": "M249",
    "m3": "Leone 12 Gauge", "m4a1": "Maverick M4A1",
    "mac10": "Ingram MAC-10", "mp5": "K&M Sub-Machine Gun",
    "p228": "228 Compact", "p90": "ES C90",
    "scout": "Schmidt Scout", "sg550": "Krieg 550",
    "sg552": "Krieg 552", "tmp": "Schmidt Machine Pistol",
    "ump45": "K&M UMP45", "usp45": "K&M .45 Tactical",
    "xm1014": "Leone YG1265",
    "knife": "Knife",
    "flashbang": "Flashbang", "hegrenade": "HE Grenade",
}


# (class_name, class_order, weapon_order)
_WEAPON_CLASS: dict[str, tuple[str, int, int]] = {
    # 1. Pistols
    "glock18":      ("Pistols", 1, 0),
    "usp45":        ("Pistols", 1, 1),
    "p228":         ("Pistols", 1, 2),
    "deserteagle":  ("Pistols", 1, 3),
    "fiveseven":    ("Pistols", 1, 4),
    "elites":       ("Pistols", 1, 5),
    # 2. Shotguns
    "m3":           ("Shotguns", 2, 0),
    "xm1014":       ("Shotguns", 2, 1),
    # 3. Sub-Machine Guns
    "tmp":          ("Sub-Machine Guns", 3, 0),
    "mac10":        ("Sub-Machine Guns", 3, 1),
    "mp5":          ("Sub-Machine Guns", 3, 2),
    "ump45":        ("Sub-Machine Guns", 3, 3),
    "p90":          ("Sub-Machine Guns", 3, 4),
    # 4. Rifles
    "galil":        ("Rifles", 4, 0),
    "famas":        ("Rifles", 4, 1),
    "ak47":         ("Rifles", 4, 2),
    "m4a1":         ("Rifles", 4, 3),
    "sg552":        ("Rifles", 4, 4),
    "aug":          ("Rifles", 4, 5),
    "scout":        ("Rifles", 4, 6),
    "awp":          ("Rifles", 4, 7),
    "g3sg1":        ("Rifles", 4, 8),
    "sg550":        ("Rifles", 4, 9),
    # 5. Machine Guns
    "m249":         ("Machine Guns", 5, 0),
    # 6. Equipment
    "knife":        ("Equipment", 6, 0),
    "hegrenade":    ("Equipment", 6, 1),
    "flashbang":    ("Equipment", 6, 2),
}


def get_weapon_groups(game: str) -> dict | None:
    """Group weapon sounds into per-weapon cards with fire/reload/deploy."""
    cat_dir = Path(app.static_folder) / game / "sound" / "weapons"
    if not cat_dir.is_dir():
        return None

    # Collect raw classified data
    fire_raw: dict[str, list[str]] = {}
    reload_raw: dict[str, list[tuple[int, str]]] = {}
    deploy_raw: dict[str, list[dict]] = {}

    for f in sorted(cat_dir.iterdir()):
        if not f.is_file() or f.suffix != ".wav":
            continue
        stem = f.stem
        file_path = f"{game}/sound/weapons/{f.name}"
        result = _classify_weapon_sound(stem)
        if result is None:
            continue
        weapon, cat, order = result
        if cat == "fire":
            fire_raw.setdefault(weapon, []).append(file_path)
        elif cat == "reload":
            reload_raw.setdefault(weapon, []).append((order, file_path))
        elif cat == "deploy":
            label = stem.replace("_", " ").replace("-", " ")
            deploy_raw.setdefault(weapon, []).append(
                {"label": label, "file": file_path}
            )

    # Sort reload files by mechanical order
    for weapon in reload_raw:
        reload_raw[weapon].sort(key=lambda x: x[0])
        reload_raw[weapon] = [  # type: ignore[assignment]
            f for _, f in reload_raw[weapon]
        ]

    # Merge into per-weapon cards
    cards: dict[str, dict] = {}

    def _card(canonical: str) -> dict:
        if canonical not in cards:
            img_path = (
                Path(app.static_folder) / game / "gfx" / "vgui"
                / f"{canonical}.png"
            )
            cards[canonical] = {
                "name": canonical,
                "label": _WEAPON_LABELS.get(canonical, canonical),
                "image": (
                    f"{game}/gfx/vgui/{canonical}.png"
                    if img_path.is_file() else None
                ),
                "fire": [],
                "reload": [],
                "deploy": [],
            }
        return cards[canonical]

    for snd_name, files in sorted(fire_raw.items()):
        canonical = _SOUND_TO_WEAPON.get(snd_name)
        if canonical is None:
            continue
        _card(canonical)["fire"].append({
            "label": snd_name.replace("_", " "),
            "files": files,
            "rate": _FIRE_RATES.get(snd_name, _DEFAULT_FIRE_RATE),
        })

    for snd_name, files in sorted(reload_raw.items()):
        canonical = _SOUND_TO_WEAPON.get(snd_name)
        if canonical is None:
            continue
        _card(canonical)["reload"].append({
            "label": snd_name.replace("_", " "),
            "files": files,  # type: ignore[dict-item]
        })

    for snd_name, entries in sorted(deploy_raw.items()):
        canonical = _SOUND_TO_WEAPON.get(snd_name)
        if canonical is None:
            continue
        _card(canonical)["deploy"].extend(entries)

    # Group cards into weapon classes
    classes: dict[int, dict] = {}
    for card in cards.values():
        cls_info = _WEAPON_CLASS.get(card["name"])
        if cls_info is None:
            continue
        cls_name, cls_order, wpn_order = cls_info
        card["_order"] = wpn_order
        if cls_order not in classes:
            classes[cls_order] = {
                "name": cls_name,
                "number": cls_order,
                "weapons": [],
            }
        classes[cls_order]["weapons"].append(card)

    for cls in classes.values():
        cls["weapons"].sort(key=lambda c: c["_order"])
        for w in cls["weapons"]:
            del w["_order"]

    return {
        "game": game,
        "classes": [classes[k] for k in sorted(classes)],
    }


_PLAYER_TEXTURES: dict[str, str] = {
    "slosh": "cstrike/img/texture/footsteps/!waterblue.png",
    "metal": "cstrike/img/texture/footsteps/generic015m.png",
    "swim": "cstrike/img/texture/footsteps/water4b.png",
    "wade": "cstrike/img/texture/footsteps/!mtxwater.png",
    "tile": "cstrike/img/texture/footsteps/-1fifties_f02.png",
    "dirt": "cstrike/img/texture/footsteps/-2Sand.png",
    "ladder": "cstrike/img/texture/footsteps/{ladder3b.png",
    "step": "cstrike/img/texture/footsteps/-1CastWll.png",
    "snow": "cstrike/img/texture/footsteps/snow.png",
    "grate": "cstrike/img/texture/footsteps/{grate2.png",
    "duct": "cstrike/img/texture/footsteps/duct_flr02.png",
}

_DEFAULT_PLAYER_RATE = 350
_PLAYER_RATES: dict[str, int] = {
    "swim": 500,
    "ladder": 425,
}

# Group ordering: (category_label, surfaces_in_order)
_PLAYER_SURFACE_GROUPS: list[tuple[str, list[str]]] = [
    ("Various", ["tile", "step", "dirt", "snow"]),
    ("Metal", ["metal", "grate", "duct", "ladder"]),
    ("Water", ["slosh", "swim", "wade"]),
]

_PLAYER_GROUP_RE = re.compile(r"^pl_([a-z]+)\d+$")


def get_player_groups(game: str) -> dict:
    """Group footstep sounds by surface type with texture mappings."""
    cat_dir = Path(app.static_folder) / game / "sound" / "footsteps"
    if not cat_dir.is_dir():
        return {"categories": []}

    raw: dict[str, list[str]] = {}

    for f in sorted(cat_dir.iterdir()):
        if not f.is_file() or f.suffix != ".wav":
            continue
        file_path = f"{game}/sound/footsteps/{f.name}"
        m = _PLAYER_GROUP_RE.match(f.stem)
        if m:
            raw.setdefault(m.group(1), []).append(file_path)

    categories = []
    for cat_label, surfaces in _PLAYER_SURFACE_GROUPS:
        tiles = []
        for surface in surfaces:
            files = raw.get(surface)
            if not files:
                continue
            texture = _PLAYER_TEXTURES.get(surface)
            texture_path = (
                Path(app.static_folder) / texture if texture else None
            )
            tiles.append({
                "name": surface.capitalize(),
                "image": (
                    texture
                    if texture_path and texture_path.is_file() else None
                ),
                "files": files,
                "rate": _PLAYER_RATES.get(surface, _DEFAULT_PLAYER_RATE),
            })
        if tiles:
            categories.append({"label": cat_label, "tiles": tiles})

    return {"categories": categories}


def get_games() -> list[str]:
    """Return list of game directories under static/."""
    return sorted(
        d.name
        for d in Path(app.static_folder).iterdir()
        if d.is_dir() and (d / "sound").is_dir()
    )


def get_categories(game: str) -> list[str]:
    """Return sound subdirectories for a game."""
    sound_dir = Path(app.static_folder) / game / "sound"
    if not sound_dir.is_dir():
        return []
    _HIDDEN_CATS = {"events", "de_torn", "items"}
    cats = sorted(
        d.name for d in sound_dir.iterdir()
        if d.is_dir() and d.name not in _HIDDEN_CATS
    )
    # Add sentence categories at the end
    sentences = parse_sentences(game)
    for prefix in SENTENCE_DIRS:
        if any(s["prefix"] == prefix for s in sentences):
            key = f"sentences:{prefix}"
            if key not in cats:
                cats.append(key)
    return cats


def get_sounds(game: str, category: str) -> list[dict]:
    """Return list of sound files in a game/category."""
    cat_dir = Path(app.static_folder) / game / "sound" / category
    if not cat_dir.is_dir():
        return []
    sounds = []
    for f in sorted(cat_dir.iterdir()):
        if f.is_file() and f.suffix in (".wav", ".mp3", ".ogg"):
            sounds.append(
                {
                    "label": f.stem.replace("_", " ").replace("-", " "),
                    "file": f"{game}/sound/{category}/{f.name}",
                }
            )
    return sounds


def parse_sentences(game: str) -> list[dict]:
    """Parse sentences.txt and return sentence entries for vox/fvox."""
    sentences_file = Path(app.static_folder) / game / "sound" / "sentences.txt"
    if not sentences_file.is_file():
        return []

    results = []
    modifier_re = re.compile(r"\([^)]*\)")

    for line in sentences_file.read_text(errors="replace").splitlines():
        line = line.strip()
        if not line or line.startswith("//"):
            continue

        parts = line.split(None, 1)
        if len(parts) < 2:
            continue

        name = parts[0]
        body = parts[1]

        # Strip all modifier tokens like (p120), (e80), (t30), (v50), (s0)
        body = modifier_re.sub("", body)

        # Determine the directory prefix from the first token
        tokens = body.split()
        if not tokens:
            continue

        # Check if first token has a directory prefix (e.g., "fvox/bell")
        if "/" in tokens[0]:
            prefix, first_word = tokens[0].split("/", 1)
        else:
            continue  # No directory prefix, skip

        if prefix not in SENTENCE_DIRS:
            continue

        # Build file list: first word already extracted, rest are plain words
        sound_dir = Path(app.static_folder) / game / "sound" / prefix
        files = []

        # Process first word
        if first_word and not first_word.startswith("."):
            wav = sound_dir / f"{first_word}.wav"
            if wav.is_file():
                files.append(f"{game}/sound/{prefix}/{first_word}.wav")

        # Process remaining tokens
        for token in tokens[1:]:
            # Some tokens may have their own directory prefix
            if "/" in token:
                new_prefix, word = token.split("/", 1)
                if word and not word.startswith("."):
                    wav = Path(app.static_folder) / game / "sound" / new_prefix / f"{word}.wav"
                    if wav.is_file():
                        files.append(f"{game}/sound/{new_prefix}/{word}.wav")
            else:
                # Clean up: strip commas and periods used as pause markers
                word = token.strip(".,")
                if not word:
                    continue
                wav = sound_dir / f"{word}.wav"
                if wav.is_file():
                    files.append(f"{game}/sound/{prefix}/{word}.wav")

        if files:
            # Build a readable label from the sentence name
            label = name.replace("_", " ")
            results.append(
                {"name": name, "label": label, "prefix": prefix, "files": files}
            )

    return results


@app.route("/")
def index():
    games = get_games()
    default_game = games[0] if games else "cstrike"
    categories = get_categories(default_game)
    default_cat = categories[0] if categories else ""
    sentence_builder = None
    weapon_groups = None
    player_groups = None
    if default_cat in VOICE_DIRS:
        sounds = []
        sentence_builder = {"game": default_game, "voice_dir": default_cat}
    elif default_cat == "weapons":
        sounds = []
        weapon_groups = get_weapon_groups(default_game)
    elif default_cat == "footsteps":
        sounds = []
        player_groups = get_player_groups(default_game)
    else:
        sounds = get_sounds(default_game, default_cat) if default_cat else []
    return render_template(
        "index.html",
        games=games,
        active_game=default_game,
        game=default_game,
        categories=categories,
        active_category=default_cat,
        sounds=sounds,
        sentences=None,
        sentence_builder=sentence_builder,
        weapon_groups=weapon_groups,
        player_groups=player_groups,
    )


@app.route("/soundboard/<game>/<category>")
def soundboard(game: str, category: str):
    base = dict(sounds=[], sentences=None, sentence_builder=None,
                weapon_groups=None, player_groups=None)
    if category.startswith("sentences:"):
        prefix = category.split(":", 1)[1]
        all_sentences = parse_sentences(game)
        base["sentences"] = [s for s in all_sentences if s["prefix"] == prefix]
    elif category in VOICE_DIRS:
        base["sentence_builder"] = {"game": game, "voice_dir": category}
    elif category == "weapons":
        base["weapon_groups"] = get_weapon_groups(game)
    elif category == "footsteps":
        base["player_groups"] = get_player_groups(game)
    else:
        base["sounds"] = get_sounds(game, category)
    return render_template("partials/soundboard.html", **base)


@app.route("/words/<game>/<voice_dir>")
def words(game: str, voice_dir: str):
    if voice_dir not in VOICE_DIRS:
        return jsonify([])
    sound_dir = Path(app.static_folder) / game / "sound" / voice_dir
    if not sound_dir.is_dir():
        return jsonify([])
    stems = sorted(
        f.stem for f in sound_dir.iterdir()
        if f.is_file() and f.suffix == ".wav"
    )
    return jsonify(stems)


@app.route("/categories/<game>")
def categories(game: str):
    cats = get_categories(game)
    default_cat = cats[0] if cats else ""
    sentence_builder = None
    weapon_groups = None
    player_groups = None
    if default_cat.startswith("sentences:"):
        sounds = []
    elif default_cat in VOICE_DIRS:
        sounds = []
        sentence_builder = {"game": game, "voice_dir": default_cat}
    elif default_cat == "weapons":
        sounds = []
        weapon_groups = get_weapon_groups(game)
    elif default_cat == "footsteps":
        sounds = []
        player_groups = get_player_groups(game)
    else:
        sounds = get_sounds(game, default_cat) if default_cat else []
    return render_template(
        "partials/categories.html",
        game=game,
        categories=cats,
        active_category=default_cat,
        sounds=sounds,
        sentences=None,
        sentence_builder=sentence_builder,
        weapon_groups=weapon_groups,
        player_groups=player_groups,
    )


if __name__ == "__main__":
    app.run(debug=True)
