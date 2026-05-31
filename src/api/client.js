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

  // UNO actions
  unoStart:    (mid, sid)               => request('POST', `/games/uno/${mid}/start`, { sessionId: sid }),
  unoPlay:     (mid, sid, card, color)  => request('POST', `/games/uno/${mid}/play`,  color ? { sessionId: sid, card, color } : { sessionId: sid, card }),
  unoPlayMulti:(mid, sid, cards)        => request('POST', `/games/uno/${mid}/play`,  { sessionId: sid, cards }),
  unoDraw:     (mid, sid)               => request('POST', `/games/uno/${mid}/draw`,  { sessionId: sid }),
  unoPass:     (mid, sid)               => request('POST', `/games/uno/${mid}/pass`,  { sessionId: sid }),
}
