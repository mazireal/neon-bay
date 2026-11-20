# Neon Bay — an open-world crime game

[![gta6-01](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01)
[![rank](https://make.fun/badge/gta6-01/mazireal/neon-bay/rank.svg)](https://make.fun/bounty/gta6-01)
[![reward](https://make.fun/badge/gta6-01/mazireal/neon-bay/reward.svg)](https://make.fun/bounty/gta6-01)

An entry for [make.fun's gta6-01 bounty — "Make GTA 6"](https://make.fun/bounty/gta6-01): build the most complete open-world crime game you can, in the spirit of GTA 6, playable in a desktop browser from static files.

Kai Mercer just rolled into Neon Bay with $40 and a borrowed jacket. Rosa Delgado of the Sunset Diner needs a driver. The Viper crew needs a lesson. The city is yours.

## Play it

```sh
node serve.ts
# open http://localhost:8080
```

No build step, no dependencies, no network requests: `game/index.html` plus plain ES modules, all art drawn on canvas and all sound synthesized with WebAudio.

## What's in the game

- **A city to explore** — a 3600×2600 sun-soaked coastal world: a road grid with crosswalks at every intersection, a beach and marina, Palm Park, a hospital, a police HQ, a club, a garage, shops with neon signs, and named districts (Downtown, Midtown, Northside, Old Town, Southside, Harbor Docks, Palm Beach).
- **On foot and by car** — walk and run, aim with the mouse, or steal any parked car or carjack a moving one (the driver bails and flees). Sedans, taxis, sports cars, trucks and vans, each with its own handling; skid marks, damage smoke and explosions.
- **Traffic and pedestrians** — cars that follow the road grid, brake for jams and back out of them; pedestrians who stroll, flee from gunfire and scatter when a car mounts the sidewalk.
- **A wanted system and police chases** — five stars for carjacking, shooting, running people over and killing officers. Police cars converge from pursuit slots around you, ram, and back out when wedged; officers on foot try to bust you. Hide until the heat cools off — or get BUSTED or WASTED and wake up lighter in the wallet.
- **Five story missions** — First Wheels, The Delivery (timed), Street Heat (clear the Vipers out of Palm Park), The Getaway (lose three stars), Neon Nights (the finale at the marina) — with a mission card, an objective pill, a minimap marker, a light-pillar beacon and an off-screen arrow. Finish them all and the city is free roam, with 10 neon tokens to collect.
- **Combat** — mouse aim, a 12-round magazine, reloads, enemy gang members who close in and shoot back, health and ammo pickups, slow health regen after a calm stretch.
- **A HUD with a minimap** — wanted stars, health, cash, tokens, ammo, speed, district, objective, a live minimap with mission, police and enemy blips, and a mission-complete banner.
- **Start, pause and save** — a title screen with an attract mode over the living city, pause, and autosave (every 30 seconds and on every mission completion) so progress survives closing the tab. Continue where you left off, or press N for a new game.

## Controls

| Keys | Action |
| --- | --- |
| WASD / arrows | Move on foot, drive |
| Mouse | Aim |
| Click | Shoot |
| E | Steal / leave car |
| R | Reload |
| Shift | Run |
| Space | Handbrake |
| P / Esc | Pause |
| M | Mute |

## Screenshots

The four screenshots in `screenshots/` are real frames of this game's own code, staged by `game/src/shots.js` — driving downtown (the cover), a three-star police chase, the Palm Park firefight, and the title screen. Re-take them with the queries in `shots.json`, e.g. `http://localhost:8080/?shot=drive&seed=7`.

## How it's built

Everything is original and written for this entry: the city, characters, vehicles, names, story, art, sound and music. Nothing from Rockstar Games or GTA.

```
game/
  index.html        the page: one canvas, one module script
  src/
    main.js         boot, fixed-step loop, screens, audio wiring
    world.js        the simulation: builds the city and steps every system
    city.js         the road grid, blocks, buildings, park, beach, landmarks
    render.js       the pre-rendered city layer, cars, people, HUD, minimap, screens
    input.js        keyboard and mouse
    player.js       Kai on foot and behind the wheel
    vehicles.js     arcade driving, parked cars, traffic AI
    pedestrians.js  the people on the sidewalks
    police.js       the wanted system, chases, busts
    combat.js       bullets, the Viper gang, explosions, particles
    missions.js     the five-mission story
    audio.js        synthesized WebAudio: engine, siren, shots, synthwave bass
    save.js         localStorage autosave
    shots.js        the staged screenshot scenes
    config.js       every tuning number in one place
    random.js       the seeded random generator
```

`main.ts` is the entrypoint: it copies `game/` and `screenshots/` to the output directory and writes `dossier.json` with the vendored make.fun library. Check it with:

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
```

## License

MIT — see [LICENSE](LICENSE).
