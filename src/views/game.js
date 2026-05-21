import { api } from '../api/client.js'
import { state, saveSession, clearGameState } from '../state.js'
import { showToast } from '../ui/toast.js'
import registry from '../games/registry.js'

export function initGame() {
  document.getElementById('btn-play-again').addEventListener('click', goLobby)

  document.addEventListener('game:move', async e => {
    try {
      await handleMoveResult(e.detail)
    } catch (err) {
      console.error('[game] move result error:', err)
      showToast(err.message)
    }
  })
}

export function enterGame() {
  stopPoll()

  const gameId = state.gameId
  document.getElementById('g-name').textContent        = gameId === 'poker' ? 'Poker' : 'UNO'
  document.getElementById('poker-board').style.display = gameId === 'poker' ? 'flex' : 'none'
  document.getElementById('uno-board').style.display   = gameId === 'uno'   ? 'flex' : 'none'

  render()

  let fetching = false
  state.poll = setInterval(async () => {
    if (fetching) return
    fetching = true
    try {
      state.gameState = await api.getState(state.gameId, state.matchId, state.sessionId)
      render()
      if (state.gameState?.metadata?.winner) { stopPoll(); showWinner(state.gameState.metadata.winner) }
    } catch (e) {
      console.error('[game] state poll error:', e)
      if (e.message.includes('invalid session')) {
        stopPoll()
        showToast('Session expired')
        window.location.href = 'index.html'
      }
    } finally {
      fetching = false
    }
  }, 2200)
}

export function render() {
  if (!state.gameState) return
  const meta = state.gameState.metadata
  if (!meta) return
  const mine = meta.currentPlayer === state.sessionId

  const pill = document.getElementById('turn-pill')
  pill.textContent = mine ? 'Your Turn' : "Opponent's Turn"
  pill.className   = 'turn-pill ' + (mine ? 'mine' : 'theirs')
  document.getElementById('g-phase').textContent = meta.phase || ''

  registry[state.gameId].render(meta, mine)
}

async function handleMoveResult(res) {
  if (res.state) state.gameState = res.state
  else state.gameState = await api.getState(state.gameId, state.matchId, state.sessionId)
  render()
  if (res.status === 'finished' || state.gameState?.metadata?.winner) {
    stopPoll()
    showWinner(state.gameState.metadata.winner)
  }
}

export function stopPoll() {
  clearInterval(state.poll)
  state.poll = null
}

function showWinner(winnerId) {
  const won = winnerId === state.sessionId
  document.getElementById('w-emoji').textContent = won ? '🏆' : '😔'
  document.getElementById('w-title').textContent = won ? 'You Win!' : 'You Lose'
  document.getElementById('w-title').className   = 'winner-title ' + (won ? 'win' : 'lose')
  document.getElementById('w-sub').textContent   = won ? 'Congratulations!' : 'Better luck next time.'
  document.getElementById('winner-overlay').classList.add('open')
}

function goLobby() {
  stopPoll()
  clearGameState()
  window.location.href = 'lobby.html'
}
