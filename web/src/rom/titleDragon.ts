// The 3D dragon of the title screen of Pokémon Black 2 / White 2 (archive a/1/5/8): White Kyurem = model 455 + skeleton animation 454
// (White 2), Black Kyurem = 447 + 446 (Black 2). Read from the player's own game file only.
export const TITLE_NARC = 'a/1/5/8'

/** which files hold the dragon for this game (game code: IRD = White 2, IRE = Black 2), or null for other games */
export function titleFiles(gameCode: string): { model: number; anim: number } | null {
  if (/^IRD/.test(gameCode)) return { model: 455, anim: 454 }
  if (/^IRE/.test(gameCode)) return { model: 447, anim: 446 }
  return null
}
