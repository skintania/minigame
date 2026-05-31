import { renderBoard } from './render.js'
import { slavePlay, slavePass } from './actions.js'

export default {
  init() {},
  render(meta, mine) { renderBoard(meta, mine, slavePlay, slavePass) },
}
