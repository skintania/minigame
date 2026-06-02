import { cfg } from '../state.js'

async function request(method, path, body) {
  const opts = { method, headers: { 'Content-Type': 'application/json' } }
  if (body) opts.body = JSON.stringify(body)
  const r = await fetch(cfg.url + path, opts)
  let d
  try { d = await r.json() } catch { d = {} }
  if (!r.ok) {
    console.error(`[api] ${method} ${path} → ${r.status}`, d)
    throw new Error(d.error || 'Server error')
  }
  return d
}

export const api = {
  // Auth
  auth:   username  => request('POST', '/auth', { username }),
  resume: sessionId => request('POST', '/auth', { sessionId }),

  // Public matchmaking
  join: (sid, gid) => request('POST', '/lobby/join', { sessionId: sid, gameId: gid }),

  // Private rooms
  createRoom:    (sid, gid, opts = {}) => request('POST', '/rooms/create', { sessionId: sid, gameId: gid, ...opts }),
  joinRoom:      (sid, roomCode)       => request('POST', '/rooms/join',   { sessionId: sid, roomCode }),
  getRoomStatus: (roomCode, sid)       => request('GET',  `/rooms/${roomCode}${sid ? `?sessionId=${encodeURIComponent(sid)}` : ''}`),
  switchRole:    (code, sid, role)     => request('PATCH', `/rooms/${code}/role`,     { sessionId: sid, role }),
  patchSettings: (code, sid, settings) => request('PATCH', `/rooms/${code}/settings`, { sessionId: sid, ...settings }),
  leaveRoom:     (code, sid)           => request('DELETE', `/rooms/${code}/leave`,   { sessionId: sid }),
  kickPlayer:    (code, sid, target)   => request('DELETE', `/rooms/${code}/players/${target}`, { sessionId: sid }),

  // Game state (both games share same URL pattern)
  getState: (gid, mid, sid) => request('GET', `/games/${gid}/${mid}/state?sessionId=${encodeURIComponent(sid)}`),

  // Poker actions
  pokerStart:     (mid, sid)         => request('POST', `/games/poker/${mid}/start`,      { sessionId: sid }),
  pokerNextRound: (mid, sid)         => request('POST', `/games/poker/${mid}/next-round`, { sessionId: sid }),
  pokerFold:      (mid, sid)         => request('POST', `/games/poker/${mid}/fold`,       { sessionId: sid }),
  pokerCheck:     (mid, sid)         => request('POST', `/games/poker/${mid}/check`,      { sessionId: sid }),
  pokerCall:      (mid, sid)         => request('POST', `/games/poker/${mid}/call`,       { sessionId: sid }),
  pokerBet:       (mid, sid, amount) => request('POST', `/games/poker/${mid}/bet`,        { sessionId: sid, amount }),
  pokerShow:      (mid, sid)         => request('POST', `/games/poker/${mid}/show`,       { sessionId: sid }),
  pokerMuck:      (mid, sid)         => request('POST', `/games/poker/${mid}/muck`,       { sessionId: sid }),

  // Slave actions
  slaveStart:     (mid, sid)        => request('POST', `/games/slave/${mid}/start`,      { sessionId: sid }),
  slaveNextRound: (mid, sid)        => request('POST', `/games/slave/${mid}/next-round`, { sessionId: sid }),
  slaveEndGame:   (mid, sid)        => request('POST', `/games/slave/${mid}/end-game`,   { sessionId: sid }),
  slavePlay:      (mid, sid, cards) => request('POST', `/games/slave/${mid}/play`,        { sessionId: sid, cards }),
  slavePass:      (mid, sid)        => request('POST', `/games/slave/${mid}/pass`,        { sessionId: sid }),

  // Dummy actions
  dummyStart:       (mid, sid)            => request('POST', `/games/dummy/${mid}/start`,        { sessionId: sid }),
  dummyNextRound:   (mid, sid)            => request('POST', `/games/dummy/${mid}/next-round`,   { sessionId: sid }),
  dummyEndGame:     (mid, sid)            => request('POST', `/games/dummy/${mid}/end-game`,     { sessionId: sid }),
  dummyDraw:        (mid, sid)            => request('POST', `/games/dummy/${mid}/draw`,          { sessionId: sid }),
  dummyDrawDiscard: (mid, sid, card)      => request('POST', `/games/dummy/${mid}/draw-discard`,  { sessionId: sid, card }),
  dummyLay:         (mid, sid, cards)     => request('POST', `/games/dummy/${mid}/lay`,           { sessionId: sid, cards }),
  dummyFak:         (mid, sid, card, meldIndex) => request('POST', `/games/dummy/${mid}/fak`,    { sessionId: sid, card, meldIndex }),
  dummyDiscard:     (mid, sid, card)      => request('POST', `/games/dummy/${mid}/discard`,       { sessionId: sid, card }),

  // Blackjack actions
  blackjackStart:      (mid, sid, bankerMode) => request('POST', `/games/blackjack/${mid}/start`, bankerMode ? { sessionId: sid, bankerMode } : { sessionId: sid }),
  blackjackNextRound:  (mid, sid)         => request('POST', `/games/blackjack/${mid}/next-round`,  { sessionId: sid }),
  blackjackEndGame:    (mid, sid)         => request('POST', `/games/blackjack/${mid}/end-game`,    { sessionId: sid }),
  blackjackBet:        (mid, sid, amount) => request('POST', `/games/blackjack/${mid}/bet`,          { sessionId: sid, amount }),
  blackjackHit:        (mid, sid)         => request('POST', `/games/blackjack/${mid}/hit`,          { sessionId: sid }),
  blackjackStand:      (mid, sid)         => request('POST', `/games/blackjack/${mid}/stand`,        { sessionId: sid }),
  blackjackDoubleDown: (mid, sid)         => request('POST', `/games/blackjack/${mid}/double-down`,  { sessionId: sid }),
  blackjackSplit:      (mid, sid)         => request('POST', `/games/blackjack/${mid}/split`,        { sessionId: sid }),

  // Pok Deng actions
  pokdengStart:     (mid, sid, bankerMode) => request('POST', `/games/pokdeng/${mid}/start`, bankerMode ? { sessionId: sid, bankerMode } : { sessionId: sid }),
  pokdengNextRound: (mid, sid)             => request('POST', `/games/pokdeng/${mid}/next-round`, { sessionId: sid }),
  pokdengEndGame:   (mid, sid)             => request('POST', `/games/pokdeng/${mid}/end-game`,   { sessionId: sid }),
  pokdengBet:       (mid, sid, amount)     => request('POST', `/games/pokdeng/${mid}/bet`,         { sessionId: sid, amount }),
  pokdengDraw:      (mid, sid)             => request('POST', `/games/pokdeng/${mid}/draw`,        { sessionId: sid }),
  pokdengStand:     (mid, sid)             => request('POST', `/games/pokdeng/${mid}/stand`,       { sessionId: sid }),

  // Doraemon actions
  doraemonStart:            (mid, sid)         => request('POST', `/games/doraemon/${mid}/start`,               { sessionId: sid }),
  doraemonEndGame:          (mid, sid)         => request('POST', `/games/doraemon/${mid}/end-game`,            { sessionId: sid }),
  doraemonDraw:             (mid, sid)         => request('POST', `/games/doraemon/${mid}/draw`,                { sessionId: sid }),
  doraemonChooseBuddy:      (mid, sid, target) => request('POST', `/games/doraemon/${mid}/choose-buddy`,        { sessionId: sid, target }),
  doraemonReportLoser:      (mid, sid, target) => request('POST', `/games/doraemon/${mid}/report-loser`,        { sessionId: sid, target }),
  doraemonSetKRule:         (mid, sid, text)   => request('POST', `/games/doraemon/${mid}/set-k-rule`,          { sessionId: sid, text }),
  doraemonBathroom:         (mid, sid)         => request('POST', `/games/doraemon/${mid}/use-bathroom-pass`,   { sessionId: sid }),
  doraemonTriggerGesture:   (mid, sid)         => request('POST', `/games/doraemon/${mid}/trigger-gesture`,     { sessionId: sid }),
  doraemonReportGestureLoser:(mid, sid, target)=> request('POST', `/games/doraemon/${mid}/report-gesture-loser`,{ sessionId: sid, target }),
  doraemonReportTalking:    (mid, sid, talker) => request('POST', `/games/doraemon/${mid}/report-talking`,      { sessionId: sid, talker }),
  doraemonReportPointing:   (mid, sid, offender)=>request('POST', `/games/doraemon/${mid}/report-pointing`,     { sessionId: sid, offender }),
  doraemonSetCategory:      (mid, sid, topic)   => request('POST', `/games/doraemon/${mid}/set-category`,        { sessionId: sid, topic }),

  // Old Maid actions
  oldmaidStart:         (mid, sid)        => request('POST', `/games/oldmaid/${mid}/start`,           { sessionId: sid }),
  oldmaidPick:          (mid, sid, index) => request('POST', `/games/oldmaid/${mid}/pick`,           { sessionId: sid, index }),
  oldmaidSetShuffleMode:(mid, sid, mode)  => request('POST', `/games/oldmaid/${mid}/set-shuffle-mode`,{ sessionId: sid, mode }),
  oldmaidReorderHand:   (mid, sid, cards) => request('POST', `/games/oldmaid/${mid}/reorder-hand`,   { sessionId: sid, cards }),
  oldmaidEndGame:       (mid, sid)        => request('POST', `/games/oldmaid/${mid}/end-game`,        { sessionId: sid }),

  // UNO actions
  unoStart:     (mid, sid)               => request('POST', `/games/uno/${mid}/start`,      { sessionId: sid }),
  unoNextRound: (mid, sid)               => request('POST', `/games/uno/${mid}/next-round`, { sessionId: sid }),
  unoEndGame:   (mid, sid)               => request('POST', `/games/uno/${mid}/end-game`,   { sessionId: sid }),
  unoPlay:      (mid, sid, card, color)  => request('POST', `/games/uno/${mid}/play`,       color ? { sessionId: sid, card, color } : { sessionId: sid, card }),
  unoPlayMulti: (mid, sid, cards, color) => request('POST', `/games/uno/${mid}/play`, color ? { sessionId: sid, cards, color } : { sessionId: sid, cards }),
  unoDraw:      (mid, sid)               => request('POST', `/games/uno/${mid}/draw`,        { sessionId: sid }),
  unoPass:      (mid, sid)               => request('POST', `/games/uno/${mid}/pass`,        { sessionId: sid }),
}
