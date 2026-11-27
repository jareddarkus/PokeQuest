---
name: pokequest
description: Use for ANY work in the PokeQuest repo (game code, UI, battles, world/rules, Supabase, deploy, bugs, features). Gives the graphify-first protocol for navigating this large codebase cheaply, the project map, standing rules, and the dev/deploy workflow. Load it at the start of every PokeQuest task.
---

# PokeQuest working skill

## 1. graphify protocol (MANDATORY — saves tokens on a ~140-file, 1.4k-node codebase)

The graph is rebuilt on session start by `.claude/hooks/graphify-setup.sh` (AST only, ~6 s, free). Output: `graphify-out/` (git-ignored): `graph.json`, `GRAPH_REPORT.md`, `graph.html`.

**Order of operations for every question about the code:**
1. `graphify query "<identifiers>" --budget 1500` — BFS subgraph. Matching is **case-folded substring + IDF, no synonyms/stemming**. So use *identifiers that exist in the code* (`collapseInfo`, `PlayInner`, `BattleSession`, `tournament`, `spectate`), not prose ("how does a wiped team respawn" returns UI noise).
2. Know the symbol? `graphify explain "collapseInfo"` → file:line, callers, callees, and the `docs/DESIGN.md` round that describes it (docs are linked into the graph).
3. Two things, unknown link? `graphify path "PlayInner()" "BattleSession"`.
4. **Before changing/renaming anything**: `graphify affected "<symbol>"` (reverse traversal = blast radius). Ambiguous name → use the exact label with `()`, e.g. `"PlayInner()"`.
5. Chains/flows: `graphify query "..." --dfs`; steer with `--seed <node>`; too truncated → raise `--budget` as the output suggests; narrower → `--depth 1`.
6. Only then `Read` the file **with offset/limit around the `file:Lnnn` the graph gave**. Use Grep for exact text the graph can't hold.
7. Hubs/architecture overview: `graphify god-nodes --top 15` (react, BattleScreen, parseNarc, PlayInner, BattleSession, GameView3D, importRom …). Read `GRAPH_REPORT.md` only for broad reviews.
8. After editing code: `graphify update .` (no API cost; add `--force` after refactors that delete code).
9. Optional learning loop: `graphify save-result --question … --answer … --nodes … --outcome useful|dead_end|corrected`, then `graphify reflect`.

**Known blind spots (fall back to Grep/Read):**
- Local closures/arrow functions inside components are not nodes (e.g. `blackOut`, `onGym` live inside `PlayInner()` in `ui/PlayScreen.tsx` — graph gets you to `PlayInner()`, then grep inside the file).
- `web/src/game/GameView3D.tsx` has a tree-sitter parse error around line 522, so only part of it is indexed (17 symbols). Treat its graph answers as incomplete; read with offsets.
- CSS (`modern.css`, `summary.css`, `App.css`, `index.css`) and `scripts/deploy.ps1` are not indexed → Grep.
- Dev-hook names (`__pqWild`, `__pqTp` …) are string assignments, not symbols → Grep.
- Subagents: always include the graphify-first rule in their prompt.

## 2. Project map (details in `docs/DESIGN.md`)
- `web/src/ui/PlayScreen.tsx` — match screen `PlayInner()` (HUD, events, battles, duels, tournament, elimination/spectate, music).
- `game/GameView3D.tsx` 3D overworld · `game/world.ts` generation, rings, `collapseInfo` · `game/rules.ts` `RULES` · `game/state.ts` exp/EVs/evolution · `game/tournament.ts`.
- `ui/BattleScreen.tsx` battle UI; `battle/engine.ts` Showdown sim wrapper (`BattleEvent`s); `rom/effVm.ts` + `rom/splFx.ts` move effects; `battle/pvp.ts`, `battle/spectate.ts`.
- `ui/SummaryCard.tsx`+`summary.css` info window (has phone layout); `modern.css` theme; `ui/Modern*.tsx` bag/party/PC.
- `net/useMatchPlayers.ts`, `net/useLobby.ts`, `net/announce.ts`, `ui/useChat.ts`, `ui/ChatPanel.tsx` — multiplayer/chat.
- `rom/*` reads the user's ROM in-browser (IndexedDB). Bumping `VERSION` in `rom/store.ts` (now 51) forces friends to re-pick the ROM.
- `world/*` + `ui/WorldEditor.tsx` — owner's world editor (`?editor` or main-menu "World Builder" for admin).
- Dev hooks (dev server only): `__pqWild(ring,species,level)`, `__pqTp(x,y)`, `__pqTalk(npcId)`, `__pqElim()`, `__pqAnn(...)`, `__pqFakePlayers`, `__pqSpec/__pqSpecEv`, `__run`, `__spl`.

## 3. Game rules as built
Ring island battle royale: rings 1–3 collapse every 5 min (editable) → peak: touch-duels 5 min → forced random-bracket tournament (simultaneous rounds, bye for odd). Duels restore both teams first. 4 items/battle, 1 legendary/team, exp ×10 (trainers ×1.5). Start bag: 5 Poké Balls, 5 Great Balls, 3 Potions, 5 Revives. Eliminated players spectate (camera follows others; chat works). Chat announcements are grey, bilingual, never name a Pokémon. 6 basic name colours per match.

## 4. Environment reality (cloud session vs the user's PC)
- **On the user's PC (local session)** the ROM, dev server, built-in browser screenshots and `deploy.ps1` all work; the notes below about limits apply only to the cloud container. A parent-folder CLAUDE.md for another project (Superboru) may also load there: ignore it.
- This repo's cloud checkout has **no ROM** → the dev server cannot render game art here, so **visual verification and screenshots are not possible in the cloud** (only `npx tsc -b`, lint, logic checks). Say so plainly; never claim visual verification that didn't happen. The user's PC has the ROM (`POKEQUEST_DEV_ROM`) and runs `npm run dev -- --port 5199` in `web/`, URL `http://localhost:5199/PokeQuest/?play&starter=Oshawott`.
- **Deploy** = `scripts/deploy.ps1` (PowerShell, builds and force-pushes `gh-pages`). It's run on the user's PC; from the cloud, pushing `gh-pages` needs the user's explicit permission. Normal flow: push work to the assigned branch → user pulls/merges → deploy.
- GitHub scope: `jareddarkus/PokeQuest` only (MCP `mcp__github__*`; plain `git push` works for the assigned branch). Don't open a PR unless asked.
- Supabase project ref `uqthugajmqezxyamfsgn` ("PokeQuest"; there is another unrelated project "muna" — never touch it). Tables: profiles, monsters, bag_items, world_admins, app_secrets, worlds, friends, skin_config (RLS on everywhere). Use `mcp__Supabase__*`: `list_tables`, `execute_sql` for reads, `apply_migration` for DDL (inspect tables first, run `get_advisors` after DDL). **Never read/print `app_secrets` or `world_admins` contents.** Ask before any destructive or schema-changing SQL.

## 5. Open items / honesty list
- Pending from the user: (1) bring back Pokémon Centers (one per ring 1–3 NE side; door heals team; wiped team respawns at ring center) — original code in commit `af1aa20`, removed in `e5eee21`; keep 5+5 starting balls; (2) shrinking circle ON by default (`collapseOn` initial state in `PlayScreen.tsx`).
- Never tested with two real accounts: announcements, tournament, spectating, name colours. Made by eye, not ROM: `HOVERERS` (`ui/AnimSprite.tsx`), `OW_TO_CLASS` (`data/trainerClasses.ts`); Spanish burn/poison damage sentences are from memory. Open: floating houses/unwalkable spots/walkable rocks, trade hardening, long-grass effect, real phone testing.
- Supabase advisors (2026-11-27): 5 SECURITY DEFINER RPCs callable by `authenticated` (add_friend, claim_world_admin, my_friends, remove_friend, user_id_of — probably intended, review), leaked-password protection off, `app_secrets` has RLS but no policy (intended lock-down).

## 6. Keep this skill alive
When you learn something durable (a gotcha, a verified fact, a decision), add it here in one line. Keep this file short.
