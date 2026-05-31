import { renderBoard } from './render.js'
import { unoAct, unoPlay, pickColor, confirmPlay, clearSelection, animateDraw } from './actions.js'

export default {
  init() {
    document.getElementById('btn-draw')?.addEventListener('click', () => unoAct({ type: 'draw' }))
    document.getElementById('uno-draw-pile')?.addEventListener('click', () => {
      clearSelection()
      animateDraw()
      unoAct({ type: 'draw' })
    })
    document.getElementById('btn-confirm-play')?.addEventListener('click', confirmPlay)
    document.getElementById('btn-pass')?.addEventListener('click', () => unoAct({ type: 'pass' }))

    ;['red', 'blue', 'green', 'yellow'].forEach(color => {
      document.getElementById(`color-${color}`).addEventListener('click', () => pickColor(color))
    })
  },

  render(meta, mine) {
    renderBoard(meta, mine, unoPlay)
  },
}
