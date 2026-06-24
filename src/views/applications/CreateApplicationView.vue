<template>
  <div class="max-w-2xl mx-auto">
    <!-- Header -->
    <PageHeader
      title="Create Application"
      subtitle="Register a new OAuth2 application"
    >
      <template #actions>
        <Button
          label="Back to Apps"
          icon="pi pi-arrow-left"
          severity="secondary"
          outlined
          @click="$router.push({ name: 'Applications' })"
        />
      </template>
    </PageHeader>

    <!-- Success: Show Credentials -->
    <div v-if="createdApp" class="space-y-6">
      <!-- Success Banner -->
      <div class="card p-6 bg-success-50 dark:bg-success-900/20 border-success-200 dark:border-success-800">
        <div class="flex items-start gap-4">
          <div class="w-12 h-12 rounded-full bg-success-100 dark:bg-success-900/40 flex items-center justify-center shrink-0">
            <i class="pi pi-check-circle text-2xl text-success-600"></i>
          </div>
          <div>
            <h3 class="text-lg font-semibold text-success-800 dark:text-success-200">Application Created Successfully!</h3>
            <p class="text-success-700 dark:text-success-300 mt-1">
              Your OAuth2 application "{{ createdApp.name }}" has been created.
            </p>
          </div>
        </div>
      </div>

      <!-- Credentials Card -->
      <div class="card p-6">
        <div class="flex items-center gap-2 mb-4">
          <i class="pi pi-key text-warning-500"></i>
          <h3 class="text-lg font-semibold text-gray-900 dark:text-white">Application Credentials</h3>
        </div>

        <!-- Warning — confidential clients only -->
        <div v-if="!createdApp.is_public" class="p-4 bg-warning-50 dark:bg-warning-900/20 border border-warning-200 dark:border-warning-800 rounded-lg mb-6">
          <div class="flex items-start gap-3">
            <i class="pi pi-exclamation-triangle text-warning-600 mt-0.5"></i>
            <div class="text-sm">
              <p class="font-semibold text-warning-800 dark:text-warning-200">Important: Save your Client Secret!</p>
              <p class="text-warning-700 dark:text-warning-300 mt-1">
                The client secret is only shown once. Copy and store it securely now — you won't be able to see it again.
              </p>
            </div>
          </div>
        </div>

        <!-- Public-client notice -->
        <div v-else class="p-4 bg-brand-50 dark:bg-brand-900/20 border border-brand-200 dark:border-brand-800 rounded-lg mb-6">
          <div class="flex items-start gap-3">
            <i class="pi pi-shield text-brand-600 dark:text-brand-400 mt-0.5"></i>
            <div class="text-sm">
              <p class="font-semibold text-brand-800 dark:text-brand-200">Public client — PKCE only, no secret</p>
              <p class="text-brand-700 dark:text-brand-300 mt-1">
                This app has no client secret. Use a <strong>code_verifier / code_challenge</strong> pair on every authorization request (RFC 7636).
              </p>
            </div>
          </div>
        </div>

        <!-- Client ID -->
        <div class="mb-4">
          <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Client ID</label>
          <div class="flex gap-2">
            <InputText
              :modelValue="createdApp.client_id"
              readonly
              class="flex-1 font-mono text-sm"
            />
            <Button
              icon="pi pi-copy"
              severity="secondary"
              outlined
              @click="copyToClipboard(createdApp.client_id, 'Client ID')"
              v-tooltip="'Copy Client ID'"
            />
          </div>
        </div>

        <!-- Client Secret — confidential clients only -->
        <div v-if="!createdApp.is_public" class="mb-6">
          <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Client Secret</label>
          <div class="flex gap-2">
            <InputText
              :modelValue="showSecret ? createdApp.client_secret : '••••••••••••••••••••••••••••••••'"
              readonly
              class="flex-1 font-mono text-sm"
              :class="{ 'text-warning-600': showSecret }"
            />
            <Button
              :icon="showSecret ? 'pi pi-eye-slash' : 'pi pi-eye'"
              severity="secondary"
              outlined
              @click="showSecret = !showSecret"
              v-tooltip="showSecret ? 'Hide' : 'Reveal'"
            />
            <Button
              icon="pi pi-copy"
              severity="warning"
              @click="copyToClipboard(createdApp.client_secret, 'Client Secret')"
              v-tooltip="'Copy Client Secret'"
            />
          </div>
        </div>

        <!-- Actions -->
        <div class="flex gap-3">
          <Button
            v-if="!createdApp.is_public"
            label="Copy Both"
            icon="pi pi-copy"
            severity="secondary"
            @click="copyCredentials"
          />
          <Button
            label="Go to Application"
            icon="pi pi-arrow-right"
            iconPos="right"
            @click="$router.push({ name: 'ApplicationDetail', params: { id: createdApp.id } })"
          />
        </div>
      </div>

      <!-- Next Steps -->
      <div class="card p-6">
        <h3 class="text-lg font-semibold text-gray-900 dark:text-white mb-4">Next Steps</h3>
        <!-- Confidential client steps -->
        <ol v-if="!createdApp.is_public" class="space-y-3 text-sm text-gray-600 dark:text-brand-300">
          <li class="flex items-start gap-3">
            <span class="w-6 h-6 rounded-full bg-brand-100 dark:bg-brand-800 text-brand-600 dark:text-brand-400 flex items-center justify-center text-xs font-bold shrink-0">1</span>
            <span>Store the client secret in your application's secure configuration</span>
          </li>
          <li class="flex items-start gap-3">
            <span class="w-6 h-6 rounded-full bg-brand-100 dark:bg-brand-800 text-brand-600 dark:text-brand-400 flex items-center justify-center text-xs font-bold shrink-0">2</span>
            <span>Configure your OAuth2 client library with the client ID and secret</span>
          </li>
          <li class="flex items-start gap-3">
            <span class="w-6 h-6 rounded-full bg-brand-100 dark:bg-brand-800 text-brand-600 dark:text-brand-400 flex items-center justify-center text-xs font-bold shrink-0">3</span>
            <span>Add users to the application to grant them access</span>
          </li>
        </ol>
        <!-- Public client steps -->
        <ol v-else class="space-y-3 text-sm text-gray-600 dark:text-brand-300">
          <li class="flex items-start gap-3">
            <span class="w-6 h-6 rounded-full bg-brand-100 dark:bg-brand-800 text-brand-600 dark:text-brand-400 flex items-center justify-center text-xs font-bold shrink-0">1</span>
            <span>Configure your app with the client ID above — no secret needed</span>
          </li>
          <li class="flex items-start gap-3">
            <span class="w-6 h-6 rounded-full bg-brand-100 dark:bg-brand-800 text-brand-600 dark:text-brand-400 flex items-center justify-center text-xs font-bold shrink-0">2</span>
            <span>Generate a <strong>code_verifier</strong> and <strong>code_challenge</strong> on every authorization request (RFC 7636 PKCE)</span>
          </li>
          <li class="flex items-start gap-3">
            <span class="w-6 h-6 rounded-full bg-brand-100 dark:bg-brand-800 text-brand-600 dark:text-brand-400 flex items-center justify-center text-xs font-bold shrink-0">3</span>
            <span>Add users to the application to grant them access</span>
          </li>
        </ol>
      </div>
    </div>

    <!-- Form -->
    <div v-else class="card p-6">
      <form @submit.prevent="handleSubmit" class="space-y-6">
        <!-- App Name -->
        <div>
          <label for="name" class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Application Name <span class="text-error-500">*</span>
          </label>
          <InputText
            id="name"
            v-model="form.name"
            placeholder="My Application"
            class="w-full"
            :class="{ 'p-invalid': errors.name }"
            :disabled="submitting"
          />
          <small v-if="errors.name" class="text-error-600 text-xs mt-1">{{ errors.name }}</small>
        </div>

        <!-- App URL -->
        <div>
          <label for="url" class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Application URL
          </label>
          <InputText
            id="url"
            v-model="form.url"
            placeholder="https://myapp.example.com"
            class="w-full"
            :disabled="submitting"
          />
          <small class="text-gray-500 dark:text-brand-400 text-xs mt-1">
            The public URL of your application (optional)
          </small>
        </div>

        <!-- Redirect URIs -->
        <div>
          <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Redirect URIs
          </label>
          <div class="space-y-2">
            <div
              v-for="(_uri, index) in form.redirect_uris"
              :key="index"
              class="flex gap-2"
            >
              <InputText
                v-model="form.redirect_uris[index]"
                placeholder="https://myapp.example.com/callback"
                class="flex-1"
                :disabled="submitting"
              />
              <Button
                icon="pi pi-trash"
                severity="danger"
                outlined
                @click="removeRedirectUri(index)"
                :disabled="submitting"
                v-tooltip="'Remove'"
              />
            </div>
            <Button
              label="Add Redirect URI"
              icon="pi pi-plus"
              severity="secondary"
              outlined
              size="small"
              @click="addRedirectUri"
              :disabled="submitting"
            />
          </div>
          <small class="text-gray-500 dark:text-brand-400 text-xs mt-1">
            Allowed callback URLs for OAuth2 authorization
          </small>
        </div>

        <!-- Public Client -->
        <div class="flex items-start gap-3">
          <Checkbox v-model="form.is_public" inputId="is_public" :binary="true" :disabled="submitting" />
          <label for="is_public" class="text-sm text-gray-700 dark:text-gray-300 cursor-pointer leading-5">
            <span class="font-medium">Public client</span>
            <span class="text-gray-500 dark:text-brand-400"> — SPA / mobile app, authenticates via PKCE, no client secret</span>
          </label>
        </div>

        <!-- PKCE info banner (shown when is_public is checked) -->
        <div v-if="form.is_public" class="p-4 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg">
          <div class="flex items-start gap-3">
            <i class="pi pi-info-circle text-amber-600 dark:text-amber-400 mt-0.5 shrink-0"></i>
            <p class="text-sm text-amber-800 dark:text-amber-200">
              Public clients do not have a client secret. The token endpoint must be called with a valid
              <strong>PKCE code_verifier</strong>. Make sure your app supports the PKCE flow
              (<a href="https://www.rfc-editor.org/rfc/rfc7636" target="_blank" rel="noopener noreferrer" class="underline">RFC 7636</a>).
            </p>
          </div>
        </div>

        <!-- Error Message -->
        <Message v-if="error" severity="error" :closable="false" class="w-full">
          {{ error }}
        </Message>

        <!-- Actions -->
        <div class="flex gap-3 pt-4 border-t border-gray-100 dark:border-brand-800">
          <Button
            type="button"
            label="Cancel"
            severity="secondary"
            outlined
            @click="$router.push({ name: 'Applications' })"
            :disabled="submitting"
          />
          <Button
            type="submit"
            label="Create Application"
            icon="pi pi-check"
            :loading="submitting"
          />
        </div>
      </form>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive } from 'vue'
import Button from 'primevue/button'
import Checkbox from 'primevue/checkbox'
import InputText from 'primevue/inputtext'
import Message from 'primevue/message'
import PageHeader from '@/components/ui/PageHeader.vue'
import { useToast } from '@/composables/useToast'
import { createApp } from '@/services/applicationService'
import type { AppWithSecret } from '@/types/application'

const { showSuccess, showError } = useToast()

// State
const submitting = ref(false)
const error = ref('')
const createdApp = ref<AppWithSecret | null>(null)
const showSecret = ref(false)

const form = reactive({
  name: '',
  url: '',
  redirect_uris: [''],
  is_public: false
})

const errors = reactive({
  name: ''
})

// Methods
function validate(): boolean {
  errors.name = ''

  if (!form.name.trim()) {
    errors.name = 'Application name is required'
    return false
  }

  return true
}

function addRedirectUri() {
  form.redirect_uris.push('')
}

function removeRedirectUri(index: number) {
  form.redirect_uris.splice(index, 1)
  if (form.redirect_uris.length === 0) {
    form.redirect_uris.push('')
  }
}

async function handleSubmit() {
  if (!validate()) return

  error.value = ''
  submitting.value = true

  try {
    // Filter out empty redirect URIs
    const redirectUris = form.redirect_uris.filter(uri => uri.trim())

    const app = await createApp({
      name: form.name.trim(),
      url: form.url.trim() || undefined,
      redirect_uris: redirectUris.length > 0 ? redirectUris : undefined,
      is_public: form.is_public || undefined   // omit when false (server default)
    })

    createdApp.value = app
    showSuccess('Application created successfully')
  } catch (err: any) {
    error.value = err.response?.data?.message || err.response?.data?.error || 'Failed to create application'
    showError(error.value)
  } finally {
    submitting.value = false
  }
}

function copyToClipboard(text: string, label: string) {
  navigator.clipboard.writeText(text)
  showSuccess(`${label} copied to clipboard`)
}

function copyCredentials() {
  if (!createdApp.value) return
  
  const credentials = `Client ID: ${createdApp.value.client_id}\nClient Secret: ${createdApp.value.client_secret}`
  navigator.clipboard.writeText(credentials)
  showSuccess('Credentials copied to clipboard')
}
</script>
