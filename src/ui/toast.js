let _timer

export function showToast(msg, type = 'error', ms = 4500) {
  const el = document.getElementById('toast')
  el.textContent = msg
  el.dataset.type = type
  el.classList.add('show')
  clearTimeout(_timer)
  _timer = setTimeout(() => el.classList.remove('show'), ms)
}
