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

export function slavePlay(cards) {
  return act(() => api.slavePlay(state.matchId, state.sessionId, cards))
}

export function slavePass() {
  return act(() => api.slavePass(state.matchId, state.sessionId))
}
