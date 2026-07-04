# 🌄 Powder Drift

A chill, flowy **3D physics-based skiing game** — an endless sunset freeride bowl in the spirit of Alto's Adventure, with SSX-style flick tricks. Carve an infinite pastel mountain, launch off kickers and wind lips, grind rails, and chain flips, spins, corks, and grabs into combo multipliers.

Built with Three.js (vendored — no CDN, no build step). Open it and ride.

## Play

- Serve the folder and open it: `python3 -m http.server` → http://localhost:8000
- Works on mobile (dual thumb joysticks) and desktop (keyboard). GitHub Pages-ready.

## Controls

| Input | Action |
|---|---|
| **Left joystick** / **A · D** | Carve left / right (momentum physics) |
| Left stick **back** / **S** | Hard edge — slow down |
| Left stick **up** / **W** | Tuck — go faster |
| **Right joystick flick** / **arrow keys** | Up = backflip, down = frontflip, left/right = 360 spins, diagonal = cork |
| Right stick **hold** / hold arrow / **Shift** | Grab (Mute, Indy, Method, Tail) — more air time = more points |
| **Space** | Pop off the snow |
| **Esc** | Pause |

## The loop

- **The mountain never ends** — a procedurally generated freeride bowl with rolling terrain, kickers, wind lips, grindable rails, pastel pines, and coin lines. No fail state, just flow.
- **Land clean to bank tricks** — each landed trick grows your **combo multiplier** (up to ×4). Under-rotate and you tumble, popping back up a second later with your combo gone.
- **Coins persist** between runs and buy **outfits** and **snow spray colors** in the Style Shop (Coral → Midnight, Powder → Rainbow).
- Best score, coin bank, and unlocked style are saved in `localStorage`.

## Tech

- `js/game.js` — the whole game: deterministic procedural heightfield (bowl + FBM noise + feature sectors), custom carving/air/grind/tumble physics, dual virtual joystick input, trick detection and naming, WebAudio ambience and SFX, chunked terrain streaming with instanced props.
- `vendor/` — Three.js 0.185, vendored so the game is fully self-contained.
