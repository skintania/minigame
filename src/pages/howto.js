const theme = localStorage.getItem('sk_theme')
if (theme) document.documentElement.dataset.theme = theme

const CARD_BASE = `${localStorage.getItem('sk_url') || 'https://minigame-skintania-api.skintania143.workers.dev'}/assets/cards/standard-deck`

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

document.addEventListener('DOMContentLoaded', () => {
  buildCardHands()

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
