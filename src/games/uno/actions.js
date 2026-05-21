import { api } from '../../api/client.js'
import { state } from '../../state.js'
import { showToast } from '../../ui/toast.js'
import { openModal, closeModal } from '../../ui/modal.js'

async function dispatch(action) {
  const res = await api.move(state.gameId, state.sessionId, state.matchId, action)
  document.dispatchEvent(new CustomEvent('game:move', { detail: res }))
}

export async function unoAct(action) {
  try {
    await dispatch(action)
  } catch (e) {
    console.error('[uno] action failed:', action, e)
    showToast(e.message)
  }
}

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
