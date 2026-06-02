import { api } from '../../api/client.js'
import { state } from '../../state.js'
import { showToast } from '../../ui/toast.js'

async function act(fn) {
  try {
    await fn()
    const res = await api.getState(state.gameId, state.matchId, state.sessionId)
    document.dispatchEvent(new CustomEvent('game:move', { detail: res }))
  } catch (e) { showToast(e.message) }
}

export function omPick(index)           { return act(() => api.oldmaidPick(state.matchId, state.sessionId, index)) }
export function omSetShuffleMode(mode)  { return act(() => api.oldmaidSetShuffleMode(state.matchId, state.sessionId, mode)) }
export function omReorderHand(cards)    { return act(() => api.oldmaidReorderHand(state.matchId, state.sessionId, cards)) }
