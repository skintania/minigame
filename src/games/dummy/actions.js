import { api } from '../../api/client.js'
import { state } from '../../state.js'
import { act } from '../act.js'

export const dummyDraw        = ()                => act(() => api.dummyDraw(state.matchId, state.sessionId))
export const dummyDrawDiscard = card              => act(() => api.dummyDrawDiscard(state.matchId, state.sessionId, card))
export const dummyLay         = cards             => act(() => api.dummyLay(state.matchId, state.sessionId, cards))
export const dummyFak         = (card, meldIndex) => act(() => api.dummyFak(state.matchId, state.sessionId, card, meldIndex))
export const dummyDiscard     = card              => act(() => api.dummyDiscard(state.matchId, state.sessionId, card))
