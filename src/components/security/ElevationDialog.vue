<template>
  <Dialog
    :visible="elevationVisible"
    modal
    :closable="false"
    :draggable="false"
    header="Confirm it's you"
    class="w-full max-w-md"
    @update:visible="onVisibility"
  >
    <p class="text-sm text-gray-500 dark:text-brand-400 mb-4">
      This is a sensitive action. Re-enter your password to continue — your
      confirmation is valid for a few minutes.
    </p>

    <form class="space-y-4" @submit.prevent="submit">
      <div>
        <label for="elevate-password" class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
          Password
        </label>
        <Password
          id="elevate-password"
          v-model="password"
          placeholder="••••••••"
          toggleMask
          :feedback="false"
          class="w-full"
          inputClass="w-full"
          :disabled="elevationLoading"
          autocomplete="current-password"
        />
      </div>

      <div v-if="elevationMfaRequired">
        <label for="elevate-mfa" class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
          Authentication code
        </label>
        <InputText
          id="elevate-mfa"
          v-model="mfaCode"
          placeholder="000000"
          class="w-full text-center tracking-widest font-mono"
          maxlength="6"
          inputmode="numeric"
          autocomplete="one-time-code"
          :disabled="elevationLoading"
          @input="onMfaInput"
        />
      </div>

      <Message v-if="elevationError" severity="error" :closable="false" class="w-full">
        {{ elevationError }}
      </Message>
    </form>

    <template #footer>
      <Button label="Cancel" text :disabled="elevationLoading" @click="cancel" />
      <Button
        label="Confirm"
        icon="pi pi-lock-open"
        class="btn-primary"
        :loading="elevationLoading"
        :disabled="!canSubmit"
        @click="submit"
      />
    </template>
  </Dialog>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import Dialog from 'primevue/dialog'
import Password from 'primevue/password'
import InputText from 'primevue/inputtext'
import Button from 'primevue/button'
import Message from 'primevue/message'
import {
  elevationVisible,
  elevationLoading,
  elevationError,
  elevationMfaRequired,
  submitElevation,
  cancelElevation,
} from '@/services/adminGuards'

const password = ref('')
const mfaCode  = ref('')

const canSubmit = computed(() =>
  !elevationLoading.value &&
  password.value.length > 0 &&
  (!elevationMfaRequired.value || mfaCode.value.length === 6),
)

// Reset the local fields whenever the prompt is (re)opened or closed.
watch(elevationVisible, (visible) => {
  if (!visible) { password.value = ''; mfaCode.value = '' }
})

function onMfaInput() {
  mfaCode.value = mfaCode.value.replace(/\D/g, '').slice(0, 6)
}

function submit() {
  if (!canSubmit.value) return
  void submitElevation(password.value, elevationMfaRequired.value ? mfaCode.value : undefined)
}

function cancel() {
  cancelElevation()
}

// The dialog is non-closable, but guard the escape/overlay path anyway.
function onVisibility(visible: boolean) {
  if (!visible) cancelElevation()
}
</script>
