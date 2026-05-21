import { api } from '../../api/client.js'
import { state } from '../../state.js'
import { showToast } from '../../ui/toast.js'

async function dispatch(action) {
  const res = await api.move(state.gameId, state.sessionId, state.matchId, action)
  document.dispatchEvent(new CustomEvent('game:move', { detail: res }))
}

export async function pkAction(type) {
  try {
    await dispatch({ type })
  } catch (e) {
    console.error(`[poker] action "${type}" failed:`, e)
    showToast(e.message)
  }
}

export async function pkCall() {
  try {
    await dispatch({ type: 'call' })
  } catch (e) {
    console.error('[poker] call failed:', e)
    showToast(e.message)
  }
}

export async function pkBet() {
  const amount = parseInt(document.getElementById('bet-amt').value)
  if (!amount || amount <= 0) { showToast('Enter a valid bet amount.'); return }
  try {
    await dispatch({ type: 'bet', amount })
    document.getElementById('bet-amt').value = ''
  } catch (e) {
    console.error(`[poker] bet ${amount} failed:`, e)
    showToast(e.message)
  }
}
