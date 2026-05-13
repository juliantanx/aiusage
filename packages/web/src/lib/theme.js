import { writable, derived } from 'svelte/store'

const THEME_KEY = 'aiusage-theme'

function getStored() {
  if (typeof window === 'undefined') return 'system'
  return localStorage.getItem(THEME_KEY) || 'system'
}

function getSystemTheme() {
  if (typeof window === 'undefined') return 'dark'
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

// userPref: 'system' | 'dark' | 'light'
export const userPref = writable(getStored())

// resolved: 'dark' | 'light' (the actual theme applied)
export const resolvedTheme = writable(getSystemTheme())

// Cycle: system -> dark -> light -> system
export function cycleTheme() {
  userPref.update(current => {
    if (current === 'system') return 'dark'
    if (current === 'dark') return 'light'
    return 'system'
  })
}

// Apply theme to DOM and persist
export function initTheme() {
  if (typeof window === 'undefined') return

  const mq = window.matchMedia('(prefers-color-scheme: dark)')

  function apply(pref) {
    const theme = pref === 'system' ? getSystemTheme() : pref
    document.documentElement.setAttribute('data-theme', theme)
    resolvedTheme.set(theme)
  }

  // Initial apply
  apply(getStored())

  // Subscribe to userPref changes
  userPref.subscribe(pref => {
    localStorage.setItem(THEME_KEY, pref)
    apply(pref)
  })

  // Listen for OS theme changes
  mq.addEventListener('change', () => {
    const pref = getStored()
    if (pref === 'system') {
      apply('system')
    }
  })
}
