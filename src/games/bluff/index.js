import { renderBoard, bindBluffActions } from './render.js'

export default {
  init() { bindBluffActions() },
  render(meta, mine) { renderBoard(meta, mine) },
}
