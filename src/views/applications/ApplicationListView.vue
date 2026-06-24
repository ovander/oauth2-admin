<template>
  <div>
    <!-- Header -->
    <PageHeader
      title="Applications"
      subtitle="Manage all OAuth2 applications"
    >
      <template #actions>
        <Button
          label="New Application"
          icon="pi pi-plus"
          @click="$router.push({ name: 'CreateApplication' })"
        />
      </template>
    </PageHeader>

    <!-- Loading -->
    <LoadingState v-if="loading" message="Loading applications..." />

    <!-- Content -->
    <template v-else>
      <!-- Stats -->
      <div class="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <div class="card p-4">
          <div class="flex items-center gap-3">
            <div class="w-10 h-10 rounded-lg bg-brand-100 dark:bg-brand-800 flex items-center justify-center">
              <i class="pi pi-box text-brand-600 dark:text-brand-400"></i>
            </div>
            <div>
              <p class="text-2xl font-bold text-gray-900 dark:text-white">{{ apps.length }}</p>
              <p class="text-sm text-gray-500 dark:text-brand-400">Total Apps</p>
            </div>
          </div>
        </div>
        <div class="card p-4">
          <div class="flex items-center gap-3">
            <div class="w-10 h-10 rounded-lg bg-success-100 dark:bg-success-900/30 flex items-center justify-center">
              <i class="pi pi-check-circle text-success-600 dark:text-success-400"></i>
            </div>
            <div>
              <p class="text-2xl font-bold text-gray-900 dark:text-white">{{ activeApps }}</p>
              <p class="text-sm text-gray-500 dark:text-brand-400">Active</p>
            </div>
          </div>
        </div>
        <div class="card p-4">
          <div class="flex items-center gap-3">
            <div class="w-10 h-10 rounded-lg bg-warning-100 dark:bg-warning-900/30 flex items-center justify-center">
              <i class="pi pi-pause-circle text-warning-600 dark:text-warning-400"></i>
            </div>
            <div>
              <p class="text-2xl font-bold text-gray-900 dark:text-white">{{ inactiveApps }}</p>
              <p class="text-sm text-gray-500 dark:text-brand-400">Inactive</p>
            </div>
          </div>
        </div>
      </div>

      <!-- Search -->
      <div class="card p-4 mb-6">
        <div class="flex flex-col sm:flex-row gap-4">
          <div class="flex-1">
            <span class="p-input-icon-left w-full">
              <i class="pi pi-search" />
              <InputText
                v-model="searchQuery"
                placeholder="Search applications..."
                class="w-full"
              />
            </span>
          </div>
          <div class="flex gap-2">
            <Select
              v-model="statusFilter"
              :options="statusOptions"
              optionLabel="label"
              optionValue="value"
              placeholder="Status"
              class="w-32"
            />
            <Button
              icon="pi pi-refresh"
              severity="secondary"
              outlined
              @click="loadApps"
              :loading="refreshing"
              v-tooltip="'Refresh'"
            />
          </div>
        </div>
      </div>

      <!-- Apps Grid -->
      <div v-if="filteredApps.length > 0" class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        <div
          v-for="app in filteredApps"
          :key="app.id"
          class="card p-6 hover:shadow-lg transition-shadow cursor-pointer group"
          @click="$router.push({ name: 'ApplicationDetail', params: { id: app.id } })"
        >
          <!-- Header -->
          <div class="flex items-start justify-between mb-4">
            <div class="flex items-center gap-3">
              <div class="w-12 h-12 rounded-xl bg-gradient-to-br from-brand-500 to-brand-700 flex items-center justify-center text-white font-bold text-lg">
                {{ getAppInitials(app.name) }}
              </div>
              <div>
                <h3 class="font-semibold text-gray-900 dark:text-white group-hover:text-brand-600 dark:group-hover:text-brand-400 transition-colors">
                  {{ app.name }}
                </h3>
                <p class="text-xs font-mono text-gray-500 dark:text-brand-400">
                  {{ app.client_id.slice(0, 16) }}...
                </p>
              </div>
            </div>
            <span
              class="px-2 py-1 text-xs font-medium rounded-full"
              :class="app.active 
                ? 'bg-success-100 text-success-700 dark:bg-success-900/30 dark:text-success-400'
                : 'bg-gray-100 text-gray-600 dark:bg-brand-800 dark:text-brand-400'"
            >
              {{ app.active ? 'Active' : 'Inactive' }}
            </span>
          </div>

          <!-- URL -->
          <div v-if="app.url" class="mb-3">
            <p class="text-sm text-gray-600 dark:text-brand-300 truncate flex items-center gap-1">
              <i class="pi pi-link text-xs"></i>
              {{ app.url }}
            </p>
          </div>

          <!-- Redirect URIs count + capability badges -->
          <div class="flex flex-wrap items-center gap-2 text-sm text-gray-500 dark:text-brand-400 mb-4">
            <span class="flex items-center gap-1">
              <i class="pi pi-directions text-xs"></i>
              {{ app.redirect_uris?.length || 0 }} redirect{{ (app.redirect_uris?.length || 0) !== 1 ? 's' : '' }}
            </span>
            <span
              v-if="app.is_public"
              class="px-2 py-0.5 text-xs font-semibold rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400"
            >PUBLIC</span>
            <span
              v-if="app.require_pkce"
              class="px-2 py-0.5 text-xs font-semibold rounded-full bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400"
            >PKCE</span>
          </div>

          <!-- Footer -->
          <div class="pt-4 border-t border-gray-100 dark:border-brand-800 flex items-center justify-between">
            <span class="text-xs text-gray-400 dark:text-brand-500">
              Created {{ formatDate(app.created_at) }}
            </span>
            <i class="pi pi-chevron-right text-gray-300 dark:text-brand-600 group-hover:translate-x-1 transition-transform"></i>
          </div>
        </div>
      </div>

      <!-- Empty State -->
      <EmptyState
        v-else-if="searchQuery || statusFilter !== 'all'"
        icon="pi-search"
        title="No applications found"
        description="Try adjusting your search or filter criteria"
      >
        <Button
          label="Clear Filters"
          severity="secondary"
          outlined
          @click="clearFilters"
        />
      </EmptyState>

      <EmptyState
        v-else
        icon="pi-box"
        title="No applications yet"
        description="Create your first OAuth2 application to get started"
      >
        <Button
          label="Create Application"
          icon="pi pi-plus"
          @click="$router.push({ name: 'CreateApplication' })"
        />
      </EmptyState>
    </template>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import Button from 'primevue/button'
import InputText from 'primevue/inputtext'
import Select from 'primevue/select'
import PageHeader from '@/components/ui/PageHeader.vue'
import LoadingState from '@/components/ui/LoadingState.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import { useToast } from '@/composables/useToast'
import { getApps } from '@/services/applicationService'
import type { App } from '@/types/application'

const { showError } = useToast()

// State
const loading = ref(true)
const refreshing = ref(false)
const apps = ref<App[]>([])
const searchQuery = ref('')
const statusFilter = ref('all')

const statusOptions = [
  { label: 'All', value: 'all' },
  { label: 'Active', value: 'active' },
  { label: 'Inactive', value: 'inactive' }
]

// Computed
const activeApps = computed(() => apps.value.filter(a => a.active).length)
const inactiveApps = computed(() => apps.value.filter(a => !a.active).length)

const filteredApps = computed(() => {
  let result = apps.value

  // Status filter
  if (statusFilter.value === 'active') {
    result = result.filter(a => a.active)
  } else if (statusFilter.value === 'inactive') {
    result = result.filter(a => !a.active)
  }

  // Search filter
  if (searchQuery.value) {
    const query = searchQuery.value.toLowerCase()
    result = result.filter(a =>
      a.name.toLowerCase().includes(query) ||
      a.client_id.toLowerCase().includes(query) ||
      a.url?.toLowerCase().includes(query)
    )
  }

  return result
})

// Methods
async function loadApps() {
  refreshing.value = true
  try {
    const response = await getApps()
    apps.value = response.apps || []
  } catch (error) {
    showError('Failed to load applications')
  } finally {
    loading.value = false
    refreshing.value = false
  }
}

function getAppInitials(name: string): string {
  return name
    .split(' ')
    .map(word => word[0])
    .join('')
    .toUpperCase()
    .slice(0, 2)
}

function formatDate(dateString: string): string {
  const date = new Date(dateString)
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function clearFilters() {
  searchQuery.value = ''
  statusFilter.value = 'all'
}

// Lifecycle
onMounted(() => {
  loadApps()
})
</script>
