<template>
  <div class="card p-6" data-testid="mfa-card">
    <div class="flex items-center justify-between mb-4">
      <h3 class="text-lg font-semibold text-gray-900 dark:text-white">
        Two-factor authentication
      </h3>
      <StatusBadge
        v-if="status"
        :status="status.enabled ? 'success' : 'neutral'"
        :label="status.enabled ? 'On' : 'Off'"
      />
    </div>

    <p v-if="loading" class="text-sm text-gray-500">Loading…</p>
    <p v-else-if="loadError" class="text-sm text-error-600">{{ loadError }}</p>

    <!-- Recovery codes, shown once after they are generated -->
    <div v-else-if="recoveryCodes.length" class="space-y-3" data-testid="mfa-recovery-codes">
      <p class="text-sm text-gray-700 dark:text-gray-300">
        Save these recovery codes somewhere safe. Each one signs you in once if you lose your
        authenticator; they are not shown again.
      </p>
      <ul class="grid grid-cols-2 gap-2 font-mono text-sm">
        <li v-for="code in recoveryCodes" :key="code" class="px-2 py-1 rounded bg-gray-100 dark:bg-gray-800">
          {{ code }}
        </li>
      </ul>
      <div class="flex gap-2">
        <Button label="Copy" icon="pi pi-copy" severity="secondary" size="small" @click="copy(recoveryCodes.join('\n'))" />
        <Button label="I have saved them" size="small" data-testid="mfa-codes-done" @click="recoveryCodes = []" />
      </div>
    </div>

    <!-- Enrolment in progress -->
    <form v-else-if="enrollment" class="space-y-4" data-testid="mfa-enroll" @submit.prevent="confirm">
      <p class="text-sm text-gray-700 dark:text-gray-300">
        Add this key to your authenticator app (Google Authenticator, 1Password, Authy…), then
        enter the 6-digit code it shows.
      </p>
      <div class="flex items-center gap-2">
        <code class="px-2 py-1 rounded bg-gray-100 dark:bg-gray-800 font-mono text-sm break-all" data-testid="mfa-secret">
          {{ groupedSecret }}
        </code>
        <Button icon="pi pi-copy" severity="secondary" size="small" aria-label="Copy the key" @click="copy(enrollment.secret)" />
      </div>
      <a
        v-if="otpauthLink"
        :href="otpauthLink"
        class="text-sm text-primary-600 hover:underline"
      >Open in an authenticator app on this device</a>
      <div>
        <label for="mfa-code" class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Code</label>
        <InputText
          id="mfa-code"
          v-model="code"
          inputmode="numeric"
          autocomplete="one-time-code"
          maxlength="6"
          class="w-40"
          data-testid="mfa-code"
        />
      </div>
      <div class="flex gap-2">
        <Button type="submit" label="Turn on" :loading="busy" :disabled="code.trim().length !== 6" data-testid="mfa-confirm" />
        <Button label="Cancel" severity="secondary" text :disabled="busy" @click="cancelEnrollment" />
      </div>
    </form>

    <!-- Disabling -->
    <form v-else-if="disabling" class="space-y-4" data-testid="mfa-disable" @submit.prevent="disable">
      <p class="text-sm text-gray-700 dark:text-gray-300">
        Confirm with your password and a current code to turn two-factor authentication off.
      </p>
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label for="mfa-disable-password" class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Password</label>
          <InputText id="mfa-disable-password" v-model="disablePassword" type="password" autocomplete="current-password" class="w-full" />
        </div>
        <div>
          <label for="mfa-disable-code" class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Code or recovery code</label>
          <InputText id="mfa-disable-code" v-model="disableCode" autocomplete="one-time-code" class="w-full" />
        </div>
      </div>
      <div class="flex gap-2">
        <Button type="submit" label="Turn off" severity="danger" :loading="busy" :disabled="!disablePassword || !disableCode.trim()" />
        <Button label="Cancel" severity="secondary" text :disabled="busy" @click="disabling = false" />
      </div>
    </form>

    <!-- Off -->
    <div v-else-if="status && !status.enabled" class="space-y-3">
      <p class="text-sm text-gray-700 dark:text-gray-300">
        Protect your administrator account with a code from an authenticator app at every sign-in.
        Socrate can require it for administrators (<code>ADMIN_MFA_POLICY=enforce</code>).
      </p>
      <Button label="Set up two-factor authentication" icon="pi pi-shield" :loading="busy" data-testid="mfa-start" @click="start" />
    </div>

    <!-- On -->
    <div v-else-if="status" class="space-y-3">
      <p class="text-sm text-gray-700 dark:text-gray-300">
        Sign-in asks for a code from your authenticator app.
        {{ status.recovery_codes_remaining }} recovery code(s) left.
      </p>
      <div class="flex flex-wrap gap-2">
        <Button label="New recovery codes" icon="pi pi-refresh" severity="secondary" size="small" :loading="busy" data-testid="mfa-new-codes" @click="newCodes" />
        <Button label="Turn off" severity="danger" text size="small" @click="disabling = true" />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import InputText from 'primevue/inputtext'
import Button from 'primevue/button'
import StatusBadge from '@/components/ui/StatusBadge.vue'
import { useToast } from '@/composables/useToast'
import { getErrorMessage } from '@/services/api'
import * as mfa from '@/services/mfaService'

const toast = useToast()

const status = ref<mfa.MfaStatus | null>(null)
const loading = ref(true)
const loadError = ref('')
const busy = ref(false)
const enrollment = ref<mfa.MfaEnrollment | null>(null)
const code = ref('')
const recoveryCodes = ref<string[]>([])
const disabling = ref(false)
const disablePassword = ref('')
const disableCode = ref('')

// The secret in groups of four, as authenticator apps display it.
const groupedSecret = computed(() => enrollment.value?.secret.match(/.{1,4}/g)?.join(' ') ?? '')

// Only an otpauth:// URI is ever used as a link target.
const otpauthLink = computed(() => {
  const uri = enrollment.value?.provisioning_uri ?? ''
  return uri.startsWith('otpauth://') ? uri : ''
})

async function load() {
  loading.value = true
  loadError.value = ''
  try {
    status.value = await mfa.getMfaStatus()
  } catch (e) {
    loadError.value = getErrorMessage(e)
  } finally {
    loading.value = false
  }
}

async function start() {
  busy.value = true
  try {
    enrollment.value = await mfa.beginMfaEnrollment()
    code.value = ''
  } catch (e) {
    toast.error('Could not start the setup', getErrorMessage(e))
  } finally {
    busy.value = false
  }
}

async function confirm() {
  busy.value = true
  try {
    await mfa.confirmMfa(code.value.trim())
    enrollment.value = null
    code.value = ''
    toast.success('Two-factor authentication is on')
    // Hand out recovery codes right away: without them a lost phone locks the account.
    recoveryCodes.value = await mfa.generateRecoveryCodes()
    await load()
  } catch (e) {
    toast.error('Code not accepted', getErrorMessage(e))
  } finally {
    busy.value = false
  }
}

function cancelEnrollment() {
  enrollment.value = null
  code.value = ''
}

async function newCodes() {
  busy.value = true
  try {
    recoveryCodes.value = await mfa.generateRecoveryCodes()
    await load()
  } catch (e) {
    toast.error('Could not generate recovery codes', getErrorMessage(e))
  } finally {
    busy.value = false
  }
}

async function disable() {
  busy.value = true
  try {
    await mfa.disableMfa(disablePassword.value, disableCode.value.trim())
    disabling.value = false
    disablePassword.value = ''
    disableCode.value = ''
    toast.success('Two-factor authentication is off')
    await load()
  } catch (e) {
    toast.error('Could not turn it off', getErrorMessage(e))
  } finally {
    busy.value = false
  }
}

async function copy(text: string) {
  try {
    await navigator.clipboard.writeText(text)
    toast.success('Copied')
  } catch {
    toast.error('Copy failed', 'Select the text and copy it manually.')
  }
}

onMounted(load)
</script>
