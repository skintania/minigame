import { api } from '../api/client.js'
import { state } from '../state.js'
import { showToast } from '../ui/toast.js'

// Shared action helper: call the API, fetch fresh state, dispatch game:move.
// Used by games whose action endpoints do NOT return full state (blackjack,
// slave, dummy, doraemon, pokdeng). Poker and UNO override with local copies
// due to extra post-action cleanup. Old Maid uses the modern variant in its
// own actions.js (action endpoints return full state directly).
export async function act(fn) {
  try {
    await fn()
    const res = await api.getState(state.gameId, state.matchId, state.sessionId)
    document.dispatchEvent(new CustomEvent('game:move', { detail: res }))
  } catch (e) {
    showToast(e.message)
  }
}
