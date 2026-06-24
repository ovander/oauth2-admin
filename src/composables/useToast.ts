import { useToast as usePrimeToast } from 'primevue/usetoast'

export function useToast() {
  const toast = usePrimeToast()

  function showSuccess(summary: string, detail?: string, life: number = 3000) {
    toast.add({
      severity: 'success',
      summary,
      detail,
      life
    })
  }

  function showError(summary: string, detail?: string, life: number = 5000) {
    toast.add({
      severity: 'error',
      summary,
      detail,
      life
    })
  }

  function showWarn(summary: string, detail?: string, life: number = 4000) {
    toast.add({
      severity: 'warn',
      summary,
      detail,
      life
    })
  }

  function showInfo(summary: string, detail?: string, life: number = 3000) {
    toast.add({
      severity: 'info',
      summary,
      detail,
      life
    })
  }

  return {
    // New naming convention
    showSuccess,
    showError,
    showWarn,
    showInfo,
    // Legacy naming
    success: showSuccess,
    error: showError,
    warn: showWarn,
    info: showInfo,
    // Raw access
    add: toast.add
  }
}
