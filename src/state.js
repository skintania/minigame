export const state = {
  sessionId:   null,
  username:    null,
  matchId:     null,
  gameId:      null,
  roomCode:    null,
  gameState:   null,
  poll:        null,
  waiting:     false,
  pendingWild: null,
}

const DEFAULT_URL = 'https://minigame-skintania-api.skintania143.workers.dev'

export const cfg = {
  get url() { return localStorage.getItem('sk_url') || DEFAULT_URL },
  set url(v) { localStorage.setItem('sk_url', v.replace(/\/$/, '')) },
}
