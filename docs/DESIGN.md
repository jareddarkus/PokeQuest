# PokeQuest - design notes (from the owner's brief, 2026-11-24)

Private, friends-only web game. Main menu: **"PokÃ©mon White 2 Together"** (shared persistent server, PokeMMO-style) and
**PokÃ©mon Battle Royale** (we build the Battle Royale first).

## Look and feel
- All 2D, top-down, PokÃ©mon White 2 style. Minimal UI: black panels at 60% opacity, white text.
- Fonts: Unbounded Black (titles, sub-headers), Lexend Regular (text). Self-hosted with `@fontsource` (not hot-linked from Google: German GDPR).
- Menus (team, bag, PokÃ©mon summary) inspired by White 2's UI. Use White 2 UI/icon art from the player's own ROM; minimalist black UI for anything White 2 doesn't have.
- Controls: WASD / click. Everything else is clickable. Phone: on-screen D-pad (left by default, swappable to the right in Settings).
- Settings: zoom (zoomed-out default on desktop), D-pad side, customization button. Detect phone vs desktop (media query + touch) to set defaults.
- Usernames shown above OTHER players only, never above yourself.
- Character creator before entering the world, editable later in Settings: skin tone, hair, eyes, head, torso, hands, legs, shoes, skirt/trousers, hats...

## Art, sound and the ROM rule
- No Nintendo files in the repo, in Supabase or on any host. The browser reads the art from a game file the player picks on their own machine and keeps it in browser storage only.
- Owner's files: PokÃ©mon White 2 (Spanish, code IRDS, in a zip) and White 2 (English, IRDO). PokÃ©mon White 2 contains species #1-#649 (Gen 1-5), not Gen 6.
- Fallback when no game file is loaded: PokÃ©API sprites loaded at runtime from their servers + CC0 art.

## Battle Royale (build first)
- One big circular island, sea around it, the middle is the highest point (a mountain with stairs). Trees and tall grass everywhere; walking in tall grass triggers encounters at the official rates.
- Everyone starts in the outer ring. Combat between players is ONLY allowed at the peak (inner ring).
- Start: 5 PokÃ© Balls and a first-stage starter (exact rule still to decide).
- Rings: ring 1 wild PokÃ©mon = first stages; ring 2 = second stages; later rings = final stages / stronger. To pass to the next ring you beat a gym leader (4 gyms: N, E, S, W; each has a themed stadium; the leader's type is random per match). Beating the leader teleports you inward; no way back.
- Short matches (about 20 min): all battle XP x10.
- Item pickups (PokÃ© Ball sprite on the ground) give 5 random items by ring: ring 1 basic (PokÃ© Balls, potions, Exp. Share, type-boost items), ring 2+ better. Evolution stones appear in every ring. Bag has no size limit.
- Evolutions: stones for stone evolutions; level-up for level evolutions; time-of-day and friendship evolutions simply evolve on level-up (or a friendship item, to decide); trade evolutions via NPC trades.
- NPC trainers everywhere: walk, run, stand and look around. 4 tiles of vision: if they see you, you must battle. After the battle, talk to them to trade PokÃ©mon (each NPC trades twice: you give one, get theirs; second trade lets you swap back/forward, e.g. Timburr -> Conkeldurr trade chain).
- Moves are random from what that PokÃ©mon can learn at its level; you may swap to any move it knows or could have learned; new moves on level-up, also mid-battle.
- Nature and ability are randomized.
- Music: each ring gets a random town/city track, chosen before the match starts, same for every player in that ring.
- Anti-cheat: server checks battle moves, items and saves; speed check on movement.

## Multiplayer model
- Walking: your own character moves instantly; positions are broadcast through Supabase Realtime and drawn smoothly (target 0.1-0.2 s behind). Supabase project is in Frankfurt.
- Per-player story/cutscenes (the PokeMMO feel): progress is a per-player flag/step stored on the server. The client only plays the presentation, so Cheren can talk to one player while another never sees it. The server accepts only valid next steps.
- Ring damage outside the safe zone: computed from timestamps (no per-second timer needed).

## Accounts and hosting
- Login: username + password (internal made-up email). Supabase project "PokeQuest", ref uqthugajmqezxyamfsgn, eu-central-1.
- Repo: github.com/jareddarkus/PokeQuest (public; contains no game files or secrets).
- Hosting: public repo + GitHub Pages (https://jareddarkus.github.io/PokeQuest/). Sign-up is open (username + password only); the owner removed the invite code on purpose.

## Update 2 (owner, 2026-11-24) - Battle Royale rules, superseding earlier notes where they differ
- Island: 4 rings, each about 20 tiles thick, centre = peak (mountain with stairs). Spawn: players spread as far apart as possible in the OUTER ring.
- Ring contents: ring 1 = first forms (and no-evolution Pokémon of similar power), levels 1-10. Ring 2 = second forms, levels about 15-20 (also ring-1 species in stage 2, or stronger no-evolution ones). Ring 3 = final forms and strong Pokémon, legendaries allowed but max 2 per team. Ring 4 = the peak.
- Players can only fight each other at the peak (touching starts a battle). You can only be eliminated by a player at the peak. Last trainer standing wins.
- Gym leaders N/E/S/W (random types, themed stadium) gate the next ring; beating one teleports you inward, no way back.
- Collapse: every 15 s the outermost tiles fall into the water (to be confirmed: one 1-tile-thick band of the outermost ring per 15 s, so a 20-tile ring takes 5 min and the whole match ~20 min).
- XP x5 (was x10). EVs work like the real games (earned by battling, vitamins like Protein change them), IVs random; IVs, EVs, nature and ability are always visible. Shiny chance 1/200 encounters.
- Match flow: waiting room -> at least 2 players -> Ready / Cancel -> all ready = start -> 1 minute to pick a starter (any generation, level 5) -> spawn. Spawn items: 5 Poké Balls, 3 Potions, 5 Revives. Out of Pokémon and revives = stuck until you find revives.
- PC button always on screen (not usable during a battle). Team of 6.
- Rules: no Z-moves, no Mega Evolution, no Gigantamax, no Terastallization. Battle data from Pokémon Showdown (latest generation data, so Fairy type etc.).
- Art, 3D models and music come from the player's own Pokémon White 2 file. Invented art is only a last resort for things the ROM does not have (e.g. Gen 6+ species), and the owner prefers not to invent anything.

## Update 3 (owner, 2026-11-24)
- Collapse = one tile-thick BAND around the whole island every 15 s, from the outside in (20 bands per ring = 5 min per ring, ~20 min match). A player standing on a falling band is pushed to safety; if they are in the last band of a ring they are pushed into the next inner ring (skipping that ring's gym). Compute the collapse from the match start timestamp; render it as instanced tiles so it does not lag.
- Anti-cheat dropped on purpose (no paid server, no lag): game logic runs in the browsers, Supabase Realtime only relays, saves are written by the player's own client (RLS must allow own-row writes). No speed check either.
- Gen 6-9 species have no art in White 2: load Pokémon Showdown's animated sprites (play.pokemonshowdown.com/sprites/ani, gen5ani for Gen 1-5) at runtime, the way Showdown itself does. Never copy them into the repo.
- Music: look for an open-source JS synthesizer that can play DS SDAT/SSEQ (or convert SSEQ to MIDI + soundfont and play with an open-source web synth). To research later.
- ROM facts found (White 2, game code IRDO, parsed read-only): NitroFS at header offsets 0x40/0x48; `a/0/0/4` = Pokémon sprites, 20 files per national-dex number: file 0 = front sprite tiles (LZ11-compressed NCGR, 4bpp, tiled, 8 tiles wide), file 2 = animation atlas, file 4 = cell bank (RECN), 18 = normal palette, 19 = shiny palette (RLCN, 16 colours BGR555). 3D models are BMD0 (a/0/1/1, a/0/4/8, a/1/1/6...), textures BTX0 (a/0/1/4), animations BCA0, maps in a/0/0/8. Dev experiments are kept outside the repo.

## Progress log
- 2026-11-24: practice island works (walking, tall grass encounters, wild battles with the Showdown engine incl. catching, XP x5, level-ups, learning moves, evolutions by level/stone, team/summary with IV/EV/nature/ability/move swapping, bag, PC, gym leaders (teleport to next ring), trainer NPCs with 4-tile sight, collapse band logic, character creator, settings, phone D-pad). Sprites come from Showdown's sprite server at runtime. Dev shortcuts on the local test server: ?play&starter=Bulbasaur&testbattle&enc.
- NOT done yet: online lobby/ready flow, live positions of other players, PvP at the peak, starter timer (60 s), music, ROM importer (sprites/3D/music from the player's White 2 file), NPC trades, shiny odds are 1/200 in code but not yet tested, mobile layout not tested.

- 2026-11-24 (later): ROM importer built. `src/rom/*` reads a Pokémon White 2 .nds the player picks (File.slice, nothing uploaded), finds `a/0/0/4` and converts every Pokémon #1-#649 (front = file 0, back = file 9, normal palette = file 18, shiny = file 19; each 96x96 picture is four tile blocks 64x64 / 32x64 / 64x32 / 32x32 placed at (0,0) (64,0) (0,64) (64,64), 4bpp, tiles in raster order inside each block) into PNGs stored in the browser's IndexedDB. The game shows a "Choose your own Pokémon White 2 file" screen until that is done. Pokémon #650+ still use Showdown's sprite server (the game file has no art for them). Dev only: `POKEQUEST_DEV_ROM=<path to .nds>` + `npm run dev` lets `?play` read the file from the Desktop through /__dev_rom (not in the published site).
- Still to take from the ROM: animation (cells + RNAN), item/UI icons, Pokémon menu icons, trainer + NPC overworld sprites, map tiles/3D models, music.

- 2026-11-24 (maps): `web/src/rom/nitro.ts` reads the game's 3D files. Map container (a/0/0/8): header 'WB'/'GC' + u16 sections + u32 offsets (model BMD0 at offsets[0], permissions, building table, length). BMD0 -> MDL0 dictionary (dictionary tree starts 8 bytes after the dict start), model fields (render cmds / materials / pieces / objects), display lists (GX commands 0x20-0x28 colour/texcoord/vertices, 0x40 begin shape), materials pair texture + palette by NAME with BTX0 textures in a/0/1/4 (archive found by matching all names). Texture formats 1-7 decoded (A3I5, 4/16/256 colour, 4x4 compressed, A5I3, direct). Wrap/flip bits come from the MATERIAL's teximage param. One map tile = 16 model units. Dev viewer: `?mapview&map=N` on the local test server (three.js, perspective camera).
- NEXT: choose/arrange map chunks for the island, collision from the container's permission section (tile behaviour/flags), buildings via the building table (a/2/2/5 models + a/1/7/4 textures), overworld character sprites (a/0/3/1 player, a/0/3/2 NPCs), Pokémon animations, UI art, stat bars with EV/IV segments.

- 2026-11-24 (3D world): the game now draws the real White 2 map in 3D (three.js, `GameView3D.tsx`) with a perspective camera (pitch 52 deg, fov 28, distance 17 tiles; tuned by eye, NOT read from the ROM). The island = 5x5 real map chunks (grid window x 20..24, y 5..9, `WORLD_WINDOW` in `rom/worldData.ts`), cut into a circle (shader discards beyond `uCut`, which also drives the collapse), sea plane outside. Tile data (permission section, 8 bytes/tile: slope, distance, behaviour, flags; row-major): blocked = behaviour 1 with flag 1, 0xFF, 0x51-0x58, 0x72-0x79, 0xD4-0xE2; water = flag 2 / behaviours 0x3D-0x44; tall grass = behaviours 4-9, 0x21, 0x22; everything else walkable. Ground height per tile is found by looking straight down at the model (up-facing triangles, trees/plants ignored). Import (`importRom`) now also stores the 25 chunks + their texture archives in IndexedDB (key 'world'); RomMeta.version 3.
- Real W2 maps are mostly narrow routes: only ~20-30% of the island is walkable. `generateWorld` keeps the biggest connected area of each ring.
- Placeholders still to replace by ROM art: character sprites, gym signs (need building models: building table in the map container + a/2/2/5 models + a/1/7/4 textures), ball items, ring barriers.
