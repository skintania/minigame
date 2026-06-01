import { api } from '../../api/client.js'
import { state } from '../../state.js'
import { showToast } from '../../ui/toast.js'

async function act(fn) {
  try {
    await fn()
    const res = await api.getState(state.gameId, state.matchId, state.sessionId)
    document.dispatchEvent(new CustomEvent('game:move', { detail: res }))
  } catch (e) {
    showToast(e.message)
  }
}

export function pdBet(amount) { return act(() => api.pokdengBet(state.matchId, state.sessionId, amount)) }
export function pdDraw()      { return act(() => api.pokdengDraw(state.matchId, state.sessionId)) }
export function pdStand()     { return act(() => api.pokdengStand(state.matchId, state.sessionId)) }
