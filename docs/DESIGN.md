# PokeQuest - design notes (from the owner's brief, 2026-11-24)

Private, friends-only web game. Main menu: **"Pokémon White 2 Together"** (shared persistent server, PokeMMO-style) and
**Pokémon Battle Royale** (we build the Battle Royale first).

## Look and feel
- All 2D, top-down, Pokémon White 2 style. Minimal UI: black panels at 60% opacity, white text.
- Fonts: Unbounded Black (titles, sub-headers), Lexend Regular (text). Self-hosted with `@fontsource` (not hot-linked from Google: German GDPR).
- Menus (team, bag, Pokémon summary) inspired by White 2's UI. Use White 2 UI/icon art from the player's own ROM; minimalist black UI for anything White 2 doesn't have.
- Controls: WASD / click. Everything else is clickable. Phone: on-screen D-pad (left by default, swappable to the right in Settings).
- Settings: zoom (zoomed-out default on desktop), D-pad side, customization button. Detect phone vs desktop (media query + touch) to set defaults.
- Usernames shown above OTHER players only, never above yourself.
- Character creator before entering the world, editable later in Settings: skin tone, hair, eyes, head, torso, hands, legs, shoes, skirt/trousers, hats...

## Art, sound and the ROM rule
- No Nintendo files in the repo, in Supabase or on any host. The browser reads the art from a game file the player picks on their own machine and keeps it in browser storage only.
- Owner's files: Pokémon White 2 (Spanish, code IRDS, in a zip) and White 2 (English, IRDO). Pokémon White 2 contains species #1-#649 (Gen 1-5), not Gen 6.
- Fallback when no game file is loaded: PokéAPI sprites loaded at runtime from their servers + CC0 art.

## Battle Royale (build first)
- One big circular island, sea around it, the middle is the highest point (a mountain with stairs). Trees and tall grass everywhere; walking in tall grass triggers encounters at the official rates.
- Everyone starts in the outer ring. Combat between players is ONLY allowed at the peak (inner ring).
- Start: 5 Poké Balls and a first-stage starter (exact rule still to decide).
- Rings: ring 1 wild Pokémon = first stages; ring 2 = second stages; later rings = final stages / stronger. To pass to the next ring you beat a gym leader (4 gyms: N, E, S, W; each has a themed stadium; the leader's type is random per match). Beating the leader teleports you inward; no way back.
- Short matches (about 20 min): all battle XP x10.
- Item pickups (Poké Ball sprite on the ground) give 5 random items by ring: ring 1 basic (Poké Balls, potions, Exp. Share, type-boost items), ring 2+ better. Evolution stones appear in every ring. Bag has no size limit.
- Evolutions: stones for stone evolutions; level-up for level evolutions; time-of-day and friendship evolutions simply evolve on level-up (or a friendship item, to decide); trade evolutions via NPC trades.
- NPC trainers everywhere: walk, run, stand and look around. 4 tiles of vision: if they see you, you must battle. After the battle, talk to them to trade Pokémon (each NPC trades twice: you give one, get theirs; second trade lets you swap back/forward, e.g. Timburr -> Conkeldurr trade chain).
- Moves are random from what that Pokémon can learn at its level; you may swap to any move it knows or could have learned; new moves on level-up, also mid-battle.
- Nature and ability are randomized.
- Music: each ring gets a random town/city track, chosen before the match starts, same for every player in that ring.
- Anti-cheat: server checks battle moves, items and saves; speed check on movement.

## Multiplayer model
- Walking: your own character moves instantly; positions are broadcast through Supabase Realtime and drawn smoothly (target 0.1-0.2 s behind). Supabase project is in Frankfurt.
- Per-player story/cutscenes (the PokeMMO feel): progress is a per-player flag/step stored on the server. The client only plays the presentation, so Cheren can talk to one player while another never sees it. The server accepts only valid next steps.
- Ring damage outside the safe zone: computed from timestamps (no per-second timer needed).

## Accounts and hosting
- Login: username + password (internal made-up email). Supabase project "PokeQuest", ref uqthugajmqezxyamfsgn, eu-central-1.
- Repo: github.com/jareddarkus/PokeQuest (private). GitHub Pages on the free plan needs a public repo, so hosting is a decision for the owner.
- Before any public hosting: add an invite code to sign-up.
