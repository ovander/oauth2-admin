import { ref } from 'vue'
import { useToast } from './useToast'

export function useClipboard() {
  const toast   = useToast()
  const copied  = ref(false)
  const copyTimeout = ref<ReturnType<typeof setTimeout> | null>(null)

  async function copy(text: string, successMessage = 'Copied to clipboard'): Promise<boolean> {
    // Clipboard API is available in all modern browsers.
    // The deprecated document.execCommand fallback has been removed (F-20).
    if (!navigator.clipboard) {
      toast.error('Clipboard access is not available in this browser or context')
      return false
    }

    try {
      await navigator.clipboard.writeText(text)

      copied.value = true
      toast.success(successMessage)

      if (copyTimeout.value) clearTimeout(copyTimeout.value)
      copyTimeout.value = setTimeout(() => { copied.value = false }, 2_000)

      return true
    } catch {
      toast.error('Failed to copy to clipboard. Please copy manually.')
      return false
    }
  }

  return { copied, copy }
}
