import { api } from '../../api/client.js'
import { state } from '../../state.js'
import { act } from '../act.js'

export function slavePlay(cards) {
  return act(() => api.slavePlay(state.matchId, state.sessionId, cards))
}

export function slavePass() {
  return act(() => api.slavePass(state.matchId, state.sessionId))
}
