import { renderBoard } from './render.js'
import { pdBet, pdDraw, pdStand } from './actions.js'
import { showToast } from '../../ui/toast.js'

export default {
  init() {
    document.getElementById('btn-pd-bet')?.addEventListener('click', () => {
      const input  = document.getElementById('pd-bet-input')
      const amount = parseInt(input?.value, 10)
      if (!amount || amount < 1) { showToast('Enter a valid bet amount.'); return }
      input.value = ''
      pdBet(amount)
    })
    document.getElementById('pd-bet-input')?.addEventListener('keydown', e => {
      if (e.key === 'Enter') document.getElementById('btn-pd-bet')?.click()
    })
    document.getElementById('btn-pd-draw')?.addEventListener('click',  pdDraw)
    document.getElementById('btn-pd-stand')?.addEventListener('click', pdStand)
  },
  render(meta, mine) { renderBoard(meta, mine) },
}
