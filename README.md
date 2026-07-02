# ⛷️ Ski Slope Rush

An addicting Subway Surfers–style endless skiing game. Carve down an infinite slope with one thumb, dodge trees and rocks, hit jumps, thread near-misses for combo multipliers, and chase your high score.

**Zero dependencies, zero build step** — the whole game is one `index.html`.

## Play

- Open `index.html` in any browser, or serve it: `python3 -m http.server` → http://localhost:8000
- Works great on mobile (add to home screen) and via GitHub Pages.

## Controls

| Input | Action |
|---|---|
| Hold **left / right half** of the screen | Carve left / right |
| **← →** or **A D** | Carve (keyboard) |
| **Space / Enter** | Start / retry |

## The loop

- **Speed ramps forever** — reaction time shrinks the longer you survive.
- **Near-misses** ("CLOSE!") and coins build a **×1–×5 combo multiplier**.
- **Jump ramps** launch you airborne: invulnerable, big points.
- **Coins** persist between runs and buy cosmetic **carve trails** in the shop (Powder → Rainbow).
- **One revive per run** — the rewarded-ad hook point (free in this build).

Best score, coin bank, and unlocked trails are saved in `localStorage`.
