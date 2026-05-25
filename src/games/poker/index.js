import { renderBoard, animateAllinRunout } from './render.js'
import { pkAction, pkCall, pkBet } from './actions.js'

export default {
  init() {
    document.getElementById('btn-fold').addEventListener('click', () => pkAction('fold'))
    document.getElementById('btn-check').addEventListener('click', () => {
      const action = document.getElementById('btn-check').dataset.action
      action === 'call' ? pkCall() : pkAction('check')
    })
    document.getElementById('btn-bet').addEventListener('click', pkBet)
  },

  render(meta, mine) {
    renderBoard(meta, mine)
  },

  animateAllinRunout,
}
