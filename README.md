# PokeQuest

A private, friends-only PokÃ©mon-style battle royale for the browser.

- `web/` - the website (React + Vite + TypeScript)
- Supabase project `wildring` (the display name could not be changed with the tools used; rename it in the dashboard if wanted) (eu-central-1, ref `uqthugajmqezxyamfsgn`): accounts, saved monsters, bag, money
- Login = username + password (the Edge Function `signup` creates the account with an internal made-up email)

## Rules for this project
- No Nintendo / Game Freak files are ever committed, uploaded to Supabase or hosted. Art is loaded in each player's browser only
  (from a game file the player picks on their own computer, or from third-party servers at runtime).
- Player progress lives in Supabase. Only trusted server code (Edge Functions) may change money, monsters and items.
- Keep the game private: friends-only, nothing sold, no ads, no public sharing.

## Run it
```
cd web
npm install
npm run dev
```
`web/.env.local` holds the Supabase URL and the publishable key (it is not committed).

## Next steps
1. Walkable top-down map  2. Live player positions + speed check  3. Battles (PokÃ©mon Showdown engine)
4. Lobby + shrinking ring (outside the ring PokÃ©mon lose HP every second, computed on the server)
5. Server-side move validation  6. Optional ROM import into browser storage
