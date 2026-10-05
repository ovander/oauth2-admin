<template>
  <div class="space-y-5" data-testid="token-settings">
    <!-- Audiences -->
    <div>
      <label for="ts-audiences" class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
        Audiences <span class="text-gray-400 font-normal">(optional)</span>
      </label>
      <InputText
        id="ts-audiences"
        v-model="audiences"
        placeholder="lakebridge-console"
        class="w-full font-mono"
        :disabled="disabled"
        data-testid="ts-audiences"
      />
      <small class="block text-gray-500 dark:text-brand-400 text-xs mt-1">
        Resource identifiers added to the token's <code>aud</code> after the client ID, when Socrate runs with
        <code>AUDIENCE_MODE=dual</code>. Separate several with spaces or commas.
      </small>
    </div>

    <!-- Allowed scopes -->
    <div>
      <label for="ts-scopes" class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
        Allowed scopes <span class="text-gray-400 font-normal">(optional)</span>
      </label>
      <InputText
        id="ts-scopes"
        v-model="scopes"
        placeholder="openid email profile"
        class="w-full font-mono"
        :class="{ 'p-invalid': scopesError }"
        :disabled="disabled"
        data-testid="ts-scopes"
      />
      <small v-if="scopesError" class="block text-error-600 text-xs mt-1" data-testid="ts-scopes-error">{{ scopesError }}</small>
      <small class="block text-gray-500 dark:text-brand-400 text-xs mt-1">
        The only scopes this client may request (supported: {{ SUPPORTED_SCOPES.join(', ') }}).
        Empty means unrestricted. Applied according to Socrate's <code>SCOPE_POLICY_MODE</code>.
      </small>
    </div>

    <!-- Claim mappings -->
    <div>
      <span class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
        Custom claims <span class="text-gray-400 font-normal">(optional)</span>
      </span>
      <div class="space-y-2">
        <div v-for="(row, index) in claims" :key="index" class="space-y-1" data-testid="ts-claim-row">
          <div class="flex flex-wrap gap-2">
            <InputText
              v-model="row.name"
              placeholder="tenant_id"
              class="w-40 font-mono"
              aria-label="Claim name"
              :disabled="disabled"
              data-testid="ts-claim-name"
            />
            <InputText
              v-model="row.source"
              placeholder="user.attributes.tenant_id"
              class="flex-1 min-w-48 font-mono"
              aria-label="Source"
              :disabled="disabled"
              data-testid="ts-claim-source"
            />
            <Select
              v-model="row.target"
              :options="TARGETS"
              option-label="label"
              option-value="value"
              class="w-44"
              aria-label="Written to"
              :disabled="disabled"
            />
            <Button
              icon="pi pi-trash"
              severity="danger"
              outlined
              aria-label="Remove claim"
              :disabled="disabled"
              @click="removeClaim(index)"
            />
          </div>
          <small v-if="claimErrors[index]" class="block text-error-600 text-xs" data-testid="ts-claim-error">{{ claimErrors[index] }}</small>
        </div>
        <Button
          label="Add claim"
          icon="pi pi-plus"
          severity="secondary"
          outlined
          size="small"
          :disabled="disabled"
          data-testid="ts-add-claim"
          @click="addClaim"
        />
      </div>
      <small class="block text-gray-500 dark:text-brand-400 text-xs mt-1">
        Issued under Socrate's claims namespace: a claim named <code>tenant_id</code> reaches the token as
        <code>https://socrate/tenant_id</code> (with the default <code>CLAIMS_NAMESPACE</code>). Sources:
        <code>user.attributes.&lt;name&gt;</code>, {{ FIXED_SOURCES.join(', ') }}, or <code>literal:&lt;value&gt;</code>.
      </small>
    </div>

    <!-- Access-token lifetime -->
    <div>
      <label for="ts-ttl" class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
        Access-token lifetime <span class="text-gray-400 font-normal">(seconds, optional)</span>
      </label>
      <InputNumber
        v-model="ttl"
        input-id="ts-ttl"
        :min="TTL_MIN"
        :max="TTL_MAX"
        :use-grouping="false"
        placeholder="server default"
        class="w-48"
        :disabled="disabled"
        data-testid="ts-ttl"
      />
      <small class="block text-gray-500 dark:text-brand-400 text-xs mt-1">
        Shortens this client's access tokens ({{ TTL_MIN }} to {{ TTL_MAX }}). It can only shorten: Socrate's
        <code>ACCESS_TOKEN_TTL</code> stays the maximum. Empty uses the server default.
      </small>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import Button from 'primevue/button'
import InputNumber from 'primevue/inputnumber'
import InputText from 'primevue/inputtext'
import Select from 'primevue/select'
import {
  FIXED_SOURCES,
  SUPPORTED_SCOPES,
  TTL_MAX,
  TTL_MIN,
  parseList,
  rowsToMappings,
  unsupportedScopes,
  type ClaimRow,
} from '@/utils/tokenSettings'

// The parent owns the values and builds the request from them (see
// utils/tokenSettings); this component only edits them.
const audiences = defineModel<string>('audiences', { required: true })
const scopes = defineModel<string>('scopes', { required: true })
const claims = defineModel<ClaimRow[]>('claims', { required: true })
const ttl = defineModel<number | null>('ttl', { required: true })

defineProps<{ disabled?: boolean }>()

const TARGETS = [
  { label: 'Access token', value: 'access' },
  { label: 'ID token', value: 'id' },
  { label: 'Both tokens', value: 'both' },
]

const scopesError = computed(() => {
  const bad = unsupportedScopes(parseList(scopes.value))
  return bad.length ? `Not supported by Socrate: ${bad.join(', ')}` : ''
})

const claimErrors = computed(() => rowsToMappings(claims.value).errors)

function addClaim() {
  claims.value.push({ name: '', source: '', target: 'access' })
}

function removeClaim(index: number) {
  claims.value.splice(index, 1)
}
</script>
