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

**Themes:**
- Default (Casino): dark navy bg, pink/blue accent, green poker felt
- `html[data-theme="hangout"]` (Hangout House): warm dark brown bg (`#0f0a04`), amber/gold accents, cognac felt; set via `document.documentElement.dataset.theme`; persisted to `localStorage('sk_theme')`
- Switching: `applyTheme(name)` in `views/game.js`; blank string = Casino, `"hangout"` = Hangout

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
- `#winner-overlay` — fixed bottom bar (slides up), dark blur, `env(safe-area-inset-bottom)` padding; `.open` shows it
- `#between-rounds-overlay` — same shape as winner-overlay, z-index 300 (winner is 400); `.open` shows it
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
- Fixed-position panel on desktop (top-right), bottom sheet on mobile (≤640px)
- Shows room code, player list, leave button; host settings in `#wr-settings`
- Mobile: `max-height: 80vh`, `-webkit-overflow-scrolling: touch`, `overscroll-behavior: contain`, `env(safe-area-inset-bottom)` padding
- Toggled by room menu button in the game header

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

**Player badge states:**
- `.folded` — `opacity: 0.45` + red `FOLDED` pill via `::after`
- `.mucked` — `opacity: 0.45` + grey `MUCK` pill via `::after` (showdown only)
- `.allin` — blue `ALL-IN` pill via `::after`
- `.turn-active` — pulsing glow: pink on `.mine`, blue on opponents
- `.winner-flash` — gold glow burst on winning badge

**Animations:**
- `.flying-chip` — absolute positioned, `--tx`/`--ty` CSS vars, translate keyframe
- `.pk-hand-winner` — fade/scale in/out via `pk-hw-in` / `pk-hw-out` keyframes
- Fold: card clone animates off screen with `card-fold-out` keyframe
- Card reveal: `card-reveal` keyframe (rotateY 90→0 + scale)
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
  - `.playable` — white outline, lifts on hover (`translateY(-12px)`)
  - `.not-playable` — `opacity: 0.38`, no pointer events
  - `.small` — 42×62px compact size for opponent reveal cards
- `.uno-card-img` — image-based variant (SVG from R2), same sizing + `.small` variant

**Opponent zone (multi-player):**
- `.uno-opp-slot` — one row per opponent; `.current-player` tints name blue, `.winner-slot` tints gold
- `.uno-opp-info` — flex row: name + dot + count
- `.uno-turn-dot` — animated blue pulse dot on current player's row
- `.uno-opp-cards` — flex row of cards; `.mini` for back-card display during play
- `.uno-uno-badge` — gold "UNO!" pill (shown when opponent has 1 card)
- `.uno-winner-tag` — 🏆 shown on the 0-card winner during reveal window

**Hand layout:**
- `.hand-row` — flex-wrap row, gap between cards
- `.mini-card` — 26×38px back cards used in `.mini` opponent rows (negative margin overlap)

**Utility elements:**
- `#uno-direction` — direction arrow (↻/↺) next to discard pile
- `#uno-reveal-bar` — blue-tinted bar shown during 10s reveal window with countdown
- `#uno-my-uno` — "UNO!" badge shown in hand label when my hand has 1 card

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

**Viewport:** `viewport-fit=cover` is set so `env(safe-area-inset-bottom)` works on iPhone (home-indicator clearance).

**Key elements:**
- `#poker-board` — poker table markup (hidden during UNO)
- `#uno-board` — UNO board markup (hidden during poker)
- `#spectator-panel` — right sidebar, spectator list
- `#turn-pill` — whose-turn indicator
- `#pk-hand-winner` — hand result banner (poker)
- `#winner-overlay` — game-over full-screen overlay
- `#between-rounds-overlay` — countdown overlay between hands
- `#color-modal` — UNO wild color picker modal (`.overlay`)
- `#room-dropdown` — slide-in room info panel; contains `.rd-theme` with `#theme-btn-casino` / `#theme-btn-hangout`
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
