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

export function dmDraw()           { return act(() => api.doraemonDraw(state.matchId, state.sessionId)) }
export function dmBathroom()       { return act(() => api.doraemonBathroom(state.matchId, state.sessionId)) }
export function dmTriggerGesture() { return act(() => api.doraemonTriggerGesture(state.matchId, state.sessionId)) }

export async function dmChooseBuddy(target) {
  await act(() => api.doraemonChooseBuddy(state.matchId, state.sessionId, target))
}
export async function dmReportLoser(target) {
  await act(() => api.doraemonReportLoser(state.matchId, state.sessionId, target))
}
export async function dmSetKRule(text) {
  await act(() => api.doraemonSetKRule(state.matchId, state.sessionId, text))
}
export async function dmReportGestureLoser(target) {
  await act(() => api.doraemonReportGestureLoser(state.matchId, state.sessionId, target))
}
export async function dmReportTalking(talker) {
  await act(() => api.doraemonReportTalking(state.matchId, state.sessionId, talker))
}
export async function dmReportPointing(offender) {
  await act(() => api.doraemonReportPointing(state.matchId, state.sessionId, offender))
}
export async function dmSetCategory(topic) {
  await act(() => api.doraemonSetCategory(state.matchId, state.sessionId, topic))
}
