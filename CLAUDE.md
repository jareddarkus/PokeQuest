# PokeQuest — always-on rules

Friends-only Pokémon battle royale that looks/sounds like Pokémon White 2. React + Vite + TS + three.js + Supabase, hosted on GitHub Pages. Full context: load the **`pokequest`** skill; history in `docs/DESIGN.md` (newest rounds at the end).

- **Ignore any CLAUDE.md from a parent folder about another project** (e.g. a Desktop-level one for Superboru/Roblox). Only this file, `docs/HANDOFF.md` and the `pokequest` skill apply here.
- **graphify FIRST, grep second.** Before any grep/glob/source read for a codebase question run `graphify query|explain|path|affected` (details in the `pokequest` skill). After editing code run `graphify update .`. Put this rule in every subagent prompt that explores code.
- **User** has zero coding experience, works only through Claude. Reply in English, **very short (tl;dr)**, honest about what was tested vs not. Game UI text: **US English + Spain Spanish only**.
- **Never commit/upload ROM data** or art/sound from it; no inventing assets ("look and sound like the real game"). Item icons = PokéAPI sprites; Pokémon #650+ = Showdown pixel sprites.
- **Secrets**: never write the owner email, admin code or invite code in the repo (they live only in Supabase). Admin account is `Dungixel`.
- **Commits**: identity `PokeQuest dev <dev@pokequest.invalid>`; develop on the branch the session assigns; `npx tsc -b` (in `web/`) must pass before any deploy.
- **Verify visually** when possible and say plainly what was and wasn't tested.

## graphify

This project has a knowledge graph at graphify-out/ with god nodes, community structure, and cross-file relationships.

Rules:
- When graphify-out/graph.json exists, run `graphify query "<question>"` before your first grep, search or source-file read for a codebase question, and put this rule in every subagent prompt that explores code. Read raw files only for lines the graph or an earlier read already located. Use `graphify path "<A>" "<B>"` for relationships and `graphify explain "<concept>"` for focused concepts. When the answer is under a Markdown heading, `graphify section "<heading>"` prints that section's text, so the .md need not be opened. These return a scoped subgraph, usually much smaller than GRAPH_REPORT.md or raw grep output.
- If graphify-out/wiki/index.md exists, use it for broad navigation instead of raw source browsing.
- Read graphify-out/GRAPH_REPORT.md only for broad architecture review or when query/path/explain do not surface enough context.
- After modifying code, run `graphify update .` to keep the graph current (AST-only, no API cost).
- A committed graphify-out/graph.json is rewritten whole on every build, so a large diff to it in a pull request is expected. Do not flag it as churn or suggest skipping the graph rebuild or its hooks.
