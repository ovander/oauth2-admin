import { useConfirm } from 'primevue/useconfirm'

export function useConfirmDialog() {
  const confirm = useConfirm()

  function confirmDelete(options: {
    message?: string
    header?: string
    onConfirm: () => void | Promise<void>
    onCancel?: () => void
  }) {
    confirm.require({
      message: options.message || 'Are you sure you want to delete this item?',
      header: options.header || 'Confirm Delete',
      icon: 'pi pi-exclamation-triangle',
      rejectClass: 'btn-secondary',
      acceptClass: 'btn-danger',
      rejectLabel: 'Cancel',
      acceptLabel: 'Delete',
      accept: options.onConfirm,
      reject: options.onCancel
    })
  }

  function confirmAction(options: {
    message: string
    header?: string
    icon?: string
    acceptLabel?: string
    rejectLabel?: string
    acceptClass?: string
    onConfirm: () => void | Promise<void>
    onCancel?: () => void
  }) {
    confirm.require({
      message: options.message,
      header: options.header || 'Confirm',
      icon: options.icon || 'pi pi-question-circle',
      rejectClass: 'btn-secondary',
      acceptClass: options.acceptClass || 'btn-primary',
      rejectLabel: options.rejectLabel || 'Cancel',
      acceptLabel: options.acceptLabel || 'Confirm',
      accept: options.onConfirm,
      reject: options.onCancel
    })
  }

  function confirmDanger(options: {
    message: string
    header?: string
    acceptLabel?: string
    onConfirm: () => void | Promise<void>
    onCancel?: () => void
  }) {
    confirm.require({
      message: options.message,
      header: options.header || 'Warning',
      icon: 'pi pi-exclamation-triangle',
      rejectClass: 'btn-secondary',
      acceptClass: 'btn-danger',
      rejectLabel: 'Cancel',
      acceptLabel: options.acceptLabel || 'Continue',
      accept: options.onConfirm,
      reject: options.onCancel
    })
  }

  return {
    confirmDelete,
    confirmAction,
    confirmDanger,
    require: confirm.require
  }
}
