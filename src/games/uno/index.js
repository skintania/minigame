import { renderBoard } from './render.js'
import { unoAct, unoPlay, pickColor } from './actions.js'

export default {
  init() {
    document.getElementById('btn-draw').addEventListener('click', () => unoAct({ type: 'draw' }))

    ;['red', 'blue', 'green', 'yellow'].forEach(color => {
      document.getElementById(`color-${color}`).addEventListener('click', () => pickColor(color))
    })
  },

  render(meta, mine) {
    renderBoard(meta, mine, unoPlay)
  },
}
