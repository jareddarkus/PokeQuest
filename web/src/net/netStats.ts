// What the game knows about its own connection (read by ui/NetPanel.tsx; filled by net/transport.ts and net/useMatchPlayers.ts).
export const netStats = {
  /** how the match messages travel right now */
  via: null as null | 'cloudflare' | 'supabase',
  /** our own round trip to the server in milliseconds (null: not measured) */
  ping: null as number | null,
  /** the ping every other player reported about themselves */
  peers: new Map<string, number>(),
}
