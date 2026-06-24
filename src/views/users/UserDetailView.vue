<template>
  <div class="max-w-4xl mx-auto">
    <!-- Loading -->
    <LoadingState v-if="loading" message="Loading user..." />

    <!-- Not Found -->
    <EmptyState
      v-else-if="!user"
      icon="pi-user"
      title="User not found"
      description="The user you're looking for doesn't exist."
    >
      <Button
        label="Back to Users"
        icon="pi pi-arrow-left"
        @click="$router.push({ name: 'Users' })"
      />
    </EmptyState>

    <!-- Content -->
    <template v-else>
      <!-- Header -->
      <div class="flex items-center gap-4 mb-6">
        <Button
          icon="pi pi-arrow-left"
          severity="secondary"
          text
          rounded
          @click="$router.push({ name: 'Users' })"
        />
        <div class="w-16 h-16 rounded-full flex items-center justify-center font-bold text-xl"
          :class="user.role === 'superadmin' 
            ? 'bg-gradient-to-br from-brand-500 to-brand-700 text-white' 
            : 'bg-brand-100 dark:bg-brand-800 text-brand-600 dark:text-brand-400'"
        >
          {{ getInitials(user.name || user.email) }}
        </div>
        <div>
          <div class="flex items-center gap-2">
            <h1 class="text-2xl font-bold text-gray-900 dark:text-white">{{ user.name || 'No name' }}</h1>
            <span
              class="px-2 py-1 text-xs font-medium rounded-full"
              :class="user.role === 'superadmin' 
                ? 'bg-brand-100 text-brand-700 dark:bg-brand-900/30 dark:text-brand-400'
                : 'bg-gray-100 text-gray-700 dark:bg-brand-800 dark:text-brand-300'"
            >
              {{ user.role === 'superadmin' ? 'Superadmin' : 'User' }}
            </span>
          </div>
          <p class="text-gray-500 dark:text-brand-400">{{ user.email }}</p>
        </div>
      </div>

      <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <!-- User Info Card -->
        <div class="card p-6">
          <h3 class="text-lg font-semibold text-gray-900 dark:text-white mb-4">User Information</h3>
          
          <div class="space-y-4">
            <div class="flex justify-between py-3 border-b border-gray-100 dark:border-brand-800">
              <span class="text-gray-600 dark:text-brand-400">Global Role</span>
              <span
                class="px-2 py-1 text-xs font-medium rounded-full"
                :class="getRoleBadgeClass(user.role)"
              >
                {{ user.role === 'superadmin' ? 'Superadmin' : 'User' }}
              </span>
            </div>
            
            <div class="flex justify-between py-3 border-b border-gray-100 dark:border-brand-800">
              <span class="text-gray-600 dark:text-brand-400">Email Verified</span>
              <span class="badge-success" v-if="user.is_verified">Verified</span>
              <span class="badge-warning" v-else>Pending</span>
            </div>
            
            <div class="flex justify-between py-3 border-b border-gray-100 dark:border-brand-800">
              <span class="text-gray-600 dark:text-brand-400">Created</span>
              <span class="text-gray-900 dark:text-white text-sm">{{ formatDateTime(user.created_at) }}</span>
            </div>

            <div class="flex justify-between py-3">
              <span class="text-gray-600 dark:text-brand-400">User ID</span>
              <span class="text-gray-900 dark:text-white font-mono text-sm">#{{ user.id }}</span>
            </div>
          </div>

          <!-- Info about global vs app roles -->
          <div class="mt-4 p-3 bg-brand-50 dark:bg-brand-900/20 rounded-lg">
            <p class="text-xs text-brand-700 dark:text-brand-300">
              <i class="pi pi-info-circle mr-1"></i>
              <strong>Note:</strong> Global role determines if user is a superadmin. 
              Users with "User" global role can still be admins within specific apps.
            </p>
          </div>
        </div>

        <!-- Actions Card -->
        <div class="card p-6">
          <h3 class="text-lg font-semibold text-gray-900 dark:text-white mb-4">Actions</h3>
          
          <div class="space-y-4">
            <div>
              <Button
                label="Revoke All Tokens"
                icon="pi pi-ban"
                severity="warning"
                outlined
                class="w-full justify-start"
                @click="confirmRevokeTokens"
                :loading="revokingTokens"
              />
              <p class="text-xs text-gray-500 dark:text-brand-400 mt-1 ml-9">
                Invalidate all access and refresh tokens, forcing re-authentication
              </p>
            </div>
            
            <div>
              <Button
                label="Unlock Account"
                icon="pi pi-unlock"
                severity="success"
                outlined
                class="w-full justify-start"
                @click="confirmUnlock"
                :loading="unlocking"
              />
              <p class="text-xs text-gray-500 dark:text-brand-400 mt-1 ml-9">
                Unlock account if locked due to failed login attempts
              </p>
            </div>

            <!-- Block and Delete — only for non-superadmins -->
            <template v-if="user.role !== 'superadmin'">
              <div class="pt-4 border-t border-gray-100 dark:border-brand-800">
                <Button
                  label="Block User"
                  icon="pi pi-ban"
                  severity="danger"
                  outlined
                  class="w-full justify-start"
                  @click="confirmBlock"
                  :loading="blocking"
                />
                <p class="text-xs text-gray-500 dark:text-brand-400 mt-1 ml-9">
                  Permanently block login until an admin unlocks the account
                </p>
              </div>

              <div>
                <Button
                  label="Delete User"
                  icon="pi pi-trash"
                  severity="danger"
                  class="w-full justify-start"
                  @click="confirmDelete"
                  :loading="deleting"
                />
                <p class="text-xs text-gray-500 dark:text-brand-400 mt-1 ml-9">
                  Permanently delete this user and all their data — irreversible
                </p>
              </div>
            </template>
          </div>

          <!-- Use Cases -->
          <div class="mt-6 pt-4 border-t border-gray-100 dark:border-brand-800">
            <p class="text-xs font-medium text-gray-700 dark:text-gray-300 mb-2">When to use:</p>
            <ul class="text-xs text-gray-500 dark:text-brand-400 space-y-1">
              <li>• <strong>Revoke tokens:</strong> Security breach, user left org, force re-login</li>
              <li>• <strong>Unlock:</strong> User locked out from too many failed attempts</li>
              <li>• <strong>Block:</strong> Suspend access without deleting the account</li>
              <li>• <strong>Delete:</strong> Fully remove user and all associated data</li>
            </ul>
          </div>
        </div>

        <!-- App Memberships Summary Card -->
        <div class="card p-6">
          <h3 class="text-lg font-semibold text-gray-900 dark:text-white mb-4">App Access Summary</h3>
          
          <div v-if="loadingMemberships" class="py-8 text-center">
            <i class="pi pi-spin pi-spinner text-2xl text-gray-400"></i>
          </div>
          
          <div v-else-if="memberships">
            <div class="grid grid-cols-2 gap-4 mb-4">
              <div class="p-3 bg-brand-50 dark:bg-brand-900/20 rounded-lg text-center">
                <p class="text-2xl font-bold text-brand-600 dark:text-brand-400">{{ memberships.total_count }}</p>
                <p class="text-xs text-gray-500 dark:text-brand-400">Total Apps</p>
              </div>
              <div class="p-3 bg-warning-50 dark:bg-warning-900/20 rounded-lg text-center">
                <p class="text-2xl font-bold text-warning-600 dark:text-warning-400">{{ adminAppsCount }}</p>
                <p class="text-xs text-gray-500 dark:text-brand-400">Admin In</p>
              </div>
            </div>

            <div v-if="memberships.memberships.length === 0" class="text-center py-4 text-gray-500 dark:text-brand-400">
              <i class="pi pi-inbox text-2xl mb-2"></i>
              <p class="text-sm">No app memberships</p>
            </div>
          </div>
        </div>
      </div>

      <!-- App Memberships Detail -->
      <div class="card p-6 mt-6">
        <div class="flex items-center justify-between mb-4">
          <h3 class="text-lg font-semibold text-gray-900 dark:text-white">App Memberships</h3>
          <Button
            icon="pi pi-refresh"
            severity="secondary"
            text
            size="small"
            @click="loadMemberships"
            :loading="loadingMemberships"
          />
        </div>

        <p class="text-sm text-gray-500 dark:text-brand-400 mb-4">
          All applications this user has access to with their role in each app.
        </p>

        <div v-if="loadingMemberships" class="py-8 text-center">
          <i class="pi pi-spin pi-spinner text-3xl text-gray-400"></i>
          <p class="mt-2 text-gray-500">Loading memberships...</p>
        </div>

        <div v-else-if="memberships?.memberships?.length">
          <DataTable
            :value="memberships.memberships"
            stripedRows
            class="p-datatable-sm"
          >
            <Column field="app_name" header="Application" sortable>
              <template #body="{ data }">
                <div class="flex items-center gap-3">
                  <div class="w-8 h-8 rounded-lg bg-brand-100 dark:bg-brand-800 flex items-center justify-center text-brand-600 dark:text-brand-400 text-xs font-semibold">
                    {{ getInitials(data.app_name) }}
                  </div>
                  <div>
                    <p class="font-medium text-gray-900 dark:text-white">{{ data.app_name }}</p>
                    <p class="text-xs font-mono text-gray-500 dark:text-brand-400">{{ data.client_id.slice(0, 16) }}...</p>
                  </div>
                </div>
              </template>
            </Column>
            <Column field="role" header="Role in App" style="width: 120px">
              <template #body="{ data }">
                <span
                  class="px-2 py-1 text-xs font-medium rounded-full"
                  :class="data.role === 'admin' 
                    ? 'bg-warning-100 text-warning-700 dark:bg-warning-900/30 dark:text-warning-400'
                    : 'bg-gray-100 text-gray-700 dark:bg-brand-800 dark:text-brand-300'"
                >
                  {{ data.role === 'admin' ? 'Admin' : 'User' }}
                </span>
              </template>
            </Column>
            <Column field="created_at" header="Joined" style="width: 150px">
              <template #body="{ data }">
                <span class="text-sm text-gray-500 dark:text-brand-400">
                  {{ formatDate(data.created_at) }}
                </span>
              </template>
            </Column>
            <Column header="Actions" style="width: 100px">
              <template #body="{ data }">
                <Button
                  icon="pi pi-external-link"
                  severity="secondary"
                  text
                  rounded
                  size="small"
                  @click="goToApp(data.app_id)"
                  v-tooltip="'View App'"
                />
              </template>
            </Column>
          </DataTable>
        </div>

        <div v-else class="text-center py-8 text-gray-500 dark:text-brand-400">
          <i class="pi pi-inbox text-4xl mb-2"></i>
          <p>This user has no app memberships</p>
          <p class="text-sm mt-1">They haven't been added to any OAuth applications yet.</p>
        </div>
      </div>
    </template>

    <!-- Revoke Tokens Confirmation -->
    <Dialog v-model:visible="showRevokeDialog" modal header="Revoke All Tokens" :style="{ width: '450px' }">
      <div class="flex items-start gap-4">
        <div class="w-12 h-12 rounded-full bg-warning-100 dark:bg-warning-900/30 flex items-center justify-center shrink-0">
          <i class="pi pi-exclamation-triangle text-2xl text-warning-600"></i>
        </div>
        <div>
          <p class="text-gray-700 dark:text-gray-300">
            Revoke all tokens for <strong>{{ user?.email }}</strong>?
          </p>
          <p class="text-sm text-gray-500 dark:text-brand-400 mt-2">
            This will immediately invalidate all access and refresh tokens. The user will be logged out of all sessions and must re-authenticate.
          </p>
        </div>
      </div>
      <template #footer>
        <Button label="Cancel" severity="secondary" outlined @click="showRevokeDialog = false" />
        <Button label="Revoke Tokens" severity="warning" icon="pi pi-ban" @click="revokeTokens" :loading="revokingTokens" />
      </template>
    </Dialog>

    <!-- Unlock Account Confirmation -->
    <Dialog v-model:visible="showUnlockDialog" modal header="Unlock Account" :style="{ width: '450px' }">
      <div class="flex items-start gap-4">
        <div class="w-12 h-12 rounded-full bg-success-100 dark:bg-success-900/30 flex items-center justify-center shrink-0">
          <i class="pi pi-unlock text-2xl text-success-600"></i>
        </div>
        <div>
          <p class="text-gray-700 dark:text-gray-300">
            Unlock account for <strong>{{ user?.email }}</strong>?
          </p>
          <p class="text-sm text-gray-500 dark:text-brand-400 mt-2">
            This will clear any lockout status from failed login attempts and allow the user to log in again.
          </p>
        </div>
      </div>
      <template #footer>
        <Button label="Cancel" severity="secondary" outlined @click="showUnlockDialog = false" />
        <Button label="Unlock Account" severity="success" icon="pi pi-unlock" @click="unlockAccount" :loading="unlocking" />
      </template>
    </Dialog>

    <!-- Block User Confirmation -->
    <Dialog v-model:visible="showBlockDialog" modal header="Block User" :style="{ width: '450px' }">
      <div class="flex items-start gap-4">
        <div class="w-12 h-12 rounded-full bg-error-100 dark:bg-error-900/30 flex items-center justify-center shrink-0">
          <i class="pi pi-ban text-2xl text-error-600"></i>
        </div>
        <div>
          <p class="text-gray-700 dark:text-gray-300">
            Block <strong>{{ user?.email }}</strong>?
          </p>
          <p class="text-sm text-gray-500 dark:text-brand-400 mt-2">
            This will permanently prevent the user from logging in until an admin explicitly unlocks them. Their data and app memberships are preserved.
          </p>
        </div>
      </div>
      <template #footer>
        <Button label="Cancel" severity="secondary" outlined @click="showBlockDialog = false" />
        <Button label="Block User" severity="danger" icon="pi pi-ban" @click="blockAccount" :loading="blocking" />
      </template>
    </Dialog>

    <!-- Delete User Confirmation -->
    <Dialog v-model:visible="showDeleteDialog" modal header="Delete User" :style="{ width: '450px' }">
      <div class="flex items-start gap-4">
        <div class="w-12 h-12 rounded-full bg-error-100 dark:bg-error-900/30 flex items-center justify-center shrink-0">
          <i class="pi pi-trash text-2xl text-error-600"></i>
        </div>
        <div>
          <p class="text-gray-700 dark:text-gray-300">
            Permanently delete <strong>{{ user?.email }}</strong>?
          </p>
          <p class="text-sm text-gray-500 dark:text-brand-400 mt-2">
            This will irreversibly delete the user account and all associated data including app memberships and tokens. This action cannot be undone.
          </p>
        </div>
      </div>
      <template #footer>
        <Button label="Cancel" severity="secondary" outlined @click="showDeleteDialog = false" />
        <Button label="Delete Permanently" severity="danger" icon="pi pi-trash" @click="deleteAccount" :loading="deleting" />
      </template>
    </Dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import Button from 'primevue/button'
import DataTable from 'primevue/datatable'
import Column from 'primevue/column'
import Dialog from 'primevue/dialog'
import LoadingState from '@/components/ui/LoadingState.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import { useToast } from '@/composables/useToast'
import { getUser, getUserApps, revokeUserTokens, unlockUser, blockUser, deleteUser } from '@/services/userService'
import type { GlobalUser, UserAppMembershipsResponse } from '@/types/user'

const route = useRoute()
const router = useRouter()
const { showSuccess, showError } = useToast()

// State
const loading = ref(true)
const loadingMemberships = ref(false)
const revokingTokens = ref(false)
const unlocking = ref(false)
const blocking = ref(false)
const deleting = ref(false)
const user = ref<GlobalUser | null>(null)
const memberships = ref<UserAppMembershipsResponse | null>(null)

// Dialogs
const showRevokeDialog = ref(false)
const showUnlockDialog = ref(false)
const showBlockDialog = ref(false)
const showDeleteDialog = ref(false)

// Computed
const adminAppsCount = computed(() => {
  if (!memberships.value?.memberships) return 0
  return memberships.value.memberships.filter(m => m.role === 'admin').length
})

// Methods
async function loadUserData() {
  const id = Number(route.params.id)
  if (!id) {
    loading.value = false
    return
  }

  try {
    user.value = await getUser(id)
    // Load memberships in parallel
    loadMemberships()
  } catch (error) {
    console.error('Load user error:', error)
    user.value = null
  } finally {
    loading.value = false
  }
}

async function loadMemberships() {
  if (!user.value) return
  loadingMemberships.value = true
  try {
    memberships.value = await getUserApps(user.value.id)
  } catch (error) {
    console.error('Load memberships error:', error)
    // Don't show error - might just be empty
  } finally {
    loadingMemberships.value = false
  }
}

function confirmRevokeTokens() {
  showRevokeDialog.value = true
}

async function revokeTokens() {
  if (!user.value) return
  revokingTokens.value = true
  try {
    await revokeUserTokens(user.value.id)
    showSuccess('All tokens revoked successfully')
    showRevokeDialog.value = false
  } catch (error: any) {
    showError(error.response?.data?.message || 'Failed to revoke tokens')
  } finally {
    revokingTokens.value = false
  }
}

function confirmUnlock() {
  showUnlockDialog.value = true
}

async function unlockAccount() {
  if (!user.value) return
  unlocking.value = true
  try {
    await unlockUser(user.value.id)
    showSuccess('Account unlocked successfully')
    showUnlockDialog.value = false
  } catch (error: any) {
    showError(error.response?.data?.message || 'Failed to unlock account')
  } finally {
    unlocking.value = false
  }
}

function confirmBlock() {
  showBlockDialog.value = true
}

async function blockAccount() {
  if (!user.value) return
  blocking.value = true
  try {
    await blockUser(user.value.id)
    showSuccess('User has been blocked')
    showBlockDialog.value = false
    user.value = await getUser(user.value.id)   // refresh to show updated status
  } catch (error: any) {
    showError(error.response?.data?.message || 'Failed to block user')
  } finally {
    blocking.value = false
  }
}

function confirmDelete() {
  showDeleteDialog.value = true
}

async function deleteAccount() {
  if (!user.value) return
  deleting.value = true
  try {
    await deleteUser(user.value.id)
    showSuccess('User deleted successfully')
    showDeleteDialog.value = false
    router.push({ name: 'Users' })
  } catch (error: any) {
    showError(error.response?.data?.message || 'Failed to delete user')
  } finally {
    deleting.value = false
  }
}

function goToApp(appId: number) {
  router.push({ name: 'ApplicationDetail', params: { id: appId } })
}

function getInitials(name: string): string {
  return name.split(/[@\s]/).filter(Boolean).map(w => w[0]).join('').toUpperCase().slice(0, 2)
}

function getRoleBadgeClass(role: string): string {
  if (role === 'superadmin') {
    return 'bg-brand-100 text-brand-700 dark:bg-brand-900/30 dark:text-brand-400'
  }
  return 'bg-gray-100 text-gray-700 dark:bg-brand-800 dark:text-brand-300'
}

function formatDateTime(dateString: string): string {
  return new Date(dateString).toLocaleString()
}

function formatDate(dateString: string): string {
  return new Date(dateString).toLocaleDateString()
}

// Lifecycle
onMounted(() => {
  loadUserData()
})
</script>
