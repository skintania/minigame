import { api } from '../api/client.js'
import { state, saveSession, clearGameState } from '../state.js'
import { showToast } from '../ui/toast.js'
import registry from '../games/registry.js'

const sleep = ms => new Promise(r => setTimeout(r, ms))

let handResultTimer  = null
let handResultActive = false   // guard against double-invocation

export function initGame() {
  document.getElementById('btn-play-again').addEventListener('click', goLobby)
  document.getElementById('btn-leave-table').addEventListener('click', () => {
    clearInterval(handResultTimer)
    handResultTimer = null
    goLobby()
  })
  document.getElementById('btn-end-game').addEventListener('click', () => {
    if (confirm('End the game for everyone and return to lobby?')) goLobby()
  })

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

  // Show End Game button for host in a private room
  const endBtn = document.getElementById('btn-end-game')
  endBtn.style.display = (state.roomCode && state.isHost) ? 'inline-flex' : 'none'

  render()

  let fetching = false
  state.poll = setInterval(async () => {
    if (fetching) return
    fetching = true
    try {
      state.gameState = await api.getState(state.gameId, state.matchId, state.sessionId)
      saveSession()
      render()
      if (state.gameState?.metadata?.winner) {
        stopPoll()
        onHandEnd(state.gameState.metadata)
      }
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
    onHandEnd(state.gameState.metadata)
  }
}

function onHandEnd(meta) {
  if (state.gameId === 'poker') showHandResult(meta)
  else showWinner(meta.winner)
}

async function showHandResult(meta) {
  if (handResultActive) return
  handResultActive = true

  const oppId  = (state.gameState.players || []).find(p => p !== state.sessionId)
  const chips  = meta.chips || {}
  const won    = meta.winner === state.sessionId

  // Give players 2 seconds to see revealed cards before the panel appears
  await sleep(2000)

  document.getElementById('hr-emoji').textContent     = won ? '🏆' : '😔'
  const titleEl = document.getElementById('hr-title')
  titleEl.textContent = won ? 'You Win!' : 'You Lose'
  titleEl.className   = 'winner-title ' + (won ? 'win' : 'lose')

  const myChips  = chips[state.sessionId] ?? 0
  const oppChips = oppId ? (chips[oppId] ?? 0) : 1
  document.getElementById('hr-my-chips').textContent  = myChips
  document.getElementById('hr-opp-chips').textContent = oppChips

  const statusEl = document.getElementById('hr-status')

  // Check if someone is eliminated
  const busted = myChips === 0 || oppChips === 0
  if (busted) {
    statusEl.textContent = myChips === 0
      ? "You're out of chips — game over!"
      : 'Opponent is out of chips — you win the table!'
    document.getElementById('hand-result-overlay').classList.add('open')
    handResultActive = false  // game over; no next hand
    return
  }

  // Private room, non-host: wait for host to start the next hand
  const isPrivateRoom = !!state.roomCode
  if (isPrivateRoom && !state.isHost) {
    statusEl.textContent = 'Waiting for host to start next hand…'
    document.getElementById('hand-result-overlay').classList.add('open')
    // Poll until the new hand begins (winner clears)
    state.poll = setInterval(async () => {
      try {
        const gs = await api.getState(state.gameId, state.matchId, state.sessionId)
        if (!gs?.metadata?.winner && gs?.metadata?.phase !== 'showdown') {
          stopPoll()
          document.getElementById('hand-result-overlay').classList.remove('open')
          state.gameState = gs
          handResultActive = false  // allow future hands to show result
          enterGame()
        }
      } catch { /* keep polling */ }
    }, 2200)
    return
  }

  // Host in private room OR public match: 5-second countdown then auto-start
  let secs = 5
  statusEl.textContent = `Next hand in ${secs}s…`
  document.getElementById('hand-result-overlay').classList.add('open')

  handResultTimer = setInterval(() => {
    secs--
    if (secs > 0) {
      statusEl.textContent = `Next hand in ${secs}s…`
    } else {
      clearInterval(handResultTimer)
      handResultTimer = null
      startNextHand()
    }
  }, 1000)
}

async function startNextHand() {
  // Keep handResultActive = true the whole time so the poll in enterGame()
  // can't re-trigger onHandEnd while we're still waiting for a clean state.
  document.getElementById('hand-result-overlay').classList.remove('open')
  try {
    const res = await api.move(state.gameId, state.sessionId, state.matchId, { type: 'start' })
    if (res?.state) state.gameState = res.state
  } catch (e) {
    console.log('[game] next hand start:', e.message)
  }
  // Always poll until the server confirms winner is gone — whether start
  // succeeded, failed, or returned a still-stale showdown state.
  for (let i = 0; i < 12; i++) {
    if (!state.gameState?.metadata?.winner) break
    await sleep(350)
    try {
      const gs = await api.getState(state.gameId, state.matchId, state.sessionId)
      if (!gs?.metadata?.winner) { state.gameState = gs; break }
    } catch { /* keep trying */ }
  }
  handResultActive = false  // safe to clear only after winner is gone
  enterGame()
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
