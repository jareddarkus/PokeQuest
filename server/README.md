# PokeQuest realtime server (Cloudflare)

Relays the small messages of a match (positions, "picked a starter", "trainer busy", duels) between players over WebSockets. One Durable Object per match.
Logins are checked against Supabase, so only real accounts join. The site uses it when it is built with `VITE_REALTIME_URL` (e.g. `wss://pokequest-realtime.<your-subdomain>.workers.dev`); without it the game falls back to Supabase Realtime.

- First time: create a free Cloudflare account, then `cd server; npx wrangler login`.
- Publish: `powershell -File scripts\deploy-server.ps1` (from the repo root).
- Local test: `cd server; npx wrangler dev` (needs a `.dev.vars` file with `SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY`; git-ignored).
- Cost: the free plan includes Durable Objects (limits per day); Workers Paid is about 5 USD/month.
