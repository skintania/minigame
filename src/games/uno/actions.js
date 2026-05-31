import { api } from '../../api/client.js'
import { state } from '../../state.js'
import { showToast } from '../../ui/toast.js'
import { openModal, closeModal } from '../../ui/modal.js'

let _selected = []  // cards staged for multi-card play

// Keep state.unoSelected in sync so render.js can use it in handKey + canPlay
function _saveSelected() { state.unoSelected = [..._selected] }

async function act(fn) {
  try {
    await fn()
    _selected = []
    _saveSelected()
    const res = await api.getState(state.gameId, state.matchId, state.sessionId)
    document.dispatchEvent(new CustomEvent('game:move', { detail: res }))
  } catch (e) {
    showToast(e.message)
  }
}

// Direct DOM update for instant selection feedback (no waiting for next poll)
function _syncUI() {
  const btn = document.getElementById('btn-confirm-play')
  if (btn) {
    btn.style.display = _selected.length > 0 ? '' : 'none'
    btn.textContent   = _selected.length > 1 ? `Play ${_selected.length} cards` : 'Play'
  }

  const hand    = state.gameState?.metadata?.hands?.[state.sessionId] || []
  const selCard = _selected.length > 0 ? (hand[_selected[0]] || '') : ''
  const selVal  = selCard ? selCard.split('_')[1] : null

  document.querySelectorAll('#uno-hand [data-card]').forEach(el => {
    const elIdx = parseInt(el.dataset.idx ?? '-1')
    const inSel = _selected.includes(elIdx)
    const [, val] = el.dataset.card.split('_')
    const isNum = val && /^\d$/.test(val)

    el.classList.toggle('selected', inSel)

    if (_selected.length === 0) return  // let render.js classes stand

    if (inSel) {
      el.classList.add('playable')
      el.classList.remove('not-playable')
    } else if (isNum && val === selVal) {
      el.classList.add('playable')
      el.classList.remove('not-playable')
    } else {
      el.classList.remove('playable')
      el.classList.add('not-playable')
    }
  })
}

export function clearSelection() {
  _selected = []
  _saveSelected()
  _syncUI()
}

export function unoPlay(card, handIdx) {
  const [, val] = card.split('_')
  const isNum   = val && /^\d$/.test(val)

  if (!isNum) {
    // Action / wild cards play immediately — clear any pending selection first
    _selected = []
    _saveSelected()
    if (card === 'wild' || card === 'wild_draw4') {
      state.pendingWild = card
      openModal('color-modal')
    } else {
      act(() => api.unoPlay(state.matchId, state.sessionId, card))
    }
    return
  }

  // Number card: toggle by hand index so duplicate cards are handled correctly
  const pos = _selected.indexOf(handIdx)
  if (pos !== -1) {
    _selected.splice(pos, 1)
  } else if (_selected.length === 0) {
    _selected.push(handIdx)
  } else {
    const hand    = state.gameState?.metadata?.hands?.[state.sessionId] || []
    const selCard = hand[_selected[0]] || ''
    const selVal  = selCard.split('_')[1]
    if (val !== selVal) {
      showToast('All cards must share the same number')
      return
    }
    _selected.push(handIdx)
  }

  _saveSelected()
  _syncUI()
}

export function confirmPlay() {
  if (_selected.length === 0) return
  const hand  = state.gameState?.metadata?.hands?.[state.sessionId] || []
  const cards = _selected.map(idx => hand[idx]).filter(Boolean)
  if (cards.length === 1) {
    act(() => api.unoPlay(state.matchId, state.sessionId, cards[0]))
  } else {
    act(() => api.unoPlayMulti(state.matchId, state.sessionId, cards))
  }
}

export const unoAct = action => act(
  action.type === 'draw' ? () => api.unoDraw(state.matchId, state.sessionId) :
  action.type === 'pass' ? () => api.unoPass(state.matchId, state.sessionId) :
  () => api.unoPlay(state.matchId, state.sessionId, action.card, action.color)
)

export function pickColor(color) {
  closeModal('color-modal')
  if (state.pendingWild) {
    unoAct({ type: 'play', card: state.pendingWild, color })
    state.pendingWild = null
  }
}
