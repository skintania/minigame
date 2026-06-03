const theme = localStorage.getItem('sk_theme')
if (theme) document.documentElement.dataset.theme = theme

document.addEventListener('DOMContentLoaded', () => {
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
        setTimeout(() => card.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 60)
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
