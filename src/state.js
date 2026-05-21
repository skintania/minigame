export const state = {
  sessionId:   null,
  username:    null,
  matchId:     null,
  gameId:      null,
  roomCode:    null,
  isHost:      false,
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

const SESSION_KEY = 'sk_session'

export function saveSession() {
  const { sessionId, username, matchId, gameId, roomCode, isHost, gameState } = state
  localStorage.setItem(SESSION_KEY, JSON.stringify({ sessionId, username, matchId, gameId, roomCode, isHost, gameState }))
}

export function loadSession() {
  try {
    const saved = JSON.parse(localStorage.getItem(SESSION_KEY) || '{}')
    Object.assign(state, saved)
  } catch {}
}

export function clearGameState() {
  state.matchId     = null
  state.gameId      = null
  state.roomCode    = null
  state.gameState   = null
  state.waiting     = false
  state.pendingWild = null
  saveSession()
}
