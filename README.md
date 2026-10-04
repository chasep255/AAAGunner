# AAAGunner

A browser defense game with four modes: **Coast**, with quad 20 mm cannons against aircraft; **Trench**, with a water-cooled Maxim against charging infantry; **B-17 Formation**, with six gun stations, supporting bombers, German fighters, and ground flak; and **A-10 Warthog**, where you fly strike passes against tanks with a nose cannon and JDAMs. All have mouse controls, three escalating waves over five minutes, three difficulties, and spatial sound. Play at **https://chasep255.github.io/AAAGunner/**.

Choose **Mode** before deploying. Pause and use **Stop and change settings** to switch modes. The modes share the projectile engine, effects, audio, and menus while keeping their combat rules and scenes separate.

## Coast

Aircraft approach from 2.5–4 km out on curved routes, bank into turns with limited roll and pitch rates, line up for forward gun passes, evade, and release decoy flares. They slow into banked turns and circle back through the visible arena instead of flying behind you. Flight lanes fit the current viewport. Aircraft must stay clearly inside the current viewport with an unobstructed line of sight for 1.5 seconds before firing. The whole plane must fit inside a margin that keeps attacks away from the screen edges and HUD. Visibility is checked for every queued round, including after a resize. Leaving view or moving behind terrain resets the reaction time and stops further shots. On gun passes, aircraft raise their noses to allow for projectile drop. Rounds still leave the fixed forward barrels, follow gravity, and can miss the emplacement. The camera keeps a fixed field of view. Gunfire and distant explosions arrive after their sound travel time. Heat-seeking missiles can lock approaching aircraft head-on as well as from behind. They accelerate to cruise speed, lead moving targets, and turn within an angular and lateral-acceleration limit. Losing a target outside the seeker cone ends tracking. Exhaust leaves a fading smoke trail in world space. Missiles have a five-round magazine; one replenishes every three seconds. They remain in flight until a collision or the 4 km range boundary. Each round lasts five minutes, split into three 100-second waves, with three difficulties and score streaks up to ×5.

Aircraft limits across the three waves are **4 / 5 / 7** on Relaxed, **5 / 7 / 8** on Arcade, and **8 / 9 / 10** on Frenzy. These are 25% above the previous wave limits, rounded up to whole planes. Each deployment starts with four aircraft; replacements arrive while the current wave is below its limit.

The quad 20 mm mount has four separate cannons with individual muzzle flashes and recoil. They alternate fire at a combined 60 rounds per second. Each round starts at its own muzzle and disperses within a cone around the aim direction. The cone grows from a 6 mrad radius when cold to 12 mrad at full heat, so shorter bursts keep the grouping tighter. The gun has yellow luminous tracers, visible HE impact bursts, and an optional gold aim-ahead ring calibrated against its projectile flight model. The **Aim-ahead indicator** setting is off by default and can be toggled in the main or pause menu without restarting. When enabled, aim at the ring and track it during a burst. It estimates aircraft movement and bullet drop; manoeuvres can still cause misses. The barrels also allow a longer burst before overheating.

The fictional quad mount retains the ballistic preset: it uses MKE’s published 20×102 mm six-barrel cannon muzzle velocity of **987 m/s**, with its **M56 A3 HEI-T projectile: 103 g, G1 BC 0.4933883**. Source: [MKE product catalogue](https://www.scribd.com/document/862494715/MKE-INC-PRODUCT-CATALOUGE-ENG), manufacturer catalogue mirrored on Scribd, entries “20×102 mm 6 Barrel Rotary Cannon” and “20 mm×102 HEI-T (M56 A3)”. The gun and ammunition figures come from separate catalogue entries; the ammunition acceptance velocity of 1030 m/s is measured **23.7 m downrange**, not at the muzzle, and is not used as muzzle velocity.

The game integrates gravity and G1 drag with those values in still air. Projectile length and spin effects are unused. HE flashes, smoke, fragments, and distance-delayed blast audio trigger on aircraft, terrain, or water contact. One or two direct HE hits destroy a plane. The mount, dispersion, damage, cadence, heat, effect sizes, and the 2 km / six-second projectile culling limits remain game rules.

Close passes can release a fictional glide bomb, with an audible warning, a marked position, and about four seconds to react. Shoot it down with the gun for 50 points; a missile collision also intercepts it. Bombs do not attract a heat-seeker lock. A nearby ground impact causes heavy blast damage, with the strongest damage closest to the emplacement. Each aircraft can bomb once per pass and rearm when it circles back. Incoming gun damage is applied per round that hits, so an uninterrupted burst is dangerous.

The emplacement has 75 health (shown as 100% when full). Recovery starts after five seconds without a hit and restores four health per second. New damage restarts that delay, and pausing freezes recovery.

## Trench

Defend a connected, dug-out WWI-style trench. You stand level with two allied Maxim crews on the firing line, behind the same sandbagged parapet. Timber revetments, duckboards, traverses, ammunition crates, and spent cases surround the position. Soft shadows, textured soil and timber, concertina wire, dead vegetation, and shell holes give no man’s land its shape.

Initial attackers start 170–265 metres out; later groups arrive 210–305 metres away. Larger assault groups stay spread out, dash between shell holes, and crouch in cover. More attackers lay down rifle fire from farther out, becoming more accurate as they close. Crater rims block rounds, and crouching reduces the exposed target. Hits wound you and near misses cause suppression, increasing gun dispersion. **Hold C**, right-click, or toggle **Take cover** to duck behind the parapet. You cannot fire while ducked, but cooling and recovery continue. Low rounds hit the parapet; your exposed head can be hit while operating the gun. You have 75 health, displayed as 100%, and regain four health per second after four seconds without damage. Zero health triggers a brief collapse with blood splashing and running down the screen, followed by a **Killed** result that identifies rifle or biplane gunfire. A gunfire death does not require a trench breach.

The Maxim has a water jacket, hose, feed belt, muzzle flash and recoil. It fires ten rounds per second with **unlimited ammunition and no reloads**. Sustained fire heats the water jacket; releasing the trigger cools it. Roughly 30 seconds of continuous fire overheats it, stopping fire until the jacket cools below 35%, about four seconds later. The optional aim-ahead ring accounts for movement and bullet drop. Swept collision checks follow separate head, torso, arm, and leg volumes, including the animated posture. Close-range muzzle alignment uses the body part under the sight. Head hits show HEADSHOT, and blood appears at the impact point. These are approximate body volumes, not per-triangle collisions.

Two friendly gunners support your defense from protected bays beside you, firing seven-round bursts with short pauses. They favor their own flank, split targets, skip enemies hidden by terrain, and become more accurate as attackers close. Enemy riflemen can target them as well as you. Each gunner has 45 health; a killed gunner slumps at the gun and stops firing for the rest of the round. The crew count shows how many remain, and restarting restores both. Friendly artillery sends a shell every 3.4–5.4 seconds from behind your line and targets groups of attackers, keeping impacts at least 45 metres forward of the position. A support counter tracks its fire; allied crews, riflemen, and artillery impacts have no floating labels. Blasts stop or suppress attackers and excavate persistent craters, with depressed bowls, raised rims, darkened soil, water, and scattered debris. The same terrain samples control rendering, infantry footing, blood effects, and bullet impacts. A new round restores the original battlefield.

The first enemy biplane arrives after 16 seconds. Further arrivals are spaced 25–29 seconds apart on Relaxed, 21–25 seconds on Arcade, and 17–21 seconds on Frenzy, with up to two aircraft present. They make forward-gun strafing runs and bank away. They have twin wings, struts and bracing wires, a turning propeller, visible gunfire, and engine sound. Shoot them during the approach or take cover. Bullets must intersect the wings, fuselage, engine, or tail. Engine hits do more damage than wing hits. Damaged planes trail smoke; fatal damage cuts the guns and engine, starts an uncontrolled descent, and awards 150 points once. The aircraft stays visible through the fall, crashes with fire and debris, and leaves a wreck briefly. The large explosion happens on ground impact. Incoming gunfire becomes more accurate as range closes. Attacks are limited to approaching planes in view; planes stop firing as they turn away.

Attackers turn inward to stay within your gun’s sector on the final approach. An attacker first climbs visibly over the parapet; a breach counts only after the climb reaches inside the trench, within that sector and after at least 1.5 seconds in view; off-screen runners must move back into reach, including after a resize. The line can withstand eight infantry breaches on Relaxed, five on Arcade, or three on Frenzy. LINE shows that separate allowance and does not regenerate. An overrun triggers a short animation: an attacker climbs into the trench, lunges with a bayonet, and blood and an impact sound precede the defeat screen. Both the overrun and gunfire-death sequences respect Pause, Stop, and Restart. Death blood remains visible on the result screen and clears on the next deployment. Bullet hits leave blood sprays, wounds and falling bodies; artillery adds dismemberment and fragments. Blood stains linger in the mud. All effect pools are bounded.

Hold until the five-minute timer expires to win. Infantry stops earn 25 points with streaks up to ×5; friendly and artillery stops do not add to your score. Each mode keeps its own session best.

This is an arcade representation. The Maxim profile uses fictional tuning (740 m/s, G1 BC 0.48, 11.3 g, 7.92 mm), with gravity and drag from the shared WASM engine and a 450-metre projectile boundary. These values are not presented as verified historical specifications.

## B-17 Formation

Defend a B-17F-style formation over a moving countryside at 6,000 metres. Twelve accompanying bombers form a layered, 13-aircraft formation, weave around their slots, bank with your pilot’s course changes, and fire aimed bursts at approaching Bf 109 and Fw 190 style fighters. Nearby cloud edges, distant cloud banks, contrails, propellers, engine sound, and subtle vibration convey flight. Ground batteries lead the formation with timed flak bursts. Their black smoke stays at its world position as you fly past; close explosions damage aircraft. Bomber hull damage is permanent for the round, and a lost wingman stops firing.

Choose a gun station before deployment or switch during combat with the numbered buttons or **1–6**:

| Key | Station | Guns |
| --- | --- | --- |
| 1 | Tail | Twin .50 cal |
| 2 | Port waist | Single .50 cal |
| 3 | Starboard waist | Single .50 cal |
| 4 | Flexible nose gun | Single .50 cal |
| 5 | Ball turret | Twin .50 cal |
| 6 | Upper turret | Twin .50 cal |

The ball and upper turrets traverse through **360 degrees**. Move your mouse toward a screen edge or hold the arrow keys to rotate and elevate; on touch, drag toward an edge. The ball turret moves from 85 degrees down to level; the upper turret moves from level to 85 degrees up. Camera, gun and reticle share these airframe-relative stops, including during banks. Reaching a stop limits movement without blocking firing. The occupied turret’s exterior shell is hidden so it cannot clip through the first-person view. Azimuth and elevation appear above the station buttons. Station buttons also show nearby fighter sectors. Each station keeps its own heat and cools while another is in use. Single guns fire 12 rounds per second, twin mounts 24; ammunition is unlimited. Heat glow is confined to the barrel jackets and muzzles; receivers and fittings remain unlit.

The nose is a flexible gun, not a B-17G chin turret. B-17 nose installations varied, and the later G added a twin-gun powered chin turret. The selected stations are a simplified F-style arrangement, not an exhaustive crew-position simulation. Historical references: [National Park Service B-17 history](https://www.nps.gov/articles/b17g-flying-fortress-no-4483690.htm), [US Air Force Museum upper turret](https://www.nationalmuseum.af.mil/Visit/Museum-Exhibits/Fact-Sheets/Display/Article/196223/b-17-upper-machine-gun-turret-type-a-1a/).

Fighters attack in groups from every direction, with 80% of reinforcements split between overhead dives, climbing attacks, and both sides. Initial fighter counts are 10 / 14 / 18 on Relaxed / Arcade / Frenzy, rising by three each wave. Groups of up to three replace departing aircraft, which stop occupying combat slots after their breakaway. Their flight velocity and visible heading account for the bomber’s movement: head-on passes close faster than tail chases. Bf 109s take ten hits and Fw 190s take twelve. Damage slows them, produces smoke, and shows remaining airframe strength. A kill starts a falling, smoking descent. The twelve other bombers have AI gunners; unselected stations on your own bomber are idle. Supporting crews fire simulated rounds that can damage and destroy fighters; their kills count separately from your score. A fighter must remain in your current view for 1.5 seconds before firing at your bomber. Attacks on wingmen can happen outside your view. Enemy bursts are more aggressive, bombers have less hull strength, and damaged wingmen lag, wobble and smoke. Your rounds can hit friendly fuselages, wings, engines and tails: the nearest airframe absorbs the shot. Friendly hits display remaining hull strength and can bring down a bomber, without awarding fighter points or accuracy credit.

Choose **270, 342, or 414 km/h true airspeed** before deploying. Bullets inherit the firing aircraft’s world velocity, then the WASM engine integrates gravity and G1 drag against the local air velocity. The atmosphere uses the density and sound speed at 6,000 metres. Steady wind advects the formation and air mass together; changing gusts add drift. Rounds stay in inertial world coordinates when the formation turns, and are transformed into the current view for collision and rendering. Forward, rearward, and side shots consequently have different flight paths. The optional gold sight ring solves using this same engine and wind field, with a constant-velocity target prediction. Shots launch at the visible barrel tip and share the aircraft’s physics step. Their first visible streak begins at that launch point; receiver recoil leaves the muzzle aligned, and subsequent streaks follow each round independently.

The .50 calibre profile is arcade tuning: 880 m/s muzzle velocity, 46 g projectile, G1 BC 0.62, and a 1.4 km / four-second projectile boundary. Airframe durability, cadence, heat, flight paths, flak, and gun arcs are also game rules. Local propeller wash, wake turbulence, spin drift, and detailed aircraft aerodynamics are not simulated. Physics checks cover inherited velocity, moving-frame equivalence, steady wind, gust drift, altitude, and bullet inertia through turns.

## A-10 Warthog

Fly a modeled A-10 style aircraft in a chase view over a desert valley. Hunt patrolling tanks with the fixed 30 mm nose cannon and guided JDAMs. Tanks track your aircraft and lead it with visible orange rounds; bank or change altitude to evade. Airframe damage is permanent, terrain collisions end the flight, and a warning appears below 85 metres above the ground. An announced flight assist turns you back at the edge of the combat area. The HUD shows speed, altitude above terrain, throttle, target range, and the bearing to the nearest tank.

The controls use assisted mouse steering: move up to climb, down to dive, and sideways to turn. Center the mouse to level out. **W/S** increases/decreases throttle; **A/D** banks. Arrow keys can also steer. The small **STEER** circle shows the control input, while the larger crosshair shows the cannon’s bore line. Hold **left mouse or Space** to fire; pitch the aircraft to line up the cannon. Rounds inherit aircraft velocity and use the shared WASM gravity/drag engine. Allow for bullet drop at long range. Eight direct hits destroy a tank; short bursts avoid overheating. Ammunition is unlimited.

Point the nose toward a tank inside 2.4 km, above 65 m altitude, until its marker says **JDAM**. **Right-click, M, or Drop JDAM** releases a bomb toward the ground coordinates captured at release. Bombs use bounded arcade glide guidance; moving tanks can leave the blast. Four bombs are carried, releases are spaced by 1.1 seconds, and one replenishes every 16 seconds. Nearby bomb blasts can damage your aircraft. Pausing freezes flight, combat, heat, and rearming. Restart restores the aircraft, targets, and weapons. Touch players can drag to steer and fire and use the JDAM button at the default cruise throttle.

Survive three 100-second waves. Initial tank counts are 7 / 10 / 14 on Relaxed / Arcade / Frenzy, with three more slots per wave and replacements arriving throughout the round. Kills earn 150 points with streaks up to ×5 for kills within eight seconds. Bomb hits do not count toward gun accuracy. Flight assistance, tank anti-aircraft fire, ammunition, guidance, performance, and damage are fictional arcade tuning, not verified aircraft or weapon specifications.

## Controls

| Action | Control |
| --- | --- |
| Aim | Mouse movement |
| Fire gun | Hold left mouse or Space |
| Fire missile (Coast) / drop JDAM (A-10) | Right mouse or M |
| Steer aircraft (A-10) | Mouse; center to level out; arrow keys also steer |
| Throttle / bank (A-10) | W/S throttle; A/D bank |
| Take cover (Trench) | Hold C; right mouse or Take cover toggles it |
| Pause / resume | P or Escape |
| Change gun station (B-17) | 1–6 or the station buttons |
| Rotate ball / upper turret (B-17) | Mouse toward screen edge or arrow keys |
| Restart | Restart button; R in Coast, B-17, and A-10 |
| Change mode or difficulty | Pause, then Stop and change settings |

Touch players can drag to aim and fire, and use the on-screen missile and cover buttons. Volume and the aim-ahead indicator remain adjustable while paused. Switching tabs or losing focus pauses the game. Scores stay in memory for the current visit, separately for each mode.

## Run locally

Install **Emscripten 4.0.17**, CMake, and Python 3. With Emscripten on your PATH (or installed at ~/emsdk):

```sh
./build.sh -s
```

Open **http://localhost:8002**. Use `PORT=8080 ./build.sh -s` for a different port. `./build.sh` only builds; serve the resulting `dist/` directory with any static HTTP server. The source HTML needs the compiled physics module, so opening it directly as a file will not work.

## Project layout

- `web/src/main.js`: input, menus, HUD, and the fixed-step game loop.
- `web/src/modes.js`: mode registry and mode-specific presentation and setup.
- `web/src/a10/`: assisted player flight, tank combat, cannon/JDAM weapons, aircraft models, and desert scenery.
- `web/src/b17/`: formation combat, gun stations, flak, moving-aircraft ballistics, aircraft models, and scenery.
- `web/src/trench/`: infantry and biplane attacks, Maxim, cover, friendly artillery, shared deformable terrain, trench scenery, and blood effects.
- `web/src/gun-sight.js`: aim-ahead cue using the game’s projectile flight model.
- `web/src/game.js`: aircraft paths, weapons, health, scoring, and collision detection.
- `web/src/graphics/`: Three.js scenery, aircraft models, and effects.
- `web/src/audio.js`: procedural sound synthesis and distance-delayed mixing.
- `web/styles/`, `web/assets/`: interface and textures.
- `web/vendor/`: pinned Three.js 0.180.0 modules and license.
- `engine/`: independent C++ projectile physics and minimal WebAssembly bindings.
- `.github/workflows/pages.yml`: builds and deploys `dist/` on pushes to `main`.

The game is standalone. Its projectile engine originated in Ballistics Toolkit, with a reduced browser API and the unused wind-generator dependency removed. No adjacent checkout, toolkit server, shared navigation, or external asset CDN is required. Positions use metres: +X right, +Y up, forward −Z. Gameplay advances at 60 fixed steps per second.

## Tests

After building the physics module, run `npm test` (Node.js 22 or newer). The tests use the compiled WASM module and cover airborne ballistics, collisions, multi-hit damage, flak, support kills, all six guns, round lifecycle, Coast/Trench compatibility, and A-10 flight controls, cannon/tank collisions, JDAM guidance and rearming, incoming fire, camera alignment, and round lifecycle.

## Deployment

The repository uses GitHub Pages with **GitHub Actions** as its publishing source. Push to `main` or run the Deploy game workflow manually. Only `dist/` is uploaded; build output is ignored by Git. The build gives each release a content-based asset directory, so the entry module, dynamic mode imports, physics, styles, and Three.js load from the same release even when older files are cached. Original asset paths remain available for previously cached pages.

## Credits

Code is MIT licensed; see [LICENSE](LICENSE). Aircraft, infantry, weapons, scenery, effects, and sounds are generated by the game. Included texture and library credits are in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md). Equipment and gameplay are fictional arcade designs.
