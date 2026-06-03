const theme = localStorage.getItem('sk_theme')
if (theme) document.documentElement.dataset.theme = theme

const CARD_BASE = `${localStorage.getItem('sk_url') || 'https://minigame-skintania-api.skintania143.workers.dev'}/assets/cards/standard-deck`
const LANG_KEY  = 'sk_howto_lang'
let currentLang = localStorage.getItem(LANG_KEY) || 'en'

// ── Translations ─────────────────────────────────────────────
const T = {
  en: {
    'back': 'Back',
    'header-title': 'How To Play',
    'intro-title': '📖 Game Rules',
    'intro-sub': 'Tap any game below to read its full rules',
    // Poker
    'pk-goal': 'Win the most chips. Last player with chips wins. Each hand, two players post forced <strong>blinds</strong> (SB = 1% starting chips, BB = 2×SB). The dealer button rotates every hand.',
    'pk-h1': 'How a Hand Works',
    'pk-s1': '<span class="ht-step-title">Deal</span> — 2 private hole cards each.',
    'pk-s2': '<span class="ht-step-title">Pre-Flop Betting</span> — Call, Raise, or Fold. BB can Check if nobody raised.',
    'pk-s3': '<span class="ht-step-title">Flop</span> — 3 community cards revealed. New betting round.',
    'pk-s4': '<span class="ht-step-title">Turn</span> — 4th community card. Another round.',
    'pk-s5': '<span class="ht-step-title">River</span> — 5th community card. Final round.',
    'pk-s6': '<span class="ht-step-title">Showdown</span> — Best 5-card hand from any of your 2 + the 5 community wins the pot.',
    'pk-h2': 'Hand Rankings (weak → strong)',
    'pk-th-hand': 'Hand', 'pk-th-ex': 'Example',
    'pk-td1': 'High card',   'pk-td2': 'One pair',       'pk-td3': 'Two pair',
    'pk-td4': 'Three of a kind', 'pk-td5': 'Straight',   'pk-td6': 'Flush',
    'pk-td7': 'Full house',  'pk-td8': 'Four of a kind', 'pk-td9': 'Straight flush',
    'pk-td10': '<strong>Royal flush</strong>',
    'pk-tip': '<strong>All-in:</strong> You can only win the portion of the pot you matched. Excess bets form side pots you cannot win. When everyone is all-in, community cards run out automatically.',
    // UNO
    'un-goal': 'First to empty your hand wins the round. Win the most rounds to win overall. Each player starts with 7 cards.',
    'un-h1': 'Your Turn',
    'un-li1': 'Play a card matching the discard\'s <strong>color or number/type</strong>, or play a Wild.',
    'un-li2': 'If you can\'t or won\'t play, draw 1 card. If it\'s playable, you may play it immediately.',
    'un-h2': 'Special Cards',
    'un-th-card': 'Card', 'un-th-eff': 'Effect',
    'un-td-skip': 'Next player loses their turn.',
    'un-td-rev':  'Flip turn order. With 2 players, acts like Skip.',
    'un-td-d2':   'Next player draws 2 and loses turn — or <strong>stacks</strong> another Draw 2 / Wild Draw 4 to pass it on.',
    'un-td-wild': 'Play on anything. You choose the new color.',
    'un-td-wd4':  'Play only when you have no card matching the current color. Next player draws 4. Stackable.',
    'un-h3': 'Multi-Card Stacking',
    'un-li3': 'You may play multiple cards of the <strong>same value</strong> in one turn if the first card is valid.',
    'un-li4': 'Each extra card adds its effect (e.g. 3 Skips skip 3 players; 2 Draw Twos = +4 penalty).',
    'un-li5': 'You cannot mix different value types (e.g. Skip + Reverse) in one play.',
    'un-tip': '<strong>Stacking Draw penalties:</strong> Keep passing +2/+4 down the line until someone can\'t stack — they take the full accumulated amount.',
    // Blackjack
    'bj-goal': 'Beat the dealer by getting closer to <strong>21</strong> without busting. Each player competes against the dealer independently.',
    'bj-h1': 'Card Values',
    'bj-li1': '2–9 → face value · 10/J/Q/K → 10 · Ace → 11 (or 1 to avoid bust)',
    'bj-li2': 'A hand with Ace as 11 = <strong>soft</strong> hand (e.g. A+6 = soft 17)',
    'bj-h2': 'Round Flow',
    'bj-s1': '<span class="ht-step-title">Bet</span> — All players place bets before cards are dealt.',
    'bj-s2': '<span class="ht-step-title">Deal</span> — 2 cards face-up to each player. Dealer gets 1 face-up + 1 hole card.',
    'bj-s3': '<span class="ht-step-title">Players Act</span> — Hit, Stand, Double Down, or Split in clockwise order.',
    'bj-s4': '<span class="ht-step-title">Dealer Plays</span> — Reveals hole card. Hits on soft 17 or below; stands on hard 17+.',
    'bj-s5': '<span class="ht-step-title">Resolution</span> — Compare each hand against dealer.',
    'bj-h3': 'Player Actions',
    'bj-th-act': 'Action', 'bj-th-cond': 'Condition', 'bj-th-eff': 'Effect',
    'bj-td-hita':  'Any time',              'bj-td-hite':  'Take 1 more card',
    'bj-td-sta':   'Any time',              'bj-td-ste':   'End your turn',
    'bj-td-dda':   'First action only',     'bj-td-dde':   'Double bet, take exactly 1 card, then stand',
    'bj-td-spa':   'First 2 cards same rank','bj-td-spe':  'Split into 2 hands; bet doubled; each gets 1 new card',
    'bj-h4': 'Payouts',
    'bj-th-res': 'Result', 'bj-th-pay': 'Payout',
    'bj-td-winr':  'Player wins',                      'bj-td-wine': '+1× bet',
    'bj-td-bjr':   'Natural Blackjack (A + 10-value)', 'bj-td-bje':  '<strong>+1.5× bet</strong>',
    'bj-td-pushr': 'Push (equal total)',               'bj-td-pushe':'Bet returned',
    'bj-td-loser': 'Player busts / dealer higher',     'bj-td-losee':'Lose bet',
    'bj-tip': '<strong>Banker Modes:</strong> <strong>Bot</strong> — house dealer draws by fixed rules. <strong>Rotate</strong> — one player is dealer each round; their chips mirror total player results (zero-sum).',
    // Pok Deng
    'pd-goal': 'Beat the banker\'s hand. Your payout is multiplied by a <strong>Deng</strong> bonus. Hand value = sum of cards <strong>mod 10</strong>. Highest value is 9.',
    'pd-h1': 'Card Values',
    'pd-li1': 'A=1, 2–9=face value, 10/J/Q/K=0',
    'pd-li2': 'Example: 9+8=17 → <strong>7 points</strong> · K+5=5 → <strong>5 points</strong>',
    'pd-h2': 'Round Flow',
    'pd-s1': '<span class="ht-step-title">Bet</span> — Non-banker players bet.',
    'pd-s2': '<span class="ht-step-title">Deal</span> — 2 cards to everyone (including banker).',
    'pd-s3': '<span class="ht-step-title">Draw</span> — If your value is <strong>5 or below</strong>, you may draw a 3rd card. 6+ = auto stand.',
    'pd-s4': '<span class="ht-step-title">Resolution</span> — Each player vs banker: higher value wins. Tie → compare Deng.',
    'pd-h3': 'Deng Multipliers',
    'pd-th-hand': 'Hand type', 'pd-th-deng': 'Deng',
    'pd-td1': 'No bonus',                           'pd-td2': 'Pair / Same suit (2-card)',
    'pd-td3': 'Straight / Flush (3-card)',           'pd-td4': 'Three of a kind / Straight flush',
    'pd-tip': '<strong>Payout:</strong> Win → receive <code>bet × your Deng</code>. Lose → pay <code>bet × banker\'s Deng</code>. High Deng hands swing chips fast!',
    // Old Maid
    'om-goal': 'Get rid of all your cards. The last player holding the <strong>Joker</strong> loses — it can never be paired and is always stuck with someone.',
    'om-h1': 'Setup',
    'om-li1': '53 cards (52 + 1 Joker) are dealt to all players.',
    'om-li2': 'Immediately discard all <strong>pairs</strong> from your hand (same rank, any suits). Four of a kind = two pairs discarded.',
    'om-li3': 'The Joker can never be paired.',
    'om-h2': 'Your Turn',
    'om-s1': 'The player to your left holds their cards <strong>face-down</strong> toward you.',
    'om-s2': '<strong>Pick one card</strong> blindly from their hand.',
    'om-s3': 'If it pairs with a card you have, discard the pair. Otherwise keep it.',
    'om-s4': 'Turn passes — the player to your left now picks from their neighbour.',
    'om-h3': 'Shuffle Modes',
    'om-th-mode': 'Mode', 'om-th-eff': 'Effect',
    'om-td-autom': 'Auto (default)',
    'om-td-autoe': 'Server picks a random card regardless of position selected. Always fair.',
    'om-td-manm':  'Manual',
    'om-td-mane':  'You reorder your own hand before each pick. The other player\'s chosen position maps to your real arrangement — try to hide the Joker!',
    'om-tip': 'When your hand empties you are <strong>safely eliminated</strong> (you win for yourself). Play continues among those still holding cards. The last player with cards loses.',
    // Slave
    'sl-goal': 'Empty your hand first to become <strong>President</strong>. Last to empty becomes <strong>Slave</strong>. Ranks carry privileges into the next round.',
    'sl-h1': 'Rank Order (low → high)',
    'sl-suit': 'Suit tiebreak: ♣ ‹ ♦ ‹ ♥ ‹ ♠',
    'sl-h2': 'Your Turn',
    'sl-li1': 'Play cards of the <strong>same rank</strong> that beat the current trick (higher rank, matching card count).',
    'sl-li2': 'If counts match but rank is equal, highest suit among your played cards must win.',
    'sl-li3': 'Cannot play: pass. Cannot pass if you need to start a new trick.',
    'sl-li4': 'First round: the player holding <strong>3♣ must lead with it</strong>.',
    'sl-h3': 'Cross-Count Special Rules',
    'sl-th-play': 'Play', 'sl-th-beats': 'Beats',
    'sl-td-trip':  'Any <strong>triple</strong> (3 same rank)', 'sl-td-tripd': 'Any single card — even a 2',
    'sl-td-quad':  'Any <strong>four-of-a-kind</strong>',      'sl-td-quadd': 'Any pair — even a pair of 2s',
    'sl-h4': 'Card Exchange (between rounds)',
    'sl-li5': 'Slave gives their <strong>2 best cards</strong> to President; President returns 2 of their choice.',
    'sl-li6': 'Vice Slave gives <strong>1 best card</strong> to Vice President; VP returns 1.',
    'sl-li7': 'With 2–3 players: Slave gives 1 best → President returns 1.',
    'sl-h5': 'Titles',
    'sl-th-fin': 'Finish', 'sl-th-title': 'Title',
    'sl-td-1f': '1st',      'sl-td-1t': '<strong>President</strong> 👑',
    'sl-td-2f': '2nd',      'sl-td-2t': 'Vice President',
    'sl-td-mf': 'Middle',   'sl-td-mt': 'Citizen',
    'sl-td-2lf':'2nd-last', 'sl-td-2lt':'Vice Slave',
    'sl-td-lf': 'Last',     'sl-td-lt': '<strong>Slave</strong>',
    // Dummy
    'dm-goal': 'Lay all your cards in valid melds first. Earn points for cards played; lose points for cards left in hand. Highest score after all rounds wins.',
    'dm-h1': 'Valid Melds',
    'dm-li1': '<strong>Set:</strong> 3–4 cards of the same rank, any suits (e.g. 7♠ 7♥ 7♦)',
    'dm-li2': '<strong>Run:</strong> 3+ consecutive ranks of the <strong>same suit</strong>. Ace is high only (e.g. Q♦ K♦ A♦ ✅ · A♥ 2♥ 3♥ ❌)',
    'dm-h2': 'Your Turn (in order)',
    'dm-s1': '<span class="ht-step-title">Draw (required)</span> — from the stock pile or a specific discard pile card. Your <strong>first lay-down ever</strong> must use a discard-drawn card.',
    'dm-s2': '<span class="ht-step-title">Lay melds (optional)</span> — Place valid melds from your hand on the table.',
    'dm-s3': '<span class="ht-step-title">Fak / ฝาก (optional)</span> — Add cards onto existing melds (yours or others\'). Only after you\'ve opened.',
    'dm-s4': '<span class="ht-step-title">Discard (required)</span> — unless your hand is empty (you win!).',
    'dm-h3': 'Penalties &amp; Bonuses',
    'dm-th-rule': 'Rule', 'dm-th-eff': 'Effect',
    'dm-td1r': 'Missed Fak',          'dm-td1e': '−50 pts if you discard a card that could legally fak an existing meld (only after you\'ve opened)',
    'dm-td2r': 'Blind Knock',         'dm-td2e': 'Never drew from discard? Every other player\'s hand penalty ×2 (or ×4 if single-suit melds)',
    'dm-td3r': 'Dummy (never opened)','dm-td3e': 'Your hand penalty ×2',
    'dm-td4r': 'Opening card in hand','dm-td4e': '−50 pts',
    'dm-td5r': '2♣ or Q♠ in hand',   'dm-td5e': '−50 pts each',
    'dm-td6r': 'Feeding',             'dm-td6e': '−50 pts if next player uses your just-discarded card in a meld',
    // Doraemon
    'dr-goal': 'No strict winner — a social drinking game. Draw cards clockwise and resolve their effects. <strong>Never point with your finger!</strong> (Doraemon has no hands.) Anyone who points drinks 1.',
    'dr-h1': 'Card Effects',
    'dr-th-card': 'Card', 'dr-th-eff': 'Effect',
    'dr-td-a':  'You drink 1. Your buddy (if any) also drinks 1.',
    'dr-td-2':  'You drink 2. Buddy drinks 2.',
    'dr-td-3':  'You drink 3. Buddy drinks 3.',
    'dr-td-4':  'You drink 4. Buddy drinks 4.',
    'dr-td-5':  'Choose a <strong>buddy</strong> — you share each other\'s drink penalties until a new 5 is drawn.',
    'dr-td-6':  '<strong>Category game:</strong> Name a category. Players name things in it clockwise. First to fail drinks 1.',
    'dr-td-7':  '<strong>Number 7 game:</strong> Count up; say "buzz" for any multiple or number containing 7. Miss = drink 1.',
    'dr-td-8':  'Gain a <strong>bathroom pass</strong>. Use it at any time to skip one drink penalty.',
    'dr-td-9':  'Player to your <strong>left</strong> drinks 1 (+ their buddy).',
    'dr-td-10': 'Player to your <strong>right</strong> drinks 1 (+ their buddy).',
    'dr-td-j':  'Gain <strong>Gesture Power</strong>. At any moment, trigger a pose challenge — last to copy it drinks 1. Power transfers when a new J is drawn.',
    'dr-td-q':  'You are <strong>silenced</strong>. Anyone who speaks directly to you drinks 1. Silence transfers on next Q.',
    'dr-td-k':  'Builds a <strong>group rule</strong> across 4 Kings: K1=WHAT, K2=WHERE, K3=HOW LONG, K4=rule activates for rest of game.',
    'dr-tip': '🍺 Drink responsibly and only with consenting adults. The game ends when the deck runs out — a drink total summary is shown for everyone.',
    // Bluff
    'bl-goal': 'First to empty your hand wins. Play cards face-down claiming they are the required rank — even if they\'re not. The next player can either play or call <strong>"Bluff!"</strong>',
    'bl-h1': 'Rank Cycle',
    'bl-rank-note': 'After any challenge, rank resets to A.',
    'bl-h2': 'Your Turn — Two Choices',
    'bl-play': '<span class="ht-step-title">Play Cards</span> — Select 1–4 cards and place them face-down. Claim they are all the current required rank. <strong>Bluffing is allowed</strong> — any cards can be played. Rank advances to next after your play.',
    'bl-chal': '<span class="ht-step-title">Call "Bluff!"</span> — Challenge the previous player\'s claim. Cards are revealed:<br>• All cards match claimed rank → <strong>challenger</strong> takes the pile.<br>• Any card doesn\'t match → <strong>bluffer</strong> takes the pile.',
    'bl-h3': 'Key Rules',
    'bl-li1': 'Only the <strong>current player</strong> can act — no challenging on someone else\'s turn.',
    'bl-li2': 'You <strong>cannot challenge your own play</strong>.',
    'bl-li3': 'Playing your <strong>last card wins immediately</strong> — no challenge window.',
    'bl-li4': 'Pile contents stay hidden until a challenge reveals the most recent play.',
    'bl-tip': '<strong>Strategy:</strong> Track how many of each rank have been claimed. If someone claims 4 Aces after 3 Aces already appeared, they\'re almost certainly bluffing. Challenge early for small piles, or wait and risk a huge one.',
  },
  th: {
    'back': 'กลับ',
    'header-title': 'วิธีเล่น',
    'intro-title': '📖 กฎกติกา',
    'intro-sub': 'แตะเกมด้านล่างเพื่ออ่านกติกาเต็ม',
    // Poker
    'pk-goal': 'สะสมชิปให้มากที่สุด คนที่มีชิปคนสุดท้ายชนะ แต่ละมือผู้เล่น 2 คนต้องวาง <strong>บลายด์</strong> บังคับ (SB = 1% ชิปเริ่มต้น, BB = 2×SB) ปุ่ม Dealer หมุนทุกมือ',
    'pk-h1': 'ขั้นตอนแต่ละมือ',
    'pk-s1': '<span class="ht-step-title">แจกไพ่</span> — แจกไพ่ลับ 2 ใบให้แต่ละคน',
    'pk-s2': '<span class="ht-step-title">เดิมพันก่อนฟล็อป</span> — เรียก เพิ่ม หรือพับ BB เช็คได้ถ้าไม่มีใครขึ้น',
    'pk-s3': '<span class="ht-step-title">ฟล็อป</span> — เปิดไพ่กลาง 3 ใบ เริ่มรอบเดิมพันใหม่',
    'pk-s4': '<span class="ht-step-title">เทิร์น</span> — ไพ่กลางใบที่ 4 อีกรอบเดิมพัน',
    'pk-s5': '<span class="ht-step-title">ริเวอร์</span> — ไพ่กลางใบที่ 5 รอบสุดท้าย',
    'pk-s6': '<span class="ht-step-title">โชว์ไพ่</span> — ผสมไพ่ 5 ใบดีที่สุดจากไพ่มือ 2 + ไพ่กลาง 5 ชนะพอต',
    'pk-h2': 'อันดับไพ่ (อ่อน → แข็ง)',
    'pk-th-hand': 'ไพ่', 'pk-th-ex': 'ตัวอย่าง',
    'pk-td1': 'ไพ่สูงสุด', 'pk-td2': 'หนึ่งคู่',   'pk-td3': 'สองคู่',
    'pk-td4': 'ตรี',        'pk-td5': 'เรียง',       'pk-td6': 'ดอกเดียวกัน',
    'pk-td7': 'ฟูลเฮาส์',  'pk-td8': 'สี่ตัว',      'pk-td9': 'เรียงดอก',
    'pk-td10': '<strong>รอยัลฟลัช</strong>',
    'pk-tip': '<strong>ออลอิน:</strong> ชนะได้เฉพาะส่วนพอตที่เดิมพันเท่านั้น เดิมพันส่วนเกินสร้างไซด์พอตที่ไม่มีสิทธิ์ชนะ เมื่อทุกคนออลอิน ไพ่กลางจะเปิดอัตโนมัติ',
    // UNO
    'un-goal': 'คนแรกที่ทิ้งไพ่หมดมือชนะรอบนั้น ชนะมากรอบที่สุดคือผู้ชนะรวม แต่ละคนเริ่มด้วยไพ่ 7 ใบ',
    'un-h1': 'ตาของคุณ',
    'un-li1': 'ลงไพ่ที่ตรงกับ<strong>สีหรือหมายเลข/ประเภท</strong>ของกองทิ้ง หรือลง Wild',
    'un-li2': 'ถ้าไม่มีหรือไม่ต้องการลง ให้จั่วไพ่ 1 ใบ ถ้าลงได้สามารถลงทันที',
    'un-h2': 'ไพ่พิเศษ',
    'un-th-card': 'ไพ่', 'un-th-eff': 'ผล',
    'un-td-skip': 'ผู้เล่นถัดไปเสียตา',
    'un-td-rev':  'สลับทิศทาง ถ้ามี 2 คน ทำงานเหมือน Skip',
    'un-td-d2':   'ผู้เล่นถัดไปจั่ว 2 ใบและเสียตา — หรือ<strong>ซ้อน</strong> Draw 2/Wild Draw 4 ส่งต่อได้',
    'un-td-wild': 'ลงได้ทุกเวลา คุณเลือกสีใหม่',
    'un-td-wd4':  'ลงได้เฉพาะเมื่อไม่มีไพ่ตรงสีปัจจุบัน ผู้เล่นถัดไปจั่ว 4 ใบ ซ้อนได้',
    'un-h3': 'การซ้อนไพ่หลายใบ',
    'un-li3': 'ลงไพ่หลายใบที่<strong>แต้มเดียวกัน</strong>ในตาเดียวได้ถ้าใบแรกถูกต้อง',
    'un-li4': 'ไพ่เพิ่มแต่ละใบบวกผล (เช่น Skip 3 ใบข้าม 3 คน; Draw Two 2 ใบ = โทษ +4)',
    'un-li5': 'ไม่สามารถผสมประเภทต่างกัน (เช่น Skip + Reverse) ในตาเดียว',
    'un-tip': '<strong>การซ้อนโทษจั่วไพ่:</strong> ส่งต่อโทษ +2/+4 ไปเรื่อยๆ จนกว่าจะมีคนซ้อนต่อไม่ได้ — คนนั้นรับโทษสะสมทั้งหมด',
    // Blackjack
    'bj-goal': 'เอาชนะเจ้ามือโดยได้แต้มใกล้ <strong>21</strong> มากที่สุดโดยไม่เกิน แต่ละคนแข่งกับเจ้ามือแยกกัน',
    'bj-h1': 'ค่าไพ่',
    'bj-li1': '2–9 → ตามหน้าไพ่ · 10/J/Q/K → 10 · A → 11 (หรือ 1 เพื่อไม่ให้เกิน)',
    'bj-li2': 'ไพ่ที่มี A เป็น 11 = มือ<strong>อ่อน</strong> (เช่น A+6 = soft 17)',
    'bj-h2': 'ขั้นตอนการเล่น',
    'bj-s1': '<span class="ht-step-title">วางเดิมพัน</span> — ทุกคนวางเดิมพันก่อนแจกไพ่',
    'bj-s2': '<span class="ht-step-title">แจกไพ่</span> — แจกหงาย 2 ใบให้แต่ละคน เจ้ามือได้ 1 หงาย + 1 คว่ำ',
    'bj-s3': '<span class="ht-step-title">ผู้เล่นเลือก</span> — Hit, Stand, Double Down หรือ Split ตามเข็มนาฬิกา',
    'bj-s4': '<span class="ht-step-title">เจ้ามือเล่น</span> — เปิดไพ่คว่ำ Hit ถ้า soft 17 หรือต่ำกว่า Stand ที่ hard 17+',
    'bj-s5': '<span class="ht-step-title">ตัดสินผล</span> — เปรียบมือแต่ละคนกับเจ้ามือ',
    'bj-h3': 'การกระทำของผู้เล่น',
    'bj-th-act': 'การกระทำ', 'bj-th-cond': 'เงื่อนไข', 'bj-th-eff': 'ผล',
    'bj-td-hita':  'เมื่อไรก็ได้', 'bj-td-hite':  'จั่วไพ่เพิ่ม 1 ใบ',
    'bj-td-sta':   'เมื่อไรก็ได้', 'bj-td-ste':   'จบตาของคุณ',
    'bj-td-dda':   'การกระทำแรกเท่านั้น', 'bj-td-dde': 'เพิ่มเดิมพัน 2 เท่า จั่ว 1 ใบ แล้ว Stand',
    'bj-td-spa':   'ไพ่ 2 ใบแรกแต้มเดียวกัน', 'bj-td-spe': 'แยกเป็น 2 มือ เดิมพัน 2 เท่า แต่ละมือได้ไพ่ใหม่ 1 ใบ',
    'bj-h4': 'เงินรางวัล',
    'bj-th-res': 'ผลลัพธ์', 'bj-th-pay': 'รางวัล',
    'bj-td-winr':  'ผู้เล่นชนะ',               'bj-td-wine': '+1× เดิมพัน',
    'bj-td-bjr':   'แบล็คแจ็ค (A + ไพ่ค่า 10)','bj-td-bje':  '<strong>+1.5× เดิมพัน</strong>',
    'bj-td-pushr': 'เสมอ (แต้มเท่ากัน)',        'bj-td-pushe':'คืนเดิมพัน',
    'bj-td-loser': 'ผู้เล่นแตก / เจ้ามือสูงกว่า','bj-td-losee':'เสียเดิมพัน',
    'bj-tip': '<strong>โหมดเจ้ามือ:</strong> <strong>Bot</strong> — เจ้ามือคอมพิวเตอร์ตามกฎตายตัว <strong>Rotate</strong> — ผู้เล่นสลับกันเป็นเจ้ามือทุกรอบ ชิปเจ้ามือสะท้อนผลรวมผู้เล่น (zero-sum)',
    // Pok Deng
    'pd-goal': 'เอาชนะเจ้ามือ เงินรางวัลคูณด้วยโบนัส <strong>เด้ง</strong> ค่าไพ่ = ผลรวมไพ่ <strong>mod 10</strong> สูงสุดคือ 9',
    'pd-h1': 'ค่าไพ่',
    'pd-li1': 'A=1, 2–9=ตามหน้า, 10/J/Q/K=0',
    'pd-li2': 'ตัวอย่าง: 9+8=17 → <strong>7 แต้ม</strong> · K+5=5 → <strong>5 แต้ม</strong>',
    'pd-h2': 'ขั้นตอนการเล่น',
    'pd-s1': '<span class="ht-step-title">วางเดิมพัน</span> — ผู้เล่นที่ไม่ใช่เจ้ามือวางเดิมพัน',
    'pd-s2': '<span class="ht-step-title">แจกไพ่</span> — แจก 2 ใบให้ทุกคน (รวมเจ้ามือ)',
    'pd-s3': '<span class="ht-step-title">จั่วเพิ่ม</span> — ถ้าแต้ม <strong>5 หรือต่ำกว่า</strong> จั่วไพ่ใบที่ 3 ได้ 6+ = หยุดอัตโนมัติ',
    'pd-s4': '<span class="ht-step-title">ตัดสินผล</span> — เปรียบแต่ละคนกับเจ้ามือ แต้มสูงกว่าชนะ เสมอ → เปรียบเด้ง',
    'pd-h3': 'ตัวคูณเด้ง',
    'pd-th-hand': 'ประเภทไพ่', 'pd-th-deng': 'เด้ง',
    'pd-td1': 'ไม่มีโบนัส',             'pd-td2': 'คู่ / สีเดียว (2 ใบ)',
    'pd-td3': 'เรียง / ดอกเดียว (3 ใบ)','pd-td4': 'ตรี / เรียงดอก',
    'pd-tip': '<strong>การจ่ายเงิน:</strong> ชนะ → รับ <code>เดิมพัน × เด้งของคุณ</code> แพ้ → จ่าย <code>เดิมพัน × เด้งเจ้ามือ</code> เด้งสูงทำให้ชิปแกว่งเร็วมาก!',
    // Old Maid
    'om-goal': 'ทิ้งไพ่ให้หมดมือ คนสุดท้ายที่ถือ <strong>โจ๊กเกอร์</strong> แพ้ — ไพ่นี้ไม่มีคู่และติดอยู่กับใครสักคนเสมอ',
    'om-h1': 'การเตรียม',
    'om-li1': 'แจกไพ่ 53 ใบ (52 + โจ๊กเกอร์ 1 ใบ) ให้ผู้เล่นทุกคน',
    'om-li2': 'ทิ้ง<strong>คู่</strong>ออกทันที (แต้มเดียวกัน ดอกอะไรก็ได้) สี่ตัว = ทิ้งสองคู่',
    'om-li3': 'โจ๊กเกอร์ไม่มีคู่เสมอ',
    'om-h2': 'ตาของคุณ',
    'om-s1': 'ผู้เล่นทางซ้ายหันไพ่<strong>คว่ำ</strong>ให้คุณ',
    'om-s2': '<strong>หยิบไพ่ 1 ใบ</strong>แบบสุ่มจากมือของเขา',
    'om-s3': 'ถ้าไพ่ที่หยิบมาเป็นคู่กับไพ่ที่มี ให้ทิ้งคู่นั้น มิฉะนั้นเก็บไว้',
    'om-s4': 'ส่งตา — ผู้เล่นทางซ้ายหยิบไพ่จากเพื่อนบ้าน',
    'om-h3': 'โหมดสับไพ่',
    'om-th-mode': 'โหมด', 'om-th-eff': 'ผล',
    'om-td-autom': 'อัตโนมัติ (ค่าเริ่มต้น)',
    'om-td-autoe': 'เซิร์ฟเวอร์สุ่มไพ่ให้โดยไม่ขึ้นกับตำแหน่งที่เลือก ยุติธรรมเสมอ',
    'om-td-manm':  'ด้วยตนเอง',
    'om-td-mane':  'คุณเรียงไพ่ตัวเองก่อนแต่ละครั้ง ตำแหน่งที่อีกฝ่ายเลือกจะแมปกับการจัดเรียงจริง — พยายามซ่อนโจ๊กเกอร์!',
    'om-tip': 'เมื่อไพ่หมดมือคุณ<strong>ผ่านรอดแล้ว</strong> (ชนะสำหรับตัวเอง) เกมดำเนินต่อในหมู่ผู้ที่ยังถือไพ่ คนสุดท้ายที่ถือไพ่แพ้',
    // Slave
    'sl-goal': 'ทิ้งไพ่หมดก่อนเป็น <strong>ประธานาธิบดี</strong> คนสุดท้ายที่ทิ้งหมดเป็น <strong>ทาส</strong> ตำแหน่งมีสิทธิพิเศษในรอบถัดไป',
    'sl-h1': 'ลำดับไพ่ (ต่ำ → สูง)',
    'sl-suit': 'ดอกตัดสิน: ♣ ‹ ♦ ‹ ♥ ‹ ♠',
    'sl-h2': 'ตาของคุณ',
    'sl-li1': 'ลงไพ่<strong>แต้มเดียวกัน</strong>ที่เหนือกว่ากลเล่นปัจจุบัน (แต้มสูงกว่า จำนวนเท่ากัน)',
    'sl-li2': 'ถ้าจำนวนเท่ากันแต่แต้มเท่ากัน ดอกสูงสุดในไพ่ที่ลงต้องชนะ',
    'sl-li3': 'ลงไม่ได้: พาส ไม่สามารถพาสได้ถ้าต้องเริ่มกลเล่นใหม่',
    'sl-li4': 'รอบแรก: ผู้ถือ <strong>3♣ ต้องนำด้วยไพ่นั้น</strong>',
    'sl-h3': 'กฎพิเศษข้ามจำนวน',
    'sl-th-play': 'ที่ลง', 'sl-th-beats': 'ชนะ',
    'sl-td-trip':  '<strong>สาม</strong>ตัวเดียวกัน', 'sl-td-tripd': 'ไพ่เดี่ยวใดก็ได้ — แม้ไพ่ 2',
    'sl-td-quad':  '<strong>สี่ตัว</strong>เดียวกัน',  'sl-td-quadd': 'คู่ใดก็ได้ — แม้คู่ 2',
    'sl-h4': 'แลกไพ่ (ระหว่างรอบ)',
    'sl-li5': 'ทาสให้<strong>ไพ่ดีสุด 2 ใบ</strong>แก่ประธานาธิบดี ประธานฯ คืน 2 ใบตามใจ',
    'sl-li6': 'รองทาสให้<strong>ไพ่ดีสุด 1 ใบ</strong>แก่รองประธาน รองประธานคืน 1 ใบ',
    'sl-li7': 'ถ้า 2–3 คน: ทาสให้ 1 ใบดีสุด → ประธานฯ คืน 1 ใบ',
    'sl-h5': 'ตำแหน่ง',
    'sl-th-fin': 'จบอันดับ', 'sl-th-title': 'ตำแหน่ง',
    'sl-td-1f': '1',       'sl-td-1t': '<strong>ประธานาธิบดี</strong> 👑',
    'sl-td-2f': '2',       'sl-td-2t': 'รองประธานาธิบดี',
    'sl-td-mf': 'กลาง',   'sl-td-mt': 'พลเมือง',
    'sl-td-2lf':'รองสุดท้าย','sl-td-2lt':'รองทาส',
    'sl-td-lf': 'สุดท้าย', 'sl-td-lt': '<strong>ทาส</strong>',
    // Dummy
    'dm-goal': 'วางไพ่ทั้งหมดในกลุ่มที่ถูกต้องก่อนใคร ได้คะแนนจากไพ่ที่วาง เสียคะแนนจากไพ่ที่เหลือในมือ คะแนนสูงสุดหลังจบทุกรอบชนะ',
    'dm-h1': 'กลุ่มไพ่ที่ถูกต้อง',
    'dm-li1': '<strong>เซ็ต:</strong> ไพ่ 3–4 ใบแต้มเดียวกัน ดอกอะไรก็ได้ (เช่น 7♠ 7♥ 7♦)',
    'dm-li2': '<strong>รัน:</strong> ไพ่ 3+ ใบเรียงกัน<strong>ดอกเดียวกัน</strong> A สูงเท่านั้น (เช่น Q♦ K♦ A♦ ✅ · A♥ 2♥ 3♥ ❌)',
    'dm-h2': 'ตาของคุณ (ตามลำดับ)',
    'dm-s1': '<span class="ht-step-title">จั่ว (จำเป็น)</span> — จากกองสต็อกหรือไพ่ทิ้งที่ต้องการ <strong>การวางครั้งแรก</strong>ต้องใช้ไพ่ที่หยิบจากกองทิ้ง',
    'dm-s2': '<span class="ht-step-title">วางกลุ่ม (ไม่บังคับ)</span> — วางกลุ่มไพ่ที่ถูกต้องจากมือลงบนโต๊ะ',
    'dm-s3': '<span class="ht-step-title">ฝาก (ไม่บังคับ)</span> — เพิ่มไพ่ต่อกลุ่มที่มีอยู่ ทำได้หลังจากเปิดแล้วเท่านั้น',
    'dm-s4': '<span class="ht-step-title">ทิ้ง (จำเป็น)</span> — เว้นแต่มือจะหมด (คุณชนะ!)',
    'dm-h3': 'โทษและรางวัล',
    'dm-th-rule': 'กฎ', 'dm-th-eff': 'ผล',
    'dm-td1r': 'ฝากพลาด',           'dm-td1e': '−50 แต้ม ถ้าทิ้งไพ่ที่ฝากต่อกลุ่มได้ (หลังเปิดแล้วเท่านั้น)',
    'dm-td2r': 'น็อคมืด',           'dm-td2e': 'ไม่เคยหยิบจากกองทิ้ง? โทษไพ่ในมือคนอื่น ×2 (หรือ ×4 ถ้ากลุ่มดอกเดียว)',
    'dm-td3r': 'ดัมมี่ (ไม่เคยเปิด)','dm-td3e': 'โทษไพ่ในมือ ×2',
    'dm-td4r': 'ไพ่เปิดอยู่ในมือ',   'dm-td4e': '−50 แต้ม',
    'dm-td5r': '2♣ หรือ Q♠ อยู่ในมือ','dm-td5e': '−50 แต้มต่อใบ',
    'dm-td6r': 'ป้อนไพ่',            'dm-td6e': '−50 แต้ม ถ้าคนถัดไปนำไพ่ที่เพิ่งทิ้งไปวางกลุ่ม',
    // Doraemon
    'dr-goal': 'ไม่มีผู้ชนะตายตัว — เกมสังสรรค์ดื่มสังสรรค์ จั่วไพ่ตามเข็มนาฬิกาและทำตามผล <strong>ห้ามชี้ด้วยนิ้ว!</strong> (โดราเอมอนไม่มีมือ) ใครชี้ดื่ม 1 แก้ว',
    'dr-h1': 'ผลของไพ่',
    'dr-th-card': 'ไพ่', 'dr-th-eff': 'ผล',
    'dr-td-a':  'คุณดื่ม 1 คู่หู (ถ้ามี) ดื่มด้วย 1',
    'dr-td-2':  'คุณดื่ม 2 คู่หูดื่ม 2',
    'dr-td-3':  'คุณดื่ม 3 คู่หูดื่ม 3',
    'dr-td-4':  'คุณดื่ม 4 คู่หูดื่ม 4',
    'dr-td-5':  'เลือก<strong>คู่หู</strong> — แบ่งโทษกันจนกว่าจะมีคนจั่ว 5 ใหม่',
    'dr-td-6':  '<strong>เกมหมวดหมู่:</strong> บอกหมวดหมู่ ผู้เล่นพูดสิ่งในหมวดตามเข็มนาฬิกา คนแรกที่ตอบไม่ได้ดื่ม 1',
    'dr-td-7':  '<strong>เกมเลข 7:</strong> นับขึ้น บอก "buzz" สำหรับเลขคูณ 7 หรือมีเลข 7 พลาด = ดื่ม 1',
    'dr-td-8':  'ได้<strong>บัตรเข้าห้องน้ำ</strong> ใช้ได้ตอนไหนก็ได้เพื่อข้ามโทษดื่ม 1 ครั้ง',
    'dr-td-9':  'ผู้เล่นทาง<strong>ซ้าย</strong>ดื่ม 1 (+ คู่หู)',
    'dr-td-10': 'ผู้เล่นทาง<strong>ขวา</strong>ดื่ม 1 (+ คู่หู)',
    'dr-td-j':  'ได้<strong>อำนาจท่าทาง</strong> ทำท่าท้าทายได้ทุกเมื่อ — คนสุดท้ายที่เลียนแบบดื่ม 1 โอนเมื่อจั่ว J ใหม่',
    'dr-td-q':  'คุณถูก<strong>ปิดปาก</strong> ใครพูดกับคุณโดยตรงดื่ม 1 โอนเมื่อจั่ว Q ใหม่',
    'dr-td-k':  'สร้าง<strong>กฎกลุ่ม</strong>ผ่าน 4 ราชา: K1=อะไร, K2=ที่ไหน, K3=นานแค่ไหน, K4=กฎเปิดใช้งานตลอดเกม',
    'dr-tip': '🍺 ดื่มอย่างรับผิดชอบเฉพาะผู้ใหญ่ที่ยินยอม เกมจบเมื่อไพ่หมดกอง — แสดงสรุปจำนวนดื่มของทุกคน',
    // Bluff
    'bl-goal': 'คนแรกที่ทิ้งไพ่หมดมือชนะ วางไพ่คว่ำอ้างว่าเป็นแต้มที่กำหนด — แม้จะไม่ใช่ก็ตาม ผู้เล่นถัดไปเลือกเล่นต่อหรือร้อง <strong>"บลัฟ!"</strong>',
    'bl-h1': 'วงจรแต้ม',
    'bl-rank-note': 'หลังจากมีการท้า แต้มจะรีเซ็ตเป็น A',
    'bl-h2': 'ตาของคุณ — สองทางเลือก',
    'bl-play': '<span class="ht-step-title">วางไพ่</span> — เลือกไพ่ 1–4 ใบวางคว่ำ อ้างว่าเป็นแต้มที่กำหนดทั้งหมด <strong>บลัฟได้</strong> — ลงไพ่อะไรก็ได้ แต้มขยับไปใบถัดไปหลังจากลง',
    'bl-chal': '<span class="ht-step-title">ร้อง "บลัฟ!"</span> — ท้าการอ้างของผู้เล่นก่อนหน้า เปิดไพ่:<br>• ไพ่ทุกใบตรงกับแต้มที่อ้าง → <strong>ผู้ท้า</strong>รับกอง<br>• มีใบที่ไม่ตรง → <strong>ผู้บลัฟ</strong>รับกอง',
    'bl-h3': 'กฎสำคัญ',
    'bl-li1': 'เฉพาะ<strong>ผู้เล่นปัจจุบัน</strong>เท่านั้นที่กระทำได้ — ไม่สามารถท้าในตาคนอื่น',
    'bl-li2': '<strong>ไม่สามารถท้าการเล่นของตัวเอง</strong>',
    'bl-li3': 'ลงไพ่<strong>ใบสุดท้ายชนะทันที</strong> — ไม่มีช่วงท้า',
    'bl-li4': 'ไพ่ในกองซ่อนอยู่จนกว่าการท้าจะเปิดเผยการเล่นล่าสุด',
    'bl-tip': '<strong>กลยุทธ์:</strong> ติดตามว่าแต้มแต่ละแต้มถูกอ้างไปกี่ครั้ง ถ้าใครอ้างว่ามี A 4 ใบหลัง A ปรากฏไป 3 ครั้งแล้ว แทบแน่นอนว่าบลัฟ ท้าเร็วสำหรับกองเล็ก หรือรอและเสี่ยงกองใหญ่',
  },
}

// ── Language ──────────────────────────────────────────────────
function applyLang(l) {
  currentLang = l
  localStorage.setItem(LANG_KEY, l)
  document.querySelectorAll('[data-i18n]').forEach(el => {
    const t = T[l][el.dataset.i18n]
    if (t !== undefined) el.innerHTML = t
  })
  document.getElementById('btn-lang-en').classList.toggle('active', l === 'en')
  document.getElementById('btn-lang-th').classList.toggle('active', l === 'th')
}

// ── Card images ───────────────────────────────────────────────
function buildCardHands() {
  document.querySelectorAll('[data-cards]').forEach(td => {
    const hand = document.createElement('div')
    hand.className = 'ht-hand'
    td.dataset.cards.split(',').forEach(card => {
      const img = document.createElement('img')
      img.className = 'ht-mini-card'
      img.src = `${CARD_BASE}/${card}.svg`
      img.alt = card
      img.onerror = () => { img.style.display = 'none' }
      hand.appendChild(img)
    })
    td.textContent = ''
    td.appendChild(hand)
  })
}

function dealCards(card) {
  card.querySelectorAll('.ht-mini-card').forEach((img, j) => {
    img.classList.remove('ht-deal')
    void img.offsetWidth
    img.style.animationDelay = `${j * 55}ms`
    img.classList.add('ht-deal')
  })
}

// ── Init ──────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  buildCardHands()
  applyLang(currentLang)

  document.getElementById('btn-lang-en').addEventListener('click', () => applyLang('en'))
  document.getElementById('btn-lang-th').addEventListener('click', () => applyLang('th'))

  // Accordion
  document.querySelectorAll('.ht-card-header').forEach(btn => {
    btn.addEventListener('click', () => {
      const card = btn.closest('.ht-card')
      const wasOpen = card.classList.contains('open')
      document.querySelectorAll('.ht-card.open').forEach(c => {
        c.classList.remove('open')
        c.querySelector('.ht-card-header').setAttribute('aria-expanded', 'false')
      })
      if (!wasOpen) {
        card.classList.add('open')
        btn.setAttribute('aria-expanded', 'true')
        setTimeout(() => {
          card.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
          dealCards(card)
        }, 60)
      }
    })
  })

  // Quick-jump pills
  document.querySelectorAll('[data-jump]').forEach(pill => {
    pill.addEventListener('click', () => {
      const card = document.querySelector(`.ht-card[data-game="${pill.dataset.jump}"]`)
      if (!card) return
      document.querySelectorAll('.ht-pill').forEach(p => p.classList.remove('active'))
      pill.classList.add('active')
      if (!card.classList.contains('open')) {
        card.querySelector('.ht-card-header')?.click()
      } else {
        card.scrollIntoView({ behavior: 'smooth', block: 'start' })
      }
    })
  })
})
