<template>
  <div>
    <!-- Header -->
    <div class="flex items-center justify-between mb-6">
      <PageHeader
        title="User Management"
        subtitle="Manage superadmins, app admins, and app users"
        class="mb-0"
      />
      <Button
        label="Invite User"
        icon="pi pi-user-plus"
        @click="openInviteDialog"
      />
    </div>

    <!-- Stats Overview -->
    <div class="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
      <div class="card p-4 cursor-pointer hover:shadow-md transition-shadow" @click="activeTab = '1'">
        <div class="flex items-center gap-3">
          <div class="w-12 h-12 rounded-xl bg-gradient-to-br from-brand-500 to-brand-700 flex items-center justify-center">
            <i class="pi pi-shield text-white text-xl"></i>
          </div>
          <div>
            <p class="text-2xl font-bold text-gray-900 dark:text-white">{{ superadmins.length }}</p>
            <p class="text-sm text-gray-500 dark:text-brand-400">Superadmins</p>
          </div>
        </div>
        <p class="text-xs text-gray-400 dark:text-brand-500 mt-2">System administrators</p>
      </div>
      
      <div class="card p-4 cursor-pointer hover:shadow-md transition-shadow" @click="activeTab = '0'">
        <div class="flex items-center gap-3">
          <div class="w-12 h-12 rounded-xl bg-brand-100 dark:bg-brand-800 flex items-center justify-center">
            <i class="pi pi-users text-brand-600 dark:text-brand-400 text-xl"></i>
          </div>
          <div>
            <p class="text-2xl font-bold text-gray-900 dark:text-white">{{ totalUsers }}</p>
            <p class="text-sm text-gray-500 dark:text-brand-400">Total Users</p>
          </div>
        </div>
        <p class="text-xs text-gray-400 dark:text-brand-500 mt-2">All users across apps</p>
      </div>
      
      <div class="card p-4 cursor-pointer hover:shadow-md transition-shadow" @click="activeTab = '2'">
        <div class="flex items-center gap-3">
          <div class="w-12 h-12 rounded-xl bg-success-100 dark:bg-success-900/30 flex items-center justify-center">
            <i class="pi pi-list text-success-600 dark:text-success-400 text-xl"></i>
          </div>
          <div>
            <p class="text-2xl font-bold text-gray-900 dark:text-white">{{ activityLogs.length }}</p>
            <p class="text-sm text-gray-500 dark:text-brand-400">Recent Actions</p>
          </div>
        </div>
        <p class="text-xs text-gray-400 dark:text-brand-500 mt-2">Admin activity log</p>
      </div>
    </div>

    <!-- Tabs (PrimeVue 4) -->
    <Tabs v-model:value="activeTab">
      <TabList>
        <Tab value="0">All Users</Tab>
        <Tab value="1">Superadmins</Tab>
        <Tab value="2">Activity Log</Tab>
      </TabList>
      <TabPanels>
        <!-- Global Users Tab -->
        <TabPanel value="0">
          <div class="p-4">
            <!-- Info Banner -->
            <div class="p-3 bg-brand-50 dark:bg-brand-900/20 rounded-lg mb-4">
              <p class="text-sm text-brand-700 dark:text-brand-300">
                <i class="pi pi-info-circle mr-1"></i>
                <strong>Global Users:</strong> Users with global role "user" can be admins or regular users within specific apps. 
                Click on a user to view their app memberships.
              </p>
            </div>

            <div class="card">
              <DataTable
                :value="users"
                :loading="loadingUsers"
                paginator
                :rows="20"
                :rowsPerPageOptions="[10, 20, 50, 100]"
                :totalRecords="totalUsers"
                stripedRows
                class="p-datatable-sm"
                @row-click="goToUserDetail"
                rowHover
              >
                <template #header>
                  <div class="flex justify-between items-center">
                    <span class="text-lg font-semibold">{{ totalUsers }} Users</span>
                    <Button icon="pi pi-refresh" severity="secondary" outlined size="small" @click="loadUsers" :loading="loadingUsers" />
                  </div>
                </template>
                <Column field="email" header="User" sortable>
                  <template #body="{ data }">
                    <div class="flex items-center gap-3">
                      <div 
                        class="w-10 h-10 rounded-full flex items-center justify-center font-semibold text-sm"
                        :class="data.role === 'superadmin' 
                          ? 'bg-gradient-to-br from-brand-500 to-brand-700 text-white'
                          : 'bg-brand-100 dark:bg-brand-800 text-brand-600 dark:text-brand-400'"
                      >
                        {{ getInitials(data.name || data.email) }}
                      </div>
                      <div>
                        <p class="font-medium text-gray-900 dark:text-white">{{ data.name || 'No name' }}</p>
                        <p class="text-sm text-gray-500 dark:text-brand-400">{{ data.email }}</p>
                      </div>
                    </div>
                  </template>
                </Column>
                <Column field="role" header="Global Role" sortable style="width: 140px">
                  <template #body="{ data }">
                    <span
                      class="px-2 py-1 text-xs font-medium rounded-full"
                      :class="getRoleBadgeClass(data.role)"
                    >
                      {{ data.role === 'superadmin' ? 'Superadmin' : 'User' }}
                    </span>
                  </template>
                </Column>
                <Column field="is_verified" header="Status" style="width: 100px">
                  <template #body="{ data }">
                    <span class="badge-success text-xs" v-if="data.is_verified">Verified</span>
                    <span class="badge-warning text-xs" v-else>Pending</span>
                  </template>
                </Column>
                <Column field="created_at" header="Created" sortable style="width: 130px">
                  <template #body="{ data }">
                    <span class="text-sm text-gray-500 dark:text-brand-400">
                      {{ formatDate(data.created_at) }}
                    </span>
                  </template>
                </Column>
                <Column header="Actions" style="width: 140px">
                  <template #body="{ data }">
                    <div class="flex gap-1" @click.stop>
                      <Button
                        icon="pi pi-eye"
                        severity="secondary"
                        text
                        rounded
                        size="small"
                        @click="goToUserDetail({ data })"
                        v-tooltip="'View Details'"
                      />
                      <Button
                        icon="pi pi-ban"
                        severity="warn"
                        text
                        rounded
                        size="small"
                        @click="quickRevokeTokens(data)"
                        v-tooltip="'Revoke Tokens'"
                      />
                      <Button
                        icon="pi pi-unlock"
                        severity="success"
                        text
                        rounded
                        size="small"
                        @click="quickUnlockAccount(data)"
                        v-tooltip="'Unlock Account'"
                      />
                    </div>
                  </template>
                </Column>
                <template #empty>
                  <div class="text-center py-8 text-gray-500 dark:text-brand-400">
                    <i class="pi pi-users text-4xl mb-2"></i>
                    <p>No users found</p>
                  </div>
                </template>
              </DataTable>
            </div>
          </div>
        </TabPanel>

        <!-- Superadmins Tab -->
        <TabPanel value="1">
          <div class="p-4">
            <!-- Create Superadmin Form -->
            <div class="card p-4 mb-6">
              <h3 class="text-lg font-semibold text-gray-900 dark:text-white mb-4">
                <i class="pi pi-shield mr-2"></i>Create Superadmin
              </h3>
              <form @submit.prevent="createNewSuperadmin" class="space-y-4">
                <div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div>
                    <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Email</label>
                    <InputText v-model="newSuperadmin.email" placeholder="admin@example.com" class="w-full" />
                  </div>
                  <div>
                    <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Name</label>
                    <InputText v-model="newSuperadmin.name" placeholder="Admin Name" class="w-full" />
                  </div>
                  <div>
                    <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Password</label>
                    <Password v-model="newSuperadmin.password" placeholder="Secure password" toggleMask :feedback="false" class="w-full" />
                  </div>
                </div>
                <div class="flex justify-end">
                  <Button
                    type="submit"
                    label="Create Superadmin"
                    icon="pi pi-user-plus"
                    :loading="creatingSuperadmin"
                    :disabled="!newSuperadmin.email || !newSuperadmin.name || !newSuperadmin.password"
                  />
                </div>
              </form>
              <p class="text-xs text-gray-500 dark:text-brand-400 mt-2">
                <i class="pi pi-info-circle mr-1"></i>
                Superadmins are automatically verified upon creation and have full system access.
              </p>
            </div>

            <!-- Superadmins List -->
            <div class="card">
              <DataTable
                :value="superadmins"
                :loading="loadingSuperadmins"
                stripedRows
                class="p-datatable-sm"
              >
                <template #header>
                  <div class="flex justify-between items-center">
                    <span class="text-lg font-semibold">{{ superadmins.length }} Superadmins</span>
                    <Button icon="pi pi-refresh" severity="secondary" outlined size="small" @click="loadSuperadmins" :loading="loadingSuperadmins" />
                  </div>
                </template>
                <Column field="email" header="Superadmin" sortable>
                  <template #body="{ data }">
                    <div class="flex items-center gap-3">
                      <div class="w-10 h-10 rounded-full bg-gradient-to-br from-brand-500 to-brand-700 flex items-center justify-center text-white font-semibold text-sm">
                        {{ getInitials(data.name || data.email) }}
                      </div>
                      <div>
                        <p class="font-medium text-gray-900 dark:text-white">{{ data.name }}</p>
                        <p class="text-sm text-gray-500 dark:text-brand-400">{{ data.email }}</p>
                      </div>
                    </div>
                  </template>
                </Column>
                <Column field="last_login" header="Last Login" sortable style="width: 150px">
                  <template #body="{ data }">
                    <span class="text-sm text-gray-500 dark:text-brand-400">
                      {{ data.last_login ? formatRelativeTime(data.last_login) : 'Never' }}
                    </span>
                  </template>
                </Column>
                <Column field="failed_logins" header="Failed" style="width: 80px">
                  <template #body="{ data }">
                    <span :class="data.failed_logins > 0 ? 'text-warning-600 font-medium' : 'text-gray-400'">
                      {{ data.failed_logins }}
                    </span>
                  </template>
                </Column>
                <Column field="locked_until" header="Status" style="width: 100px">
                  <template #body="{ data }">
                    <span class="badge-error text-xs" v-if="data.locked_until && new Date(data.locked_until) > new Date()">
                      Locked
                    </span>
                    <span class="badge-success text-xs" v-else>Active</span>
                  </template>
                </Column>
                <Column header="Actions" style="width: 120px">
                  <template #body="{ data }">
                    <div class="flex gap-1">
                      <Button
                        icon="pi pi-pencil"
                        severity="secondary"
                        text
                        rounded
                        size="small"
                        @click="openEditDialog(data)"
                        v-tooltip="'Edit'"
                      />
                      <Button
                        icon="pi pi-trash"
                        severity="danger"
                        text
                        rounded
                        size="small"
                        @click="confirmDeleteSuperadmin(data)"
                        v-tooltip="'Delete'"
                      />
                    </div>
                  </template>
                </Column>
                <template #empty>
                  <div class="text-center py-8 text-gray-500 dark:text-brand-400">
                    <i class="pi pi-shield text-4xl mb-2"></i>
                    <p>No superadmins found</p>
                  </div>
                </template>
              </DataTable>
            </div>

            <!-- Constraints Info -->
            <div class="mt-4 p-3 bg-warning-50 dark:bg-warning-900/20 rounded-lg">
              <p class="text-sm text-warning-700 dark:text-warning-300">
                <i class="pi pi-exclamation-triangle mr-1"></i>
                <strong>Constraints:</strong> You cannot delete your own account or the last superadmin in the system.
              </p>
            </div>
          </div>
        </TabPanel>

        <!-- Activity Log Tab -->
        <TabPanel value="2">
          <div class="p-4">
            <div class="card">
              <DataTable
                :value="activityLogs"
                :loading="loadingLogs"
                paginator
                :rows="20"
                stripedRows
                class="p-datatable-sm"
              >
                <template #header>
                  <div class="flex justify-between items-center">
                    <span class="text-lg font-semibold">Admin Activity Log</span>
                    <Button icon="pi pi-refresh" severity="secondary" outlined size="small" @click="loadActivityLogs" :loading="loadingLogs" />
                  </div>
                </template>
                <Column field="created_at" header="Time" sortable style="width: 180px">
                  <template #body="{ data }">
                    <span class="text-sm">{{ formatDateTime(data.created_at) }}</span>
                  </template>
                </Column>
                <Column field="action" header="Action" sortable>
                  <template #body="{ data }">
                    <div class="flex items-center gap-2">
                      <i :class="['pi text-sm', getActionIcon(data.action), getActionColor(data.action)]"></i>
                      <span class="font-medium">{{ formatAction(data.action) }}</span>
                    </div>
                  </template>
                </Column>
                <Column field="target_user_id" header="Target" style="width: 120px">
                  <template #body="{ data }">
                    <span v-if="data.target_user_id" class="text-sm">User #{{ data.target_user_id }}</span>
                    <span v-else class="text-gray-400">-</span>
                  </template>
                </Column>
                <Column field="app_id" header="App" style="width: 100px">
                  <template #body="{ data }">
                    <Button
                      v-if="data.app_id"
                      :label="`#${data.app_id}`"
                      severity="secondary"
                      text
                      size="small"
                      @click="$router.push({ name: 'ApplicationDetail', params: { id: data.app_id } })"
                    />
                    <span v-else class="text-gray-400">-</span>
                  </template>
                </Column>
                <Column field="details" header="Details" style="width: 200px">
                  <template #body="{ data }">
                    <span class="text-xs text-gray-500 dark:text-brand-400 font-mono">
                      {{ formatDetails(data.details) }}
                    </span>
                  </template>
                </Column>
                <template #empty>
                  <div class="text-center py-8 text-gray-500 dark:text-brand-400">
                    <i class="pi pi-list text-4xl mb-2"></i>
                    <p>No activity logs yet</p>
                  </div>
                </template>
              </DataTable>
            </div>
          </div>
        </TabPanel>
      </TabPanels>
    </Tabs>

    <!-- Invite User Dialog -->
    <Dialog v-model:visible="showInviteUserDialog" modal header="Invite User to Application" :style="{ width: '500px' }">
      <div class="space-y-4">
        <p class="text-sm text-gray-500 dark:text-brand-400">
          Enter the user's details and select which application to invite them to.
          If the email doesn't exist yet, a new account will be created automatically.
        </p>
        <div>
          <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Email <span class="text-error-500">*</span>
          </label>
          <InputText v-model="inviteForm.email" placeholder="user@example.com" class="w-full" />
        </div>
        <div>
          <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Name (optional)</label>
          <InputText v-model="inviteForm.name" placeholder="Full name" class="w-full" />
        </div>
        <div>
          <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Application <span class="text-error-500">*</span>
          </label>
          <Select
            v-model="inviteForm.appId"
            :options="apps"
            optionLabel="name"
            optionValue="id"
            placeholder="Select an application..."
            class="w-full"
            :loading="loadingApps"
          />
        </div>
        <div>
          <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Role</label>
          <Select
            v-model="inviteForm.role"
            :options="[{ label: 'User', value: 'user' }, { label: 'Admin', value: 'admin' }]"
            optionLabel="label"
            optionValue="value"
            class="w-full"
          />
        </div>
        <small v-if="inviteError" class="text-error-600">{{ inviteError }}</small>
      </div>
      <template #footer>
        <Button label="Cancel" severity="secondary" outlined @click="showInviteUserDialog = false" />
        <Button
          label="Send Invite"
          icon="pi pi-envelope"
          @click="submitInviteUser"
          :loading="invitingUser"
          :disabled="!inviteForm.email || !inviteForm.appId"
        />
      </template>
    </Dialog>

    <!-- Invite Result Dialog -->
    <Dialog v-model:visible="showInviteResultDialog" modal header="User Invited Successfully" :style="{ width: '500px' }">
      <div class="space-y-4">
        <div class="p-4 bg-success-50 dark:bg-success-900/20 border border-success-200 dark:border-success-800 rounded-lg">
          <div class="flex items-center gap-3">
            <i class="pi pi-check-circle text-2xl text-success-600"></i>
            <div>
              <p class="font-medium text-success-800 dark:text-success-200">
                User invited to application successfully
              </p>
            </div>
          </div>
        </div>
        <div v-if="inviteResult?.inviteToken">
          <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Invite Token</label>
          <p class="text-xs text-gray-500 dark:text-brand-400 mb-2">
            Share this token with the user so they can set up their account:
          </p>
          <div class="flex gap-2">
            <InputText :modelValue="inviteResult.inviteToken" readonly class="flex-1 font-mono text-xs" />
            <Button icon="pi pi-copy" severity="secondary" @click="copyToken(inviteResult!.inviteToken)" />
          </div>
        </div>
        <div class="text-sm text-gray-500 dark:text-brand-400 space-y-1">
          <p><strong>User ID:</strong> {{ inviteResult?.userId }}</p>
          <p><strong>Role:</strong> {{ inviteResult?.role }}</p>
        </div>
      </div>
      <template #footer>
        <Button label="Done" icon="pi pi-check" @click="showInviteResultDialog = false; loadUsers()" />
      </template>
    </Dialog>

    <!-- Edit Superadmin Dialog -->
    <Dialog v-model:visible="showEditDialog" modal header="Edit Superadmin" :style="{ width: '450px' }">
      <div class="space-y-4">
        <div>
          <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Name</label>
          <InputText v-model="editForm.name" class="w-full" />
        </div>
        <div>
          <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Email</label>
          <InputText v-model="editForm.email" class="w-full" />
        </div>
        <div>
          <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">New Password</label>
          <Password v-model="editForm.password" toggleMask :feedback="false" class="w-full" placeholder="Leave blank to keep current" />
        </div>
      </div>
      <template #footer>
        <Button label="Cancel" severity="secondary" outlined @click="showEditDialog = false" />
        <Button label="Save Changes" icon="pi pi-check" @click="saveEditedSuperadmin" :loading="editingSuperadmin" />
      </template>
    </Dialog>

    <!-- Delete Superadmin Confirmation -->
    <Dialog v-model:visible="showDeleteDialog" modal header="Delete Superadmin" :style="{ width: '450px' }">
      <div class="flex items-start gap-4">
        <div class="w-12 h-12 rounded-full bg-error-100 dark:bg-error-900/30 flex items-center justify-center shrink-0">
          <i class="pi pi-exclamation-triangle text-2xl text-error-600"></i>
        </div>
        <div>
          <p class="text-gray-700 dark:text-gray-300">
            Delete superadmin <strong>{{ superadminToDelete?.email }}</strong>?
          </p>
          <p class="text-sm text-gray-500 dark:text-brand-400 mt-2">
            This will permanently remove their superadmin access. This cannot be undone.
          </p>
        </div>
      </div>
      <template #footer>
        <Button label="Cancel" severity="secondary" outlined @click="showDeleteDialog = false" />
        <Button label="Delete Superadmin" severity="danger" icon="pi pi-trash" @click="deleteSuperadminAccount" :loading="deletingSuperadmin" />
      </template>
    </Dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted, watch } from 'vue'
import { useRouter } from 'vue-router'
import Button from 'primevue/button'
import InputText from 'primevue/inputtext'
import Password from 'primevue/password'
import Select from 'primevue/select'
import Tabs from 'primevue/tabs'
import TabList from 'primevue/tablist'
import Tab from 'primevue/tab'
import TabPanels from 'primevue/tabpanels'
import TabPanel from 'primevue/tabpanel'
import DataTable from 'primevue/datatable'
import Column from 'primevue/column'
import Dialog from 'primevue/dialog'
import PageHeader from '@/components/ui/PageHeader.vue'
import { useToast } from '@/composables/useToast'
import {
  getUsers,
  revokeUserTokens,
  unlockUser,
  getSuperadmins,
  createSuperadmin,
  updateSuperadmin,
  deleteSuperadmin,
  getAdminActivityLog,
  adminActionLabels
} from '@/services/userService'
import { getApps, addUserToApp } from '@/services/applicationService'
import type { GlobalUser, Superadmin, AdminActivityLog } from '@/types/user'
import type { App } from '@/types/application'

const router = useRouter()
const { showSuccess, showError } = useToast()

// State
const activeTab = ref('0')
const loadingUsers = ref(false)
const loadingSuperadmins = ref(false)
const loadingLogs = ref(false)
const creatingSuperadmin = ref(false)
const editingSuperadmin = ref(false)
const deletingSuperadmin = ref(false)

const users = ref<GlobalUser[]>([])
const totalUsers = ref(0)
const superadmins = ref<Superadmin[]>([])
const activityLogs = ref<AdminActivityLog[]>([])

// Dialogs
const showEditDialog = ref(false)
const showDeleteDialog = ref(false)
const superadminToEdit = ref<Superadmin | null>(null)
const superadminToDelete = ref<Superadmin | null>(null)

// Invite User dialog
const showInviteUserDialog = ref(false)
const showInviteResultDialog = ref(false)
const invitingUser = ref(false)
const loadingApps = ref(false)
const inviteError = ref('')
const apps = ref<App[]>([])
const inviteForm = reactive({ email: '', name: '', appId: null as number | null, role: 'user' as 'user' | 'admin' })
const inviteResult = ref<{ userId: number; inviteToken: string; role: string } | null>(null)

// Forms
const newSuperadmin = reactive({
  email: '',
  name: '',
  password: ''
})

const editForm = reactive({
  name: '',
  email: '',
  password: ''
})

// Methods
async function loadUsers() {
  loadingUsers.value = true
  try {
    const response = await getUsers({ page: 1, page_size: 100 })
    users.value = response.users || []
    totalUsers.value = response.total_count || 0
  } catch {
    showError('Failed to load users')
  } finally {
    loadingUsers.value = false
  }
}

async function loadSuperadmins() {
  loadingSuperadmins.value = true
  try {
    const response = await getSuperadmins()
    superadmins.value = response.superadmins || []
  } catch {
    showError('Failed to load superadmins')
  } finally {
    loadingSuperadmins.value = false
  }
}

async function loadActivityLogs() {
  loadingLogs.value = true
  try {
    const response = await getAdminActivityLog({ page: 1, page_size: 100 })
    activityLogs.value = response.logs || []
  } catch {
    showError('Failed to load activity logs')
  } finally {
    loadingLogs.value = false
  }
}

function goToUserDetail(event: { data: GlobalUser }) {
  router.push({ name: 'UserDetail', params: { id: event.data.id } })
}

async function quickRevokeTokens(user: GlobalUser) {
  try {
    await revokeUserTokens(user.id)
    showSuccess(`Tokens revoked for ${user.email}`)
  } catch (error: any) {
    showError(error.response?.data?.message || 'Failed to revoke tokens')
  }
}

async function quickUnlockAccount(user: GlobalUser) {
  try {
    await unlockUser(user.id)
    showSuccess(`Account unlocked for ${user.email}`)
  } catch (error: any) {
    showError(error.response?.data?.message || 'Failed to unlock account')
  }
}

async function createNewSuperadmin() {
  creatingSuperadmin.value = true
  try {
    await createSuperadmin({
      email: newSuperadmin.email,
      name: newSuperadmin.name,
      password: newSuperadmin.password
    })
    showSuccess('Superadmin created successfully')
    newSuperadmin.email = ''
    newSuperadmin.name = ''
    newSuperadmin.password = ''
    loadSuperadmins()
    loadUsers() // Also refresh users list
  } catch (error: any) {
    showError(error.response?.data?.message || error.response?.data?.error || 'Failed to create superadmin')
  } finally {
    creatingSuperadmin.value = false
  }
}

function openEditDialog(superadmin: Superadmin) {
  superadminToEdit.value = superadmin
  editForm.name = superadmin.name
  editForm.email = superadmin.email
  editForm.password = ''
  showEditDialog.value = true
}

async function saveEditedSuperadmin() {
  if (!superadminToEdit.value) return
  editingSuperadmin.value = true
  try {
    await updateSuperadmin(superadminToEdit.value.id, {
      name: editForm.name || undefined,
      email: editForm.email || undefined,
      password: editForm.password || undefined
    })
    showSuccess('Superadmin updated successfully')
    showEditDialog.value = false
    loadSuperadmins()
  } catch (error: any) {
    showError(error.response?.data?.message || error.response?.data?.error || 'Failed to update superadmin')
  } finally {
    editingSuperadmin.value = false
  }
}

function confirmDeleteSuperadmin(superadmin: Superadmin) {
  superadminToDelete.value = superadmin
  showDeleteDialog.value = true
}

async function deleteSuperadminAccount() {
  if (!superadminToDelete.value) return
  deletingSuperadmin.value = true
  try {
    await deleteSuperadmin(superadminToDelete.value.id)
    showSuccess('Superadmin deleted successfully')
    showDeleteDialog.value = false
    loadSuperadmins()
    loadUsers()
  } catch (error: any) {
    showError(error.response?.data?.message || error.response?.data?.error || 'Failed to delete superadmin')
  } finally {
    deletingSuperadmin.value = false
  }
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

function formatDate(dateString: string): string {
  return new Date(dateString).toLocaleDateString()
}

function formatDateTime(dateString: string): string {
  return new Date(dateString).toLocaleString()
}

function formatRelativeTime(dateString: string): string {
  const date = new Date(dateString)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMins = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMins / 60)
  const diffDays = Math.floor(diffHours / 24)

  if (diffMins < 1) return 'Just now'
  if (diffMins < 60) return `${diffMins}m ago`
  if (diffHours < 24) return `${diffHours}h ago`
  if (diffDays < 7) return `${diffDays}d ago`
  return date.toLocaleDateString()
}

function formatAction(action: string): string {
  return adminActionLabels[action] || action.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
}

function getActionIcon(action: string): string {
  const icons: Record<string, string> = {
    add_user: 'pi-user-plus',
    remove_user: 'pi-user-minus',
    update_role: 'pi-user-edit',
    resend_verification: 'pi-envelope',
    reset_password: 'pi-key',
    revoke_tokens: 'pi-ban',
    unlock_user: 'pi-unlock',
    create_superadmin: 'pi-shield',
    update_superadmin: 'pi-pencil',
    delete_superadmin: 'pi-trash'
  }
  return icons[action] || 'pi-info-circle'
}

function getActionColor(action: string): string {
  const colors: Record<string, string> = {
    add_user: 'text-success-600',
    remove_user: 'text-error-600',
    update_role: 'text-warning-600',
    resend_verification: 'text-brand-600',
    reset_password: 'text-warning-600',
    revoke_tokens: 'text-error-600',
    unlock_user: 'text-success-600',
    create_superadmin: 'text-success-600',
    update_superadmin: 'text-brand-600',
    delete_superadmin: 'text-error-600'
  }
  return colors[action] || 'text-gray-600'
}

function formatDetails(details: Record<string, unknown>): string {
  if (!details || Object.keys(details).length === 0) return '-'
  const str = JSON.stringify(details)
  return str.length > 40 ? str.slice(0, 40) + '...' : str
}

async function openInviteDialog() {
  inviteForm.email = ''
  inviteForm.name = ''
  inviteForm.appId = null
  inviteForm.role = 'user'
  inviteError.value = ''
  showInviteUserDialog.value = true
  // Load apps for the selector
  if (apps.value.length === 0) {
    loadingApps.value = true
    try {
      const response = await getApps()
      apps.value = response.apps || []
    } catch {
      showError('Failed to load applications')
    } finally {
      loadingApps.value = false
    }
  }
}

async function submitInviteUser() {
  if (!inviteForm.appId || !inviteForm.email) return
  inviteError.value = ''
  invitingUser.value = true
  try {
    const response = await addUserToApp(inviteForm.appId, {
      email: inviteForm.email.trim(),
      name: inviteForm.name.trim() || undefined,
      role: inviteForm.role
    })
    inviteResult.value = {
      userId: response.user_id,
      inviteToken: response.invite_token,
      role: response.role
    }
    showInviteUserDialog.value = false
    showInviteResultDialog.value = true
  } catch (error: any) {
    inviteError.value = error.response?.data?.message || error.response?.data?.error || 'Failed to invite user'
  } finally {
    invitingUser.value = false
  }
}

async function copyToken(token: string) {
  try {
    await navigator.clipboard.writeText(token)
    showSuccess('Invite token copied to clipboard')
  } catch {
    showError('Failed to copy — please copy the token manually')
  }
}

// Watch tab changes
watch(activeTab, (newTab) => {
  if (newTab === '0' && users.value.length === 0) {
    loadUsers()
  } else if (newTab === '1' && superadmins.value.length === 0) {
    loadSuperadmins()
  } else if (newTab === '2' && activityLogs.value.length === 0) {
    loadActivityLogs()
  }
})

// Lifecycle
onMounted(() => {
  loadUsers()
  loadSuperadmins() // Also load superadmins for the stats
})
</script>
