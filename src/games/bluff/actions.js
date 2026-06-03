import { api } from '../../api/client.js'
import { state } from '../../state.js'
import { showToast } from '../../ui/toast.js'

async function act(fn) {
  try {
    const res = await fn()
    document.dispatchEvent(new CustomEvent('game:move', { detail: res }))
  } catch (e) {
    showToast(e.message)
    try {
      const res = await api.getState(state.gameId, state.matchId, state.sessionId)
      document.dispatchEvent(new CustomEvent('game:move', { detail: res }))
    } catch {}
  }
}

export function bluffStart()            { return act(() => api.bluffStart(state.matchId, state.sessionId)) }
export function bluffPlay(cards)        { return act(() => api.bluffPlay(state.matchId, state.sessionId, cards)) }
export function bluffChallenge()        { return act(() => api.bluffChallenge(state.matchId, state.sessionId)) }
export function bluffEndGame()          { return act(() => api.bluffEndGame(state.matchId, state.sessionId)) }
