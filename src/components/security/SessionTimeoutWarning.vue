<template>
  <Dialog
    :visible="modelValue"
    :modal="true"
    :closable="false"
    header="Session Expiring Soon"
    :style="{ width: '420px' }"
  >
    <div class="flex items-start gap-4">
      <div class="w-12 h-12 rounded-full bg-warning-100 dark:bg-warning-900/30 flex items-center justify-center shrink-0">
        <i class="pi pi-clock text-2xl text-warning-600"></i>
      </div>
      <div>
        <p class="text-gray-700 dark:text-gray-300">
          You will be automatically signed out due to inactivity in
          <strong class="text-warning-600">{{ secondsLeft }} seconds</strong>.
        </p>
        <p class="text-sm text-gray-500 dark:text-brand-400 mt-2">
          Click "Stay signed in" to continue your session, or sign out now.
        </p>
      </div>
    </div>
    <template #footer>
      <Button
        label="Sign out now"
        severity="secondary"
        outlined
        @click="$emit('logout')"
      />
      <Button
        label="Stay signed in"
        icon="pi pi-check"
        autofocus
        @click="$emit('dismiss')"
      />
    </template>
  </Dialog>
</template>

<script setup lang="ts">
import Dialog from 'primevue/dialog'
import Button from 'primevue/button'

defineProps<{
  modelValue: boolean
  secondsLeft: number
}>()

defineEmits<{
  dismiss: []
  logout:  []
}>()
</script>
