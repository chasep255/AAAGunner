# AAAGunner

A browser arcade game: defend a coastal gun emplacement through three waves of attacking aircraft. Mouse aiming, a rotary gun, homing missiles, regenerating health, and spatial sound. Play at **https://chasep255.github.io/AAAGunner/**.

Aircraft approach from 2.5–4 km out on curved routes, bank into turns with limited roll and pitch rates, line up for forward gun passes, evade, and release decoy flares. Aircraft must stay clearly inside the current viewport with an unobstructed line of sight for 1.5 seconds before firing. The whole plane must fit inside a margin that keeps attacks away from the screen edges and HUD. Visibility is checked for every queued round, including after a resize. Leaving view or moving behind terrain resets the reaction time and stops further shots. Rounds already fired follow the gun barrels with gravity and can miss the emplacement. The camera keeps a fixed field of view. Gunfire and distant explosions arrive after their sound travel time. Heat-seeking missiles can lock approaching aircraft head-on as well as from behind. They accelerate to cruise speed, lead moving targets, and turn within an angular and lateral-acceleration limit. Losing a target outside the seeker cone ends tracking. Exhaust leaves a fading smoke trail in world space. Missiles have a five-round magazine; one replenishes every three seconds. They remain in flight until a collision or the 4 km range boundary. Each round lasts five minutes, split into three 100-second waves, with three difficulties and score streaks up to ×5.

The 20 mm rotary gun has yellow luminous tracers, visible HE impact bursts, and an optional gold aim-ahead ring calibrated against its projectile flight model. The **Aim-ahead indicator** setting is off by default and can be toggled in the main or pause menu without restarting. When enabled, aim at the ring and track it during a burst. It estimates aircraft movement and bullet drop; manoeuvres can still cause misses. The barrels also allow a longer burst before overheating.

The gun preset uses MKE’s published 20×102 mm six-barrel cannon muzzle velocity of **987 m/s**, with its **M56 A3 HEI-T projectile: 103 g, G1 BC 0.4933883**. Source: [MKE product catalogue](https://www.scribd.com/document/862494715/MKE-INC-PRODUCT-CATALOUGE-ENG), manufacturer catalogue mirrored on Scribd, entries “20×102 mm 6 Barrel Rotary Cannon” and “20 mm×102 HEI-T (M56 A3)”. The gun and ammunition figures come from separate catalogue entries; the ammunition acceptance velocity of 1030 m/s is measured **23.7 m downrange**, not at the muzzle, and is not used as muzzle velocity.

The game integrates gravity and G1 drag with those values in still air. Projectile length and spin effects are unused. HE flashes, smoke, fragments, and distance-delayed blast audio trigger on aircraft, terrain, or water contact. One or two direct HE hits destroy a plane. Damage, cadence, heat, effect sizes, and the 2 km / six-second projectile culling limits remain game rules.

The emplacement has 75 health (shown as 100% when full). Recovery starts after five seconds without a hit and restores four health per second. New damage restarts that delay, and pausing freezes recovery.

## Controls

| Action | Control |
| --- | --- |
| Aim | Mouse movement |
| Fire gun | Hold left mouse or Space |
| Fire missile | Right mouse or M |
| Pause / resume | P or Escape |
| Restart | R |
| Change difficulty | Pause, then Stop and change settings |

Touch players can drag to aim and fire, and use the on-screen missile button. Volume and the aim-ahead indicator remain adjustable while paused. Switching tabs or losing focus pauses the game. Scores stay in memory for the current visit.

## Run locally

Install **Emscripten 4.0.17**, CMake, and Python 3. With Emscripten on your PATH (or installed at ~/emsdk):

```sh
./build.sh -s
```

Open **http://localhost:8002**. Use `PORT=8080 ./build.sh -s` for a different port. `./build.sh` only builds; serve the resulting `dist/` directory with any static HTTP server. The source HTML needs the compiled physics module, so opening it directly as a file will not work.

## Project layout

- `web/src/main.js`: input, menus, HUD, and the fixed-step game loop.
- `web/src/gun-sight.js`: aim-ahead cue using the game’s projectile flight model.
- `web/src/game.js`: aircraft paths, weapons, health, scoring, and collision detection.
- `web/src/graphics/`: Three.js scenery, aircraft models, and effects.
- `web/src/audio.js`: procedural sound synthesis and distance-delayed mixing.
- `web/styles/`, `web/assets/`: interface and textures.
- `web/vendor/`: pinned Three.js 0.180.0 modules and license.
- `engine/`: independent C++ projectile physics and minimal WebAssembly bindings.
- `.github/workflows/pages.yml`: builds and deploys `dist/` on pushes to `main`.

The game is standalone. Its projectile engine originated in Ballistics Toolkit, with a reduced browser API and the unused wind-generator dependency removed. No adjacent checkout, toolkit server, shared navigation, or external asset CDN is required. Positions use metres: +X right, +Y up, forward −Z. Gameplay advances at 60 fixed steps per second.

## Deployment

The repository uses GitHub Pages with **GitHub Actions** as its publishing source. Push to `main` or run the Deploy game workflow manually. Only `dist/` is uploaded; build output is ignored by Git.

## Credits

Code is MIT licensed; see [LICENSE](LICENSE). Aircraft, scenery, and sounds are generated by the game. Included texture and library credits are in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md). Equipment and gameplay are fictional arcade designs.
