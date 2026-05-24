import { writable } from 'svelte/store'

const THEME_KEY = 'aiusage-theme'

function getStored() {
  if (typeof window === 'undefined') return 'system'
  return localStorage.getItem(THEME_KEY) || 'system'
}

function getSystemTheme() {
  if (typeof window === 'undefined') return 'light'
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

export const userPref = writable(getStored())
export const resolvedTheme = writable(getSystemTheme())

export function cycleTheme() {
  userPref.update(current => {
    if (current === 'system') return 'dark'
    if (current === 'dark') return 'light'
    return 'system'
  })
}

export function initTheme() {
  if (typeof window === 'undefined') return

  const mq = window.matchMedia('(prefers-color-scheme: dark)')

  function apply(pref) {
    const theme = pref === 'system' ? getSystemTheme() : pref
    document.documentElement.setAttribute('data-theme', theme)
    resolvedTheme.set(theme)
  }

  apply(getStored())

  userPref.subscribe(pref => {
    localStorage.setItem(THEME_KEY, pref)
    apply(pref)
  })

  mq.addEventListener('change', () => {
    const pref = getStored()
    if (pref === 'system') {
      apply('system')
    }
  })
}
