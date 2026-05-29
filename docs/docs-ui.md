# UI & Asset File Reference (CSS, HTML, Config)

---

## `src/styles/base.css`

Foundation layer — CSS variables, resets, global decorative elements.

**CSS Variables (`:root`):**
- Colors: `--pink`, `--blue`, `--bg` (dark), `--surface`, `--text`, `--muted`
- Gradients: `--grad` (pink→blue diagonal)
- Shadows: `--shadow-md`, `--shadow-lg`
- Borders: `--border` (faint white), `--border-h` (hover, brighter)

**Global patterns:**
- `body` — dark bg (`#0a0a0f`), dot-grid pattern via `radial-gradient`, min-height 100dvh
- `.glass` — glassmorphism card: `backdrop-filter: blur`, gradient border, dark fill
- Ambient glow blobs — `body::before/::after` positioned pseudo-elements (pink/blue)
- Custom scrollbar — thin, uses `--surface` track

---

## `src/styles/components.css`

Reusable UI component styles.

**Buttons (`.btn*`):**
- `.btn` — base: rounded, padding, transition, border
- `.btn-primary` — gradient fill (pink→blue), shimmer `::after` on hover
- `.btn-ghost` — transparent, border, glow on hover
- `.btn-danger` — red tint
- `.btn-blue` / `.btn-pink` — solid color variants
- Disabled: `opacity: 0.35`, `pointer-events: none`

**Inputs:**
- `.input-field` — dark bg, pink focus ring, placeholder muted
- `.label` — small uppercase tracking

**Toast (`.toast`):**
- Fixed bottom-center, slide-up animation (`translateY`)
- Hidden by default, `.show` triggers visibility + translate

**Modals / Overlays:**
- `.overlay` — fixed fullscreen, `backdrop-filter: blur(8px)`, hidden; `.open` shows it
- `.modal-box` — centered `.glass` card inside overlay
- `.color-grid` — 2×2 grid for UNO color picker buttons

**Game overlays:**
- `#winner-overlay`, `#between-rounds-overlay` — full-screen, dark blur, centered content
- `.wr-countdown` — large countdown number
- `.hand-winner-banner` — centered card for hand result text

**Turn pill:**
- `.turn-pill` — rounded badge, colors: `.mine` (pink), `.theirs` (muted), `.spectating` (blue)

---

## `src/styles/layout.css`

Page-level layout grids and structural styles.

**Login page (`#view-login`):**
- Centered card, logo image, brand text, input stack, config toggle at bottom

**Home page (`#view-home`):**
- Column layout: title, create/join buttons

**Create page (`#view-create`):**
- Mode cards for Poker / UNO selection with icons and descriptions

**Lobby page (`#view-room`):**
- Room code display + copy button
- Player/spectator count pills
- Player list (scrollable)
- Host settings panel (max players, chips, timer, rounds inputs) — hidden for non-host

**Room dropdown (`#room-dropdown`):**
- Fixed-position panel (appears in game screen)
- Shows room code, player list, leave button
- Toggled by a menu button in-game

---

## `src/styles/games/poker.css`

Poker table layout, seat positioning, and card animations (~450 lines).

**Table structure:**
```
.pk-table-unit
  └─ .pk-table-area          (relative, contains oval + overlay)
       ├─ .pk-table           (oval: border-radius, gradient border, center content)
       │    ├─ .pk-pot-area   (pot amount, blinds)
       │    ├─ .pk-comm-cards (community cards row)
       │    └─ .pk-table-bet  (current round bet)
       └─ .pk-opponents-overlay  (absolute fill, seats positioned here)
            └─ .pk-opp-slot[data-seat="top-center|top-left|..."]
                 └─ .pk-player-badge  (avatar + name + chips)
  └─ .pk-player-zone           (local player at bottom)
       └─ .pk-my-badge         (avatar + name + chips, larger)
```

**Seat positions (`data-seat` values):** `top-center`, `top-left`, `top-right`, `left`, `mid-left`, `mid-right`, `right`

**Action bar (`.pk-action-bar`):**
- Fold, Check/Call, Bet input + button
- `.pk-timer-bar` — progress bar fill animation for turn timer

**Animations:**
- `.flying-chip` — absolute positioned, `--tx`/`--ty` CSS vars, translate keyframe
- `.pk-opp-slot.winner-flash` — gold glow pulse
- `.pk-hand-winner` — 3D flip-in animation (`rotateX`)
- Fold: `.folding-card` — rotate + translate off screen
- All-in runout: staggered card reveals via JS-added delays

**Cards:**
- `.p-card` — 56×78px container
- `.p-card.back` — gradient back face
- `.p-card img` — face card image

---

## `src/styles/games/uno.css`

UNO card hand and board styling.

**Cards:**
- `.uno-card` — 72×104px rounded rect, gradient background by color
  - `.red` → red gradient, `.blue`, `.green`, `.yellow` → respective gradients
  - `.wild` → conic-gradient (4 color quadrants)
  - `.playable` — white outline, lifts on hover (`translateY(-6px)`)
  - `.not-playable` — `opacity: 0.38`, no pointer events
- `.uno-card-img` — image-based variant (SVG from R2), same sizing

**Hand layout:**
- `.hand-row` — flex-wrap row, gap between cards
- `.uno-discard` — larger card display for top of discard pile
- `.mini-card` — 18×26px back cards for opponent count display, overlap with negative margin

**Color indicators:**
- `.color-label` — colored pill showing current active color

---

## `index.html`

Entry for login page. Loads `src/pages/login.js` as ES module.

**Key elements:**
- `#view-login` — login form (username input, worker URL config, login button)
- `#view-home` — home screen (Create Room, Join Room buttons)
- `#view-create` — game picker (Poker card, UNO card)
- `#toast` — toast container

---

## `lobby.html`

Entry for waiting-room page. Loads `src/pages/lobby.js` as ES module.

**Key elements:**
- `#view-room` — lobby container
  - `#rm-code` — room code display
  - `#rm-game-badge` — game name pill
  - `#rm-player-list` — player list container
  - `#rm-settings` — host settings panel (hidden for non-host)
- `#toast`

---

## `game.html`

Entry for active game page. Loads `src/pages/game.js` as ES module. Hosts both game boards and all overlays.

**Key elements:**
- `#poker-board` — poker table markup (hidden during UNO)
- `#uno-board` — UNO board markup (hidden during poker)
- `#spectator-panel` — right sidebar, spectator list
- `#turn-pill` — whose-turn indicator
- `#pk-hand-winner` — hand result banner (poker)
- `#winner-overlay` — game-over full-screen overlay
- `#between-rounds-overlay` — countdown overlay between hands
- `#color-modal` — UNO wild color picker modal (`.overlay`)
- `#room-dropdown` — slide-in room info panel
- `#toast`

---

## `vite.config.js`

```js
base: '/minigame/'   // GitHub Pages subpath
build.rollupOptions.input: { index, lobby, game }  // three entry points
```

Output goes to `dist/`. Each HTML gets its own JS bundle.

---

## `api.md`

Full API specification (not served to browser). Reference doc for backend endpoints, request/response shapes, error codes. Used when debugging API calls or adding new endpoints.
