# PokeQuest — hand-over for a new Claude chat

Read this first, then use **graphify** (the GitHub tool the user mentioned) to map `web/src` instead of reading every file. Also read `docs/DESIGN.md` (long history of every round; the newest rounds are at the end).

## What it is
A private, friends-only **Pokémon battle royale** web game that looks and sounds like Pokémon White 2. React + Vite + TypeScript, three.js (overworld and battle scenes), Supabase (accounts, realtime, published world), GitHub Pages hosting: https://jareddarkus.github.io/PokeQuest/
The user has **zero coding experience** and does everything through Claude. UI is Spanish (Spain) or English (US) — **always US English and Spain Spanish**. Talk to the user in English, **very short, tl;dr replies**. Be honest about what was tested vs not.

## Standing rules from the user (never break)
- **All art / sound comes from the user's own White 2 ROM**, read in the browser and kept only in that browser (IndexedDB). Never upload or commit ROM data. "Don't invent anything"; look and sound like the real game. (Exception the user asked for: item icons come from PokéAPI sprites.)
- Pokémon #650+ are not in the ROM: Showdown pixel sprites (`ui/MonSprite.tsx`, `data/pixelSprites.json`).
- Keep the owner's email out of the public repo. Git identity for commits: `PokeQuest dev <dev@pokequest.invalid>`; end commit messages with `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.
- The owner/world-admin code and the invite code live only in Supabase (never write them in the repo). The one admin account is `Dungixel`.
- User wants things **verified visually** (screenshots in the built-in browser), copied frame by frame from reference recordings when they provide one.

## Where things are
- Repo: `C:\Users\jared\Desktop\PokeQuest\game` (web app in `web/`). Deploy: `powershell -File scripts\deploy.ps1` from the repo root (use PowerShell; builds and force-pushes `gh-pages`).
- Dev server: `npm run dev -- --port 5199` in `web/` with env `POKEQUEST_DEV_ROM` = path of the White 2 .nds (`C:\Users\jared\Desktop\Desktop\NDS games\Pokemon - White Version 2 (USA, Europe) (NDSi Enhanced).nds`). Open `http://localhost:5199/PokeQuest/?play&starter=Oshawott` (practice island, no login). `npx tsc -b` must pass before deploying.
- Supabase project ref `uqthugajmqezxyamfsgn` (tables: `world_admins`, `worlds`, invite codes, chat via realtime). Use the Supabase MCP `execute_sql` to inspect.
- Re-import of the ROM is forced when `VERSION` in `web/src/rom/store.ts` is bumped (currently 51); friends must pick the file again then.

## Code map (web/src)
- `ui/PlayScreen.tsx` — the match/island screen: HUD, events, battles, trainer state, duels, tournament, announcements, elimination + spectating, music choice. Biggest file; `PlayInner`.
- `game/GameView3D.tsx` — 3D overworld (camera, NPCs, other players, labels, busy balls, spectate camera). `game/world.ts` world generation, rings, collapse clock (`collapseInfo`), `game/rules.ts` (`RULES`: ring timing, legendary limit, items per battle, `expMultiplier` default 10, `watchAlive`, `watchEliminated`), `game/state.ts` (exp, EVs, evolution), `game/tournament.ts`.
- `ui/BattleScreen.tsx` — the whole battle (classic look always), events pump, move scripts via `rom/effVm.ts` + `rom/splFx.ts` (the game's own particle effects), send-out, HP drain 1 HP/frame, hit flicker, exp/level-up window, stat badges. `battle/engine.ts` = Pokémon Showdown sim wrapper emitting `BattleEvent`s; `battle/pvp.ts`, `battle/spectate.ts`.
- `ui/SummaryCard.tsx` + `ui/summary.css` — the Pokémon info window (modern look; has a dedicated phone layout at the end of the css). `modern.css` = modern theme (default), classic theme via Settings; `ui/Modern*.tsx` modern bag/party/PC.
- `net/useMatchPlayers.ts` (positions + `duel` message channel), `net/useLobby.ts`, `net/announce.ts` (name colours + chat announcements), `ui/useChat.ts`, `ui/ChatPanel.tsx`.
- `rom/*` — everything that reads the ROM (NARC, sprites, sounds `rom/sdat.ts`, `audio/*` sequencer). `world/*` + `ui/WorldEditor.tsx` — the owner's world editor (open from the main menu "World Builder" for the admin account, or `?editor`), rules panel included.
- Dev hooks (dev server only): `__pqWild(ring, species, level)`, `__pqTp(x,y)`, `__pqTalk(npcId)`, `__pqElim()`, `__pqAnn(...)`, `__pqFakePlayers`, `__pqSpec/__pqSpecEv`, `__run(kind, id, side, side)`, `__spl`.

## Game rules as built
Battle royale on a ring island: rings 1..3 fall every 5 min (editable), then the peak: touch-duels for 5 minutes, then a forced random-bracket tournament (simultaneous rounds, bye for an odd player, `game/tournament.ts`). Duels fully restore both teams first. 4 items per battle, 1 legendary per team, exp x10, trainers x1.5. Start bag: 5 Poké Balls, 5 Great Balls, 3 Potions, 5 Revives. Eliminated players follow another player with the camera (arrows, leave button), chat/whispers still work; battle watching is a pair of owner rules (default on). Chat announcements are grey, bilingual, never name a Pokémon. Each player gets one of 6 basic name colours per match.

## ⚠️ Pending requests (the last two things the user asked; not done yet)
1. **Put the Pokémon Centers back for now** ("we'll remove it later"): one per ring 1–3 (NE side), entering the door heals the team, and a wiped team respawns at that ring's center instead of being eliminated. They were removed in commit `e5eee21` ("no Pokemon Centers; a wiped team is eliminated"); the original code is in commit `af1aa20` (`game/world.ts` center generation block, `PlayScreen.tsx` `blackOut()` teleport + `onGym` center heal). Keep the 5+5 starting balls from that same commit.
2. **Activate the shrinking circle by default** (practice island checkbox "Probar derrumbe" should start on: `collapseOn` initial state in `PlayScreen.tsx`).

## Known gaps / unverified (be honest about these)
- Multiplayer messages (announcements, tournament, spectating, name colours) were only tested with fake players in one browser, never with two real accounts.
- Real Water Gun / level-up window / gauge speed were not compared with real recordings (no reference). Hover list for flying Pokémon (`HOVERERS` in `ui/AnimSprite.tsx`) and the 14 trainer ↔ battle-picture pairs (`OW_TO_CLASS` in `data/trainerClasses.ts`) were made by eye.
- Open from earlier: floating houses / unwalkable spots / walkable rocks (waiting for user screenshots), trade hardening, long-grass effect, ISSUE of phone testing (only emulated).
- Spanish texts that are from memory, not the ROM: burn/poison damage sentences.

## How to work with this user
Short replies. Do the thing, verify in the browser, deploy, say what was tested and what was not. Use the task list tool and wrap-up tool of the Claude desktop app if present. Don't re-explain risks; just build.
