/**
 * Returns the list of opponent IDs ordered by turn sequence, starting from
 * the player immediately after `sessionId` in the current direction of play.
 *
 * For CW games (direction >= 0 or absent) the result is left-to-right seat
 * order — assign SEAT_MAP[0] to the first element (the next-to-act player).
 * For CCW games (direction === -1) the list is reversed so index-0 is still
 * next-to-act but should be assigned to the rightmost seat; reverse your
 * SEAT_MAP assignment or pre-reverse it before calling.
 *
 * Falls back to allPlayers order (minus self) when meta.turnOrder is absent,
 * preserving current behaviour for games that haven't added turnOrder yet.
 *
 * @param {object} meta        - Game metadata from the server
 * @param {string} sessionId   - Local player's session ID
 * @param {string[]} allPlayers - Full players array from gameState
 * @returns {string[]} Ordered list of opponent session IDs
 */
export function orderedOpponents(meta, sessionId, allPlayers = []) {
  const turnOrder = meta.turnOrder || []
  const myIdx     = turnOrder.indexOf(sessionId)

  let opponents = myIdx >= 0
    ? [...turnOrder.slice(myIdx + 1), ...turnOrder.slice(0, myIdx)]
    : allPlayers.filter(id => id !== sessionId)

  // CCW: reverse so next-to-act lands at the rightmost seat (index last in CW SEAT_MAP)
  if (meta.direction === -1 && opponents.length > 0) opponents = [...opponents].reverse()

  return opponents
}
