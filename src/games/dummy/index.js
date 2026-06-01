import { renderBoard } from './render.js'
import { dummyDraw, dummyDrawDiscard, dummyLay, dummyFak, dummyDiscard } from './actions.js'

export default {
  init() {},
  render(meta, mine) {
    renderBoard(meta, mine, {
      draw:        ()                => dummyDraw(),
      drawDiscard: card              => dummyDrawDiscard(card),
      lay:         cards             => dummyLay(cards),
      fak:         (card, meldIndex) => dummyFak(card, meldIndex),
      discard:     card              => dummyDiscard(card),
    })
  },
}
