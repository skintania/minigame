import { api } from '../../api/client.js'
import { state } from '../../state.js'
import { act } from '../act.js'

export function pdBet(amount) { return act(() => api.pokdengBet(state.matchId, state.sessionId, amount)) }
export function pdDraw()      { return act(() => api.pokdengDraw(state.matchId, state.sessionId)) }
export function pdStand()     { return act(() => api.pokdengStand(state.matchId, state.sessionId)) }
