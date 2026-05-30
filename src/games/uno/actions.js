import { api } from '../../api/client.js'
import { state } from '../../state.js'
import { showToast } from '../../ui/toast.js'
import { openModal, closeModal } from '../../ui/modal.js'

async function act(actionFn) {
  try {
    await actionFn()
    const res = await api.getState(state.gameId, state.matchId, state.sessionId)
    document.dispatchEvent(new CustomEvent('game:move', { detail: res }))
  } catch (e) {
    console.error('[uno] action failed:', e)
    showToast(e.message)
  }
}

export const unoAct = action => act(
  action.type === 'draw'
    ? () => api.unoDraw(state.matchId, state.sessionId)
    : () => api.unoPlay(state.matchId, state.sessionId, action.card, action.color)
)

export function unoPlay(card) {
  if (card === 'wild' || card === 'wild_draw4') {
    state.pendingWild = card
    openModal('color-modal')
  } else {
    unoAct({ type: 'play', card })
  }
}

export function pickColor(color) {
  closeModal('color-modal')
  if (state.pendingWild) {
    unoAct({ type: 'play', card: state.pendingWild, color })
    state.pendingWild = null
  }
}
