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

export function bjBet(amount)    { return act(() => api.blackjackBet(state.matchId, state.sessionId, amount)) }
export function bjHit()          { return act(() => api.blackjackHit(state.matchId, state.sessionId)) }
export function bjStand()        { return act(() => api.blackjackStand(state.matchId, state.sessionId)) }
export function bjDoubleDown()   { return act(() => api.blackjackDoubleDown(state.matchId, state.sessionId)) }
export function bjSplit()        { return act(() => api.blackjackSplit(state.matchId, state.sessionId)) }
