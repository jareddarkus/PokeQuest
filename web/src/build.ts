// The build number of this copy of the game (the time it was built; "dev" in the test server). The waiting room compares it between players: a player with an older copy
// would see another world (different items on the ground, other spawn points) and another way of sending messages, so a match only starts when everybody has the same copy.
declare const __BUILD__: string | undefined
export const BUILD: string = typeof __BUILD__ === 'string' ? __BUILD__ : 'dev'
