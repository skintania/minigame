import { api } from '../../api/client.js'
import { state } from '../../state.js'
import { showToast } from '../../ui/toast.js'

function dispatch(res) {
  document.dispatchEvent(new CustomEvent('game:move', { detail: res }))
}

export async function pkAction(type) {
  try {
    const fn = type === 'fold' ? api.pokerFold : api.pokerCheck
    dispatch(await fn(state.matchId, state.sessionId))
  } catch (e) {
    console.error(`[poker] action "${type}" failed:`, e)
    showToast(e.message)
  }
}

export async function pkCall() {
  try {
    dispatch(await api.pokerCall(state.matchId, state.sessionId))
  } catch (e) {
    console.error('[poker] call failed:', e)
    showToast(e.message)
  }
}

export async function pkBet() {
  const amount = parseInt(document.getElementById('bet-amt').value)
  if (!amount || amount <= 0) { showToast('Enter a valid bet amount.'); return }
  try {
    dispatch(await api.pokerBet(state.matchId, state.sessionId, amount))
    document.getElementById('bet-amt').value = ''
  } catch (e) {
    console.error(`[poker] bet ${amount} failed:`, e)
    showToast(e.message)
  }
}
