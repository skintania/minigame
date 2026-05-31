import { api } from '../../api/client.js'
import { state, cfg } from '../../state.js'
import { showToast } from '../../ui/toast.js'

const openColorOverlay = () => {
  const overlay = document.getElementById('uno-color-overlay')
  if (!overlay) return
  const disc = document.getElementById('uno-discard')
  const ring = overlay.querySelector('.uco-ring')
  if (disc && ring) {
    const r = disc.getBoundingClientRect()
    const cx = r.left + r.width  / 2
    const cy = r.top  + r.height / 2
    ring.style.left = cx + 'px'
    ring.style.top  = cy + 'px'
    // Show wild card in the ring center so it stays visible above petals
    const preview = ring.querySelector('.uco-card-preview')
    if (preview && state.pendingWild) {
      const base = `${cfg.url}/assets/cards/uno-deck`
      const src  = state.pendingWild === 'wild'
        ? `${base}/wild.svg`
        : `${base}/wild-draw-four.svg`
      preview.innerHTML = `<img src="${src}" alt="${state.pendingWild}">`
    }
  }
  overlay.classList.add('open')
}
const closeColorOverlay = () => document.getElementById('uno-color-overlay')?.classList.remove('open')

// ── Card flight helpers ───────────────────────────────────
function _fly(fromRect, toRect, cloneEl, delay = 0) {
  if (!fromRect || !toRect) return
  setTimeout(() => {
    const fly = cloneEl ? cloneEl.cloneNode(true) : document.createElement('div')
    fly.className       = 'uno-flying-card'
    fly.style.cssText   = `width:${fromRect.width}px;height:${fromRect.height}px;` +
                          `left:${fromRect.left}px;top:${fromRect.top}px;` +
                          `opacity:1;transform:none;` +
                          (!cloneEl ? 'background:linear-gradient(135deg,#e8529a,#3aabde);' : '')
    document.body.appendChild(fly)
    requestAnimationFrame(() => requestAnimationFrame(() => {
      const tx = toRect.left + toRect.width  / 2 - fromRect.left - fromRect.width  / 2
      const ty = toRect.top  + toRect.height / 2 - fromRect.top  - fromRect.height / 2
      fly.style.transition = 'transform 0.38s cubic-bezier(0.25,1.1,0.5,1), opacity 0.22s 0.16s'
      fly.style.transform  = `translate(${tx}px,${ty}px) scale(0.6) rotate(8deg)`
      fly.style.opacity    = '0'
      setTimeout(() => fly.remove(), 480)
    }))
  }, delay)
}

export function animatePlayCards(indices) {
  const toRect = document.getElementById('uno-discard')?.getBoundingClientRect()
  if (!toRect) return
  indices.forEach((idx, i) => {
    const el = document.querySelector(`#uno-hand [data-idx="${idx}"]`)
    if (el) _fly(el.getBoundingClientRect(), toRect, el, i * 80)
  })
}

export function animateDraw() {
  const drawEl = document.getElementById('uno-draw-pile')
  const handEl = document.getElementById('uno-hand')
  if (!drawEl || !handEl) return
  _fly(drawEl.getBoundingClientRect(), handEl.getBoundingClientRect(), null)
}

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
    const elIdx   = parseInt(el.dataset.idx ?? '-1')
    const inSel   = _selected.includes(elIdx)
    const card    = el.dataset.card
    const [, val] = card.split('_')

    el.classList.toggle('selected', inSel)

    if (_selected.length === 0) return  // let render.js classes stand

    if (inSel) {
      el.classList.add('playable')
      el.classList.remove('not-playable')
    } else if (val && val === selVal && card !== 'wild') {
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

  // Plain wild: always immediate — cannot be grouped
  if (card === 'wild') {
    _selected = []; _saveSelected()
    animatePlayCards([handIdx])
    state.pendingWild = card
    setTimeout(openColorOverlay, 160)
    return
  }

  // All other cards (numbers, skip, reverse, draw2, wild_draw4): toggle selection
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
      showToast('All cards must share the same value')
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
  if (!cards.length) return

  // wild_draw4 plays always need a color — open color picker before submitting
  if (cards.every(c => c === 'wild_draw4')) {
    animatePlayCards([..._selected])
    state.pendingWild = 'wild_draw4'
    setTimeout(openColorOverlay, 160)
    return
  }

  animatePlayCards([..._selected])
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
  closeColorOverlay()
  const pending = state.pendingWild
  state.pendingWild = null
  if (!pending) return

  const hand  = state.gameState?.metadata?.hands?.[state.sessionId] || []
  const cards = _selected.length > 1 ? _selected.map(i => hand[i]).filter(Boolean) : null
  if (cards) {
    act(() => api.unoPlayMulti(state.matchId, state.sessionId, cards, color))
  } else {
    unoAct({ type: 'play', card: pending, color })
  }
}
