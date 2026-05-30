import { api } from '../../api/client.js'
import { state } from '../../state.js'
import { showToast } from '../../ui/toast.js'

async function act(actionFn) {
  try {
    await actionFn()
    const res = await api.getState(state.gameId, state.matchId, state.sessionId)
    document.dispatchEvent(new CustomEvent('game:move', { detail: res }))
    const betInput = document.getElementById('bet-amt')
    if (betInput) betInput.value = ''
  } catch (e) {
    console.error('[poker] action failed:', e)
    showToast(e.message)
  }
}

export const pkAction = type => act(
  () => (type === 'fold' ? api.pokerFold : api.pokerCheck)(state.matchId, state.sessionId)
)

export const pkCall = () => act(
  () => api.pokerCall(state.matchId, state.sessionId)
)

export async function pkBet() {
  const amount = parseInt(document.getElementById('bet-amt').value)
  if (!amount || amount <= 0) { showToast('Enter a valid bet amount.'); return }
  await act(() => api.pokerBet(state.matchId, state.sessionId, amount))
}
