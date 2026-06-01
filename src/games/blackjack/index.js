import { renderBoard } from './render.js'
import { bjBet, bjHit, bjStand, bjDoubleDown, bjSplit } from './actions.js'
import { showToast } from '../../ui/toast.js'

export default {
  init() {
    document.getElementById('btn-bj-bet')?.addEventListener('click', () => {
      const input  = document.getElementById('bj-bet-input')
      const amount = parseInt(input?.value, 10)
      if (!amount || amount < 1) { showToast('Enter a valid bet amount.'); return }
      input.value = ''
      bjBet(amount)
    })
    document.getElementById('bj-bet-input')?.addEventListener('keydown', e => {
      if (e.key === 'Enter') document.getElementById('btn-bj-bet')?.click()
    })
    document.getElementById('btn-bj-hit')?.addEventListener('click',    bjHit)
    document.getElementById('btn-bj-stand')?.addEventListener('click',  bjStand)
    document.getElementById('btn-bj-double')?.addEventListener('click', bjDoubleDown)
    document.getElementById('btn-bj-split')?.addEventListener('click',  bjSplit)
  },
  render(meta, mine) { renderBoard(meta, mine) },
}
