import { renderBoard } from './render.js'
import { pkAction, pkBet } from './actions.js'

export default {
  init() {
    document.getElementById('btn-fold').addEventListener('click',  () => pkAction('fold'))
    document.getElementById('btn-check').addEventListener('click', () => pkAction('check'))
    document.getElementById('btn-bet').addEventListener('click',   pkBet)
  },

  render(meta, mine) {
    renderBoard(meta, mine)
  },
}
