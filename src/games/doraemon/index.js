import { renderBoard } from './render.js'
import {
  dmDraw, dmBathroom, dmTriggerGesture,
  dmReportPointing, dmReportTalking,
} from './actions.js'
import { state } from '../../state.js'

function showDmPicker(title, playerIds, names, onSelect) {
  const area    = document.getElementById('dm-report-area')
  const titleEl = document.getElementById('dm-report-title')
  const picksEl = document.getElementById('dm-report-picks')
  if (!area || !titleEl || !picksEl) return

  titleEl.textContent = title
  picksEl.innerHTML   = playerIds.map(id =>
    `<button class="btn btn-ghost dm-pick-btn" data-pid="${id}">${names[id] || id.slice(0, 8)}</button>`
  ).join('')

  picksEl.onclick = e => {
    const btn = e.target.closest('[data-pid]')
    if (!btn) return
    area.style.display = 'none'
    onSelect(btn.dataset.pid)
  }

  area.style.display = ''
}

export default {
  init() {
    document.getElementById('btn-dm-draw')?.addEventListener('click', dmDraw)
    document.getElementById('btn-dm-bathroom')?.addEventListener('click', dmBathroom)
    document.getElementById('btn-dm-gesture')?.addEventListener('click', dmTriggerGesture)

    document.getElementById('btn-dm-cancel-report')?.addEventListener('click', () => {
      document.getElementById('dm-report-area').style.display = 'none'
    })

    document.getElementById('btn-dm-pointing')?.addEventListener('click', () => {
      const gs    = state.gameState
      if (!gs) return
      const all   = gs.players || []
      const names = gs.playerNames || {}
      showDmPicker('👉 Who was caught pointing?', all, names, dmReportPointing)
    })

    document.getElementById('btn-dm-talking')?.addEventListener('click', () => {
      const gs       = state.gameState
      if (!gs) return
      const names    = gs.playerNames || {}
      const silenced = gs.metadata?.silenced
      const others   = (gs.players || []).filter(id => id !== silenced)
      showDmPicker('⚠️ Who talked to the silenced player?', others, names, dmReportTalking)
    })
  },

  render(meta, mine) { renderBoard(meta, mine) },
}
