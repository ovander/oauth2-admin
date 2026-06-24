import { defineStore } from 'pinia'
import { ref, watch } from 'vue'

export const useThemeStore = defineStore('theme', () => {
  // Check system preference and localStorage
  const getInitialTheme = (): boolean => {
    const stored = localStorage.getItem('theme')
    if (stored) {
      return stored === 'dark'
    }
    return window.matchMedia('(prefers-color-scheme: dark)').matches
  }

  const isDark = ref(getInitialTheme())

  // Watch for changes and persist
  watch(isDark, (value) => {
    localStorage.setItem('theme', value ? 'dark' : 'light')
    updateDocumentClass(value)
  }, { immediate: true })

  function updateDocumentClass(dark: boolean) {
    if (dark) {
      document.documentElement.classList.add('dark')
    } else {
      document.documentElement.classList.remove('dark')
    }
  }

  function toggleTheme() {
    isDark.value = !isDark.value
  }

  function setTheme(dark: boolean) {
    isDark.value = dark
  }

  return {
    isDark,
    toggleTheme,
    setTheme
  }
})
