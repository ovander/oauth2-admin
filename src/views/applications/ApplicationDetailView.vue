<template>
  <div>
    <!-- Loading -->
    <LoadingState v-if="loading" message="Loading application..." />

    <!-- Not Found -->
    <EmptyState
      v-else-if="!app"
      icon="pi-exclamation-triangle"
      title="Application not found"
      description="The application you're looking for doesn't exist or you don't have access."
    >
      <Button
        label="Back to Applications"
        icon="pi pi-arrow-left"
        @click="$router.push({ name: 'Applications' })"
      />
    </EmptyState>

    <!-- Content -->
    <template v-else>
      <!-- Header -->
      <div class="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 mb-6">
        <div class="flex items-center gap-4">
          <Button
            icon="pi pi-arrow-left"
            severity="secondary"
            text
            rounded
            @click="$router.push({ name: 'Applications' })"
          />
          <div class="w-14 h-14 rounded-xl bg-gradient-to-br from-brand-500 to-brand-700 flex items-center justify-center text-white font-bold text-xl">
            {{ getAppInitials(app.name) }}
          </div>
          <div>
            <h1 class="text-2xl font-bold text-gray-900 dark:text-white">{{ app.name }}</h1>
            <div class="flex items-center gap-2 mt-1">
              <span class="text-sm font-mono text-gray-500 dark:text-brand-400">{{ app.client_id }}</span>
              <Button
                icon="pi pi-copy"
                text
                rounded
                size="small"
                @click="copyToClipboard(app.client_id, 'Client ID')"
              />
            </div>
          </div>
        </div>
        <div class="flex items-center gap-2">
          <span
            class="px-3 py-1 text-sm font-medium rounded-full"
            :class="app.active
              ? 'bg-success-100 text-success-700 dark:bg-success-900/30 dark:text-success-400'
              : 'bg-gray-100 text-gray-600 dark:bg-brand-800 dark:text-brand-400'"
          >
            {{ app.active ? 'Active' : 'Inactive' }}
          </span>
          <span
            v-if="app.is_public"
            class="px-3 py-1 text-sm font-semibold rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400"
          >PUBLIC</span>
          <span
            v-if="app.require_pkce"
            class="px-3 py-1 text-sm font-semibold rounded-full bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400"
          >PKCE</span>
          <Button
            :label="app.active ? 'Deactivate' : 'Activate'"
            :icon="app.active ? 'pi pi-pause' : 'pi pi-play'"
            :severity="app.active ? 'warn' : 'success'"
            outlined
            @click="toggleActive"
            :loading="toggling"
          />
          <Button
            icon="pi pi-trash"
            severity="danger"
            outlined
            @click="confirmDelete"
            v-tooltip="'Delete Application'"
          />
        </div>
      </div>

      <!-- Tabs (PrimeVue 4) -->
      <Tabs v-model:value="activeTab">
        <TabList>
          <Tab value="0">Settings</Tab>
          <Tab value="1">Users</Tab>
          <Tab value="2">Activity</Tab>
        </TabList>
        <TabPanels>
          <!-- Settings Tab -->
          <TabPanel value="0">
            <div class="grid grid-cols-1 lg:grid-cols-2 gap-6 p-4">
              <!-- App Details Form -->
              <div class="card p-6">
                <h3 class="text-lg font-semibold text-gray-900 dark:text-white mb-4">Application Details</h3>
                <form @submit.prevent="saveSettings" class="space-y-4">
                  <div>
                    <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Name</label>
                    <InputText v-model="editForm.name" class="w-full" />
                  </div>
                  <div>
                    <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">URL</label>
                    <InputText v-model="editForm.url" placeholder="https://myapp.example.com" class="w-full" />
                  </div>
                  <div>
                    <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Redirect URIs</label>
                    <div class="space-y-2">
                      <div v-for="(_uri, index) in editForm.redirect_uris" :key="index" class="flex gap-2">
                        <InputText v-model="editForm.redirect_uris[index]" placeholder="https://myapp.example.com/callback" class="flex-1" />
                        <Button icon="pi pi-trash" severity="danger" outlined @click="removeRedirectUri(index)" />
                      </div>
                      <Button label="Add URI" icon="pi pi-plus" severity="secondary" outlined size="small" @click="addRedirectUri" />
                    </div>
                  </div>
                  <div class="pt-4 border-t border-gray-100 dark:border-brand-800">
                    <Button type="submit" label="Save Changes" icon="pi pi-check" :loading="saving" />
                  </div>
                </form>
              </div>

              <!-- Credentials -->
              <div class="card p-6">
                <h3 class="text-lg font-semibold text-gray-900 dark:text-white mb-4">Credentials</h3>
                
                <div class="space-y-4">
                  <div>
                    <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Client ID</label>
                    <div class="flex gap-2">
                      <InputText :modelValue="app.client_id" readonly class="flex-1 font-mono text-sm" />
                      <Button icon="pi pi-copy" severity="secondary" outlined @click="copyToClipboard(app.client_id, 'Client ID')" />
                    </div>
                  </div>

                  <!-- Client Secret — confidential clients only -->
                  <div v-if="!app.is_public">
                    <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Client Secret</label>
                    <div v-if="newSecret" class="space-y-2">
                      <div class="p-3 bg-warning-50 dark:bg-warning-900/20 border border-warning-200 dark:border-warning-800 rounded-lg">
                        <p class="text-sm text-warning-700 dark:text-warning-300 font-medium mb-2">
                          <i class="pi pi-exclamation-triangle mr-1"></i>
                          New secret generated! Copy it now — you won't see it again.
                        </p>
                      </div>
                      <div class="flex gap-2">
                        <InputText :modelValue="newSecret" readonly class="flex-1 font-mono text-sm text-warning-600" />
                        <Button icon="pi pi-copy" severity="warn" @click="copyToClipboard(newSecret, 'Client Secret')" />
                      </div>
                    </div>
                    <div v-else class="flex gap-2">
                      <InputText modelValue="••••••••••••••••••••••••••••••••" readonly class="flex-1 font-mono text-sm" />
                      <Button label="Rotate Secret" icon="pi pi-refresh" severity="warn" outlined @click="confirmRotateSecret" :loading="rotating" />
                    </div>
                  </div>

                  <!-- Public client notice (no secret) -->
                  <div v-else>
                    <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Client Secret</label>
                    <div class="p-3 bg-brand-50 dark:bg-brand-900/20 border border-brand-200 dark:border-brand-800 rounded-lg">
                      <p class="text-sm text-brand-700 dark:text-brand-300">
                        <i class="pi pi-shield mr-1"></i>
                        Public client — PKCE only, no secret
                      </p>
                    </div>
                  </div>
                </div>

                <!-- Info -->
                <div class="mt-6 pt-4 border-t border-gray-100 dark:border-brand-800">
                  <div class="space-y-2 text-sm text-gray-500 dark:text-brand-400">
                    <p><strong>Owner ID:</strong> {{ app.owner_id || 'N/A' }}</p>
                    <p><strong>Created:</strong> {{ formatDateTime(app.created_at) }}</p>
                    <p>
                      <strong>Client type:</strong>
                      <span
                        class="ml-2 px-2 py-0.5 text-xs font-semibold rounded-full"
                        :class="app.is_public
                          ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400'
                          : 'bg-gray-100 text-gray-600 dark:bg-brand-800 dark:text-brand-400'"
                      >{{ app.is_public ? 'Public' : 'Confidential' }}</span>
                    </p>
                    <p>
                      <strong>PKCE required:</strong>
                      <span
                        class="ml-2 px-2 py-0.5 text-xs font-semibold rounded-full"
                        :class="app.require_pkce
                          ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'
                          : 'bg-gray-100 text-gray-600 dark:bg-brand-800 dark:text-brand-400'"
                      >{{ app.require_pkce ? 'Yes' : 'No' }}</span>
                      <span v-if="app.is_public" class="ml-1 text-xs text-gray-400 dark:text-brand-500">(immutable on public clients)</span>
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </TabPanel>

          <!-- Users Tab -->
          <TabPanel value="1">
            <div class="p-4">
              <!-- Add User Form -->
              <div class="card p-4 mb-6">
                <h4 class="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">
                  <i class="pi pi-user-plus mr-2"></i>Add User to Application
                </h4>
                <div class="grid grid-cols-1 sm:grid-cols-4 gap-4">
                  <div class="sm:col-span-1">
                    <InputText 
                      v-model="newUserEmail" 
                      placeholder="user@example.com" 
                      class="w-full"
                      :class="{ 'p-invalid': userAddError }"
                    />
                  </div>
                  <div class="sm:col-span-1">
                    <InputText v-model="newUserName" placeholder="Name (optional)" class="w-full" />
                  </div>
                  <div class="sm:col-span-1">
                    <Select 
                      v-model="newUserRole" 
                      :options="roleOptions" 
                      optionLabel="label" 
                      optionValue="value" 
                      class="w-full" 
                    />
                  </div>
                  <div class="sm:col-span-1">
                    <Button 
                      label="Add User" 
                      icon="pi pi-user-plus" 
                      class="w-full"
                      @click="addUser" 
                      :loading="addingUser" 
                      :disabled="!newUserEmail" 
                    />
                  </div>
                </div>
                <small v-if="userAddError" class="text-error-600 text-xs mt-1">{{ userAddError }}</small>
              </div>

              <!-- Users Stats & Filters -->
              <div class="card p-4 mb-4">
                <div class="flex flex-col sm:flex-row gap-4 justify-between items-start sm:items-center">
                  <div class="flex items-center gap-4">
                    <div class="text-center px-4 py-2 bg-brand-50 dark:bg-brand-900/20 rounded-lg">
                      <p class="text-xl font-bold text-brand-600 dark:text-brand-400">{{ users.length }}</p>
                      <p class="text-xs text-gray-500 dark:text-brand-400">Total</p>
                    </div>
                    <div class="text-center px-4 py-2 bg-warning-50 dark:bg-warning-900/20 rounded-lg">
                      <p class="text-xl font-bold text-warning-600 dark:text-warning-400">{{ adminUsers.length }}</p>
                      <p class="text-xs text-gray-500 dark:text-brand-400">Admins</p>
                    </div>
                    <div class="text-center px-4 py-2 bg-gray-50 dark:bg-brand-800 rounded-lg">
                      <p class="text-xl font-bold text-gray-600 dark:text-gray-300">{{ regularUsers.length }}</p>
                      <p class="text-xs text-gray-500 dark:text-brand-400">Members</p>
                    </div>
                  </div>
                  <div class="flex gap-2 w-full sm:w-auto">
                    <span class="p-input-icon-left flex-1 sm:flex-initial">
                      <i class="pi pi-search" />
                      <InputText v-model="userSearch" placeholder="Search users..." class="w-full sm:w-48" />
                    </span>
                    <Select 
                      v-model="userRoleFilter" 
                      :options="filterOptions" 
                      optionLabel="label" 
                      optionValue="value" 
                      class="w-32" 
                    />
                    <Button icon="pi pi-refresh" severity="secondary" outlined @click="loadUsers" :loading="loadingUsers" v-tooltip="'Refresh'" />
                  </div>
                </div>
              </div>

              <!-- Admins Section -->
              <div v-if="(userRoleFilter === 'all' || userRoleFilter === 'admin') && filteredAdmins.length > 0" class="mb-6">
                <div class="flex items-center gap-2 mb-3">
                  <div class="w-8 h-8 rounded-lg bg-warning-100 dark:bg-warning-900/30 flex items-center justify-center">
                    <i class="pi pi-shield text-warning-600 dark:text-warning-400"></i>
                  </div>
                  <h4 class="font-semibold text-gray-900 dark:text-white">Admins ({{ filteredAdmins.length }})</h4>
                </div>
                <div class="card divide-y divide-gray-100 dark:divide-brand-800">
                  <div 
                    v-for="user in filteredAdmins" 
                    :key="user.id" 
                    class="p-4 hover:bg-gray-50 dark:hover:bg-brand-800/50 transition-colors"
                  >
                    <div class="flex items-center justify-between">
                      <div class="flex items-center gap-3">
                        <div class="w-10 h-10 rounded-full bg-warning-100 dark:bg-warning-900/30 flex items-center justify-center text-warning-600 dark:text-warning-400 font-semibold text-sm">
                          {{ getInitials(user.name || user.email) }}
                        </div>
                        <div>
                          <div class="flex items-center gap-2">
                            <p class="font-medium text-gray-900 dark:text-white">{{ user.email }}</p>
                            <span class="px-2 py-0.5 text-xs font-medium rounded-full bg-warning-100 text-warning-700 dark:bg-warning-900/30 dark:text-warning-400">
                              Admin
                            </span>
                          </div>
                          <div class="flex items-center gap-3 text-xs text-gray-500 dark:text-brand-400 mt-1">
                            <span>{{ user.name || '-' }}</span>
                            <span class="flex items-center gap-1">
                              <i :class="user.is_verified ? 'pi pi-check-circle text-success-500' : 'pi pi-clock text-warning-500'"></i>
                              {{ user.is_verified ? 'Verified' : 'Pending' }}
                            </span>
                            <span>Last login: {{ user.last_login ? formatRelativeTime(user.last_login) : 'Never' }}</span>
                          </div>
                        </div>
                      </div>
                      <div class="flex items-center gap-2">
                        <Button
                          label="Demote to User"
                          icon="pi pi-arrow-down"
                          severity="secondary"
                          outlined
                          size="small"
                          @click="demoteUser(user)"
                          v-tooltip="'Remove admin privileges'"
                        />
                        <Button
                          icon="pi pi-key"
                          severity="warn"
                          text
                          rounded
                          size="small"
                          @click="resetPassword(user.id)"
                          v-tooltip="'Reset Password'"
                        />
                        <Button
                          icon="pi pi-trash"
                          severity="danger"
                          text
                          rounded
                          size="small"
                          @click="confirmRemoveUser(user)"
                          v-tooltip="'Remove from App'"
                        />
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <!-- Users Section -->
              <div v-if="(userRoleFilter === 'all' || userRoleFilter === 'user') && filteredRegularUsers.length > 0">
                <div class="flex items-center gap-2 mb-3">
                  <div class="w-8 h-8 rounded-lg bg-brand-100 dark:bg-brand-800 flex items-center justify-center">
                    <i class="pi pi-user text-brand-600 dark:text-brand-400"></i>
                  </div>
                  <h4 class="font-semibold text-gray-900 dark:text-white">Members ({{ filteredRegularUsers.length }})</h4>
                </div>
                <div class="card divide-y divide-gray-100 dark:divide-brand-800">
                  <div 
                    v-for="user in filteredRegularUsers" 
                    :key="user.id" 
                    class="p-4 hover:bg-gray-50 dark:hover:bg-brand-800/50 transition-colors"
                  >
                    <div class="flex items-center justify-between">
                      <div class="flex items-center gap-3">
                        <div class="w-10 h-10 rounded-full bg-brand-100 dark:bg-brand-800 flex items-center justify-center text-brand-600 dark:text-brand-400 font-semibold text-sm">
                          {{ getInitials(user.name || user.email) }}
                        </div>
                        <div>
                          <div class="flex items-center gap-2">
                            <p class="font-medium text-gray-900 dark:text-white">{{ user.email }}</p>
                            <span class="px-2 py-0.5 text-xs font-medium rounded-full bg-gray-100 text-gray-600 dark:bg-brand-800 dark:text-brand-400 capitalize">
                              {{ user.role }}
                            </span>
                          </div>
                          <div class="flex items-center gap-3 text-xs text-gray-500 dark:text-brand-400 mt-1">
                            <span>{{ user.name || '-' }}</span>
                            <span class="flex items-center gap-1">
                              <i :class="user.is_verified ? 'pi pi-check-circle text-success-500' : 'pi pi-clock text-warning-500'"></i>
                              {{ user.is_verified ? 'Verified' : 'Pending' }}
                            </span>
                            <span>Last login: {{ user.last_login ? formatRelativeTime(user.last_login) : 'Never' }}</span>
                          </div>
                        </div>
                      </div>
                      <div class="flex items-center gap-2">
                        <Button
                          v-if="!user.is_verified"
                          label="Resend Invite"
                          icon="pi pi-envelope"
                          severity="info"
                          outlined
                          size="small"
                          @click="resendVerification(user.id)"
                          v-tooltip="'Resend verification email'"
                        />
                        <Button
                          label="Promote to Admin"
                          icon="pi pi-arrow-up"
                          severity="warn"
                          outlined
                          size="small"
                          @click="promoteUser(user)"
                          v-tooltip="'Grant admin privileges'"
                        />
                        <Button
                          icon="pi pi-key"
                          severity="warn"
                          text
                          rounded
                          size="small"
                          @click="resetPassword(user.id)"
                          v-tooltip="'Reset Password'"
                        />
                        <Button
                          icon="pi pi-trash"
                          severity="danger"
                          text
                          rounded
                          size="small"
                          @click="confirmRemoveUser(user)"
                          v-tooltip="'Remove from App'"
                        />
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <!-- Error State -->
              <div v-if="usersError" class="card p-6 border border-error-200 dark:border-error-800 bg-error-50 dark:bg-error-900/20">
                <div class="flex items-start gap-3">
                  <i class="pi pi-exclamation-triangle text-xl text-error-600 mt-0.5"></i>
                  <div>
                    <p class="font-medium text-error-800 dark:text-error-200">Failed to load users</p>
                    <p class="text-sm text-error-600 dark:text-error-400 font-mono mt-1">{{ usersError }}</p>
                    <Button label="Retry" icon="pi pi-refresh" severity="danger" outlined size="small" class="mt-3" @click="loadUsers" />
                  </div>
                </div>
              </div>

              <!-- Empty State -->
              <div v-else-if="filteredUsers.length === 0 && !loadingUsers" class="card p-8 text-center">
                <i class="pi pi-users text-4xl text-gray-300 dark:text-brand-600 mb-4"></i>
                <p class="text-gray-500 dark:text-brand-400" v-if="userSearch || userRoleFilter !== 'all'">
                  No users match your filter criteria
                </p>
                <p class="text-gray-500 dark:text-brand-400" v-else>
                  No users in this application yet
                </p>
                <p class="text-sm text-gray-400 dark:text-brand-500 mt-1">
                  {{ userSearch || userRoleFilter !== 'all' ? 'Try adjusting your search or filter' : 'Add users above to grant them access' }}
                </p>
              </div>
            </div>
          </TabPanel>

          <!-- Activity Tab -->
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
                      <span class="font-semibold">Activity Logs</span>
                      <Button icon="pi pi-refresh" severity="secondary" text size="small" @click="loadActivityLogs" :loading="loadingLogs" />
                    </div>
                  </template>
                  <Column field="created_at" header="Time" sortable style="width: 180px">
                    <template #body="{ data }">
                      <span class="text-sm">{{ formatDateTime(data.created_at) }}</span>
                    </template>
                  </Column>
                  <Column field="event_type" header="Event">
                    <template #body="{ data }">
                      <div class="flex items-center gap-2">
                        <i :class="['pi text-sm', getEventIcon(data.event_type), getEventColor(data.success)]"></i>
                        <span class="font-medium">{{ formatEventType(data.event_type) }}</span>
                      </div>
                    </template>
                  </Column>
                  <Column field="event_category" header="Category" style="width: 100px">
                    <template #body="{ data }">
                      <span class="text-xs text-gray-500 dark:text-brand-400 uppercase">{{ data.event_category }}</span>
                    </template>
                  </Column>
                  <Column field="user_id" header="User" style="width: 100px">
                    <template #body="{ data }">
                      <span class="text-sm">{{ data.user_id ? `#${data.user_id}` : '-' }}</span>
                    </template>
                  </Column>
                  <Column field="ip_address" header="IP Address" style="width: 130px">
                    <template #body="{ data }">
                      <span class="font-mono text-xs">{{ data.ip_address }}</span>
                    </template>
                  </Column>
                  <Column field="success" header="Status" style="width: 90px">
                    <template #body="{ data }">
                      <span class="badge-success text-xs" v-if="data.success">Success</span>
                      <span class="badge-error text-xs" v-else>Failed</span>
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
    </template>

    <!-- Delete App Confirmation Dialog -->
    <Dialog v-model:visible="showDeleteDialog" modal header="Delete Application" :style="{ width: '450px' }">
      <div class="flex items-start gap-4">
        <div class="w-12 h-12 rounded-full bg-error-100 dark:bg-error-900/30 flex items-center justify-center shrink-0">
          <i class="pi pi-exclamation-triangle text-2xl text-error-600"></i>
        </div>
        <div>
          <p class="text-gray-700 dark:text-gray-300">
            Are you sure you want to delete <strong>{{ app?.name }}</strong>?
          </p>
          <p class="text-sm text-gray-500 dark:text-brand-400 mt-2">
            This will permanently delete the application and invalidate all associated tokens. This action cannot be undone.
          </p>
        </div>
      </div>
      <template #footer>
        <Button label="Cancel" severity="secondary" outlined @click="showDeleteDialog = false" />
        <Button label="Delete Application" severity="danger" icon="pi pi-trash" @click="deleteApplication" :loading="deleting" />
      </template>
    </Dialog>

    <!-- Rotate Secret Confirmation -->
    <Dialog v-model:visible="showRotateDialog" modal header="Rotate Client Secret" :style="{ width: '450px' }">
      <div class="flex items-start gap-4">
        <div class="w-12 h-12 rounded-full bg-warning-100 dark:bg-warning-900/30 flex items-center justify-center shrink-0">
          <i class="pi pi-refresh text-2xl text-warning-600"></i>
        </div>
        <div>
          <p class="text-gray-700 dark:text-gray-300">
            Generate a new client secret for <strong>{{ app?.name }}</strong>?
          </p>
          <p class="text-sm text-gray-500 dark:text-brand-400 mt-2">
            The old secret will be immediately invalidated. Make sure to update your application configuration with the new secret.
          </p>
        </div>
      </div>
      <template #footer>
        <Button label="Cancel" severity="secondary" outlined @click="showRotateDialog = false" />
        <Button label="Rotate Secret" severity="warn" icon="pi pi-refresh" @click="rotateSecret" :loading="rotating" />
      </template>
    </Dialog>

    <!-- Remove User Confirmation -->
    <Dialog v-model:visible="showRemoveUserDialog" modal header="Remove User from App" :style="{ width: '450px' }">
      <div class="flex items-start gap-4">
        <div class="w-12 h-12 rounded-full bg-error-100 dark:bg-error-900/30 flex items-center justify-center shrink-0">
          <i class="pi pi-user-minus text-2xl text-error-600"></i>
        </div>
        <div>
          <p class="text-gray-700 dark:text-gray-300">
            Remove <strong>{{ userToRemove?.email }}</strong> from this application?
          </p>
          <p class="text-sm text-gray-500 dark:text-brand-400 mt-2">
            They will lose access to this app. Their account will remain active and they may still have access to other apps.
          </p>
        </div>
      </div>
      <template #footer>
        <Button label="Cancel" severity="secondary" outlined @click="showRemoveUserDialog = false" />
        <Button label="Remove User" severity="danger" icon="pi pi-trash" @click="removeUser" :loading="removingUser" />
      </template>
    </Dialog>

    <!-- Invite Token Dialog -->
    <Dialog v-model:visible="showInviteDialog" modal header="User Added Successfully" :style="{ width: '500px' }">
      <div class="space-y-4">
        <div class="p-4 bg-success-50 dark:bg-success-900/20 border border-success-200 dark:border-success-800 rounded-lg">
          <div class="flex items-center gap-3">
            <i class="pi pi-check-circle text-2xl text-success-600"></i>
            <div>
              <p class="font-medium text-success-800 dark:text-success-200">User added to application</p>
              <p class="text-sm text-success-700 dark:text-success-300">
                {{ lastAddedUser?.isNew ? 'A new account was created.' : 'Existing user was assigned to this app.' }}
              </p>
            </div>
          </div>
        </div>

        <div v-if="lastAddedUser?.inviteToken">
          <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Invite Token</label>
          <div class="p-3 bg-gray-50 dark:bg-brand-800 rounded-lg border border-gray-200 dark:border-brand-700">
            <p class="text-xs text-gray-500 dark:text-brand-400 mb-2">
              Share this token with the user so they can set up their account:
            </p>
            <div class="flex gap-2">
              <InputText 
                :modelValue="lastAddedUser.inviteToken" 
                readonly 
                class="flex-1 font-mono text-xs"
              />
              <Button 
                icon="pi pi-copy" 
                severity="secondary" 
                @click="copyToClipboard(lastAddedUser.inviteToken, 'Invite Token')" 
              />
            </div>
          </div>
        </div>

        <div class="text-sm text-gray-500 dark:text-brand-400">
          <p><strong>User ID:</strong> {{ lastAddedUser?.userId }}</p>
          <p><strong>Role:</strong> {{ lastAddedUser?.role === 'admin' ? 'Admin' : 'User' }}</p>
        </div>
      </div>
      <template #footer>
        <Button label="Done" icon="pi pi-check" @click="showInviteDialog = false" />
      </template>
    </Dialog>

    <!-- Promote/Demote Confirmation -->
    <Dialog v-model:visible="showRoleChangeDialog" modal :header="roleChangeAction === 'promote' ? 'Promote to Admin' : 'Demote to User'" :style="{ width: '450px' }">
      <div class="flex items-start gap-4">
        <div 
          class="w-12 h-12 rounded-full flex items-center justify-center shrink-0"
          :class="roleChangeAction === 'promote' ? 'bg-warning-100 dark:bg-warning-900/30' : 'bg-brand-100 dark:bg-brand-800'"
        >
          <i 
            :class="['pi text-2xl', roleChangeAction === 'promote' ? 'pi-arrow-up text-warning-600' : 'pi-arrow-down text-brand-600']"
          ></i>
        </div>
        <div>
          <p class="text-gray-700 dark:text-gray-300">
            {{ roleChangeAction === 'promote' ? 'Promote' : 'Demote' }} <strong>{{ userToChangeRole?.email }}</strong> 
            to {{ roleChangeAction === 'promote' ? 'Admin' : 'User' }}?
          </p>
          <p class="text-sm text-gray-500 dark:text-brand-400 mt-2">
            <template v-if="roleChangeAction === 'promote'">
              They will gain the ability to manage other users within this app.
            </template>
            <template v-else>
              They will lose the ability to manage other users within this app.
            </template>
          </p>
        </div>
      </div>
      <template #footer>
        <Button label="Cancel" severity="secondary" outlined @click="showRoleChangeDialog = false" />
        <Button 
          :label="roleChangeAction === 'promote' ? 'Promote to Admin' : 'Demote to User'" 
          :severity="roleChangeAction === 'promote' ? 'warn' : 'secondary'"
          :icon="roleChangeAction === 'promote' ? 'pi pi-arrow-up' : 'pi pi-arrow-down'" 
          @click="executeRoleChange" 
          :loading="changingRole" 
        />
      </template>
    </Dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onMounted, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import Button from 'primevue/button'
import InputText from 'primevue/inputtext'
import Select from 'primevue/select'
import Tabs from 'primevue/tabs'
import TabList from 'primevue/tablist'
import Tab from 'primevue/tab'
import TabPanels from 'primevue/tabpanels'
import TabPanel from 'primevue/tabpanel'
import DataTable from 'primevue/datatable'
import Column from 'primevue/column'
import Dialog from 'primevue/dialog'
import LoadingState from '@/components/ui/LoadingState.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import { useToast } from '@/composables/useToast'
import {
  getApp,
  updateApp,
  deleteApp,
  rotateAppSecret,
  getAppUsers,
  addUserToApp,
  updateAppUserRole,
  removeUserFromApp,
  resendVerificationEmail,
  forcePasswordReset,
  getAppActivityLogs
} from '@/services/applicationService'
import type { App, AppUser, AppActivityLog, AppUserRole } from '@/types/application'

const route = useRoute()
const router = useRouter()
const { showSuccess, showError } = useToast()

// State
const loading = ref(true)
const saving = ref(false)
const toggling = ref(false)
const deleting = ref(false)
const rotating = ref(false)
const loadingUsers = ref(false)
const loadingLogs = ref(false)
const addingUser = ref(false)
const removingUser = ref(false)
const changingRole = ref(false)

const app = ref<App | null>(null)
const users = ref<AppUser[]>([])
const activityLogs = ref<AppActivityLog[]>([])
const activeTab = ref('0')
const newSecret = ref('')
const userAddError = ref('')
const userSearch = ref('')
const userRoleFilter = ref('all')
const usersError = ref('')

// Dialogs
const showDeleteDialog = ref(false)
const showRotateDialog = ref(false)
const showRemoveUserDialog = ref(false)
const showInviteDialog = ref(false)
const showRoleChangeDialog = ref(false)
const userToRemove = ref<AppUser | null>(null)
const userToChangeRole = ref<AppUser | null>(null)
const roleChangeAction = ref<'promote' | 'demote'>('promote')
const lastAddedUser = ref<{ userId: number; inviteToken: string; role: string; isNew: boolean } | null>(null)

// Edit form
const editForm = reactive({
  name: '',
  url: '',
  redirect_uris: ['']
})

// Add user form
const newUserEmail = ref('')
const newUserName = ref('')
const newUserRole = ref<AppUserRole>('user')

const roleOptions = [
  { label: 'User', value: 'user' },
  { label: 'Admin', value: 'admin' }
]

const filterOptions = [
  { label: 'All', value: 'all' },
  { label: 'Admins', value: 'admin' },
  { label: 'Users', value: 'user' }
]

// Computed
const adminUsers = computed(() => users.value.filter(u => u.role === 'admin'))
const regularUsers = computed(() => users.value.filter(u => u.role !== 'admin'))

const filteredUsers = computed(() => {
  let result = users.value
  
  // Role filter — 'admin' matches exactly; 'user' catches anything that isn't 'admin'
  if (userRoleFilter.value === 'admin') {
    result = result.filter(u => u.role === 'admin')
  } else if (userRoleFilter.value === 'user') {
    result = result.filter(u => u.role !== 'admin')
  }
  
  // Search filter
  if (userSearch.value) {
    const search = userSearch.value.toLowerCase()
    result = result.filter(u => 
      u.email.toLowerCase().includes(search) ||
      (u.name && u.name.toLowerCase().includes(search))
    )
  }
  
  return result
})

const filteredAdmins = computed(() => filteredUsers.value.filter(u => u.role === 'admin'))
const filteredRegularUsers = computed(() => filteredUsers.value.filter(u => u.role !== 'admin'))

// Methods
async function loadApplication() {
  const id = Number(route.params.id)
  if (!id) return

  try {
    app.value = await getApp(id)
    editForm.name = app.value.name
    editForm.url = app.value.url || ''
    editForm.redirect_uris = app.value.redirect_uris?.length ? [...app.value.redirect_uris] : ['']
  } catch (error) {
    console.error('Load app error:', error)
    app.value = null
  } finally {
    loading.value = false
  }
}

async function loadUsers() {
  if (!app.value) return
  usersError.value = ''
  loadingUsers.value = true
  try {
    const response = await getAppUsers(app.value.id, { page: 1, page_size: 100 })
    users.value = response.users ?? []
  } catch (error: any) {
    const status = error?.response?.status
    const msg = error?.response?.data?.message || error?.response?.data?.error || error?.message || 'Unknown error'
    usersError.value = `${status ? `HTTP ${status}: ` : ''}${msg}`
  } finally {
    loadingUsers.value = false
  }
}

async function loadActivityLogs() {
  if (!app.value) return
  loadingLogs.value = true
  try {
    const response = await getAppActivityLogs(app.value.id, { page: 1, page_size: 100 })
    activityLogs.value = response.logs || []
  } catch (error) {
    console.error('Load logs error:', error)
  } finally {
    loadingLogs.value = false
  }
}

async function saveSettings() {
  if (!app.value) return
  saving.value = true
  try {
    const redirectUris = editForm.redirect_uris.filter(uri => uri.trim())
    await updateApp(app.value.id, {
      name: editForm.name,
      url: editForm.url || undefined,
      redirect_uris: redirectUris
    })
    app.value.name = editForm.name
    app.value.url = editForm.url
    app.value.redirect_uris = redirectUris
    showSuccess('Application updated successfully')
  } catch (error: any) {
    showError(error.response?.data?.message || 'Failed to update application')
  } finally {
    saving.value = false
  }
}

async function toggleActive() {
  if (!app.value) return
  toggling.value = true
  try {
    await updateApp(app.value.id, { active: !app.value.active })
    app.value.active = !app.value.active
    showSuccess(`Application ${app.value.active ? 'activated' : 'deactivated'}`)
  } catch (error: any) {
    showError(error.response?.data?.message || 'Failed to update application')
  } finally {
    toggling.value = false
  }
}

function confirmDelete() {
  showDeleteDialog.value = true
}

async function deleteApplication() {
  if (!app.value) return
  deleting.value = true
  try {
    await deleteApp(app.value.id)
    showSuccess('Application deleted successfully')
    router.push({ name: 'Applications' })
  } catch (error: any) {
    showError(error.response?.data?.message || 'Failed to delete application')
  } finally {
    deleting.value = false
    showDeleteDialog.value = false
  }
}

function confirmRotateSecret() {
  showRotateDialog.value = true
}

async function rotateSecret() {
  if (!app.value) return
  rotating.value = true
  try {
    const result = await rotateAppSecret(app.value.id)
    newSecret.value = result.client_secret
    showSuccess('Client secret rotated successfully')
  } catch (error: any) {
    showError(error.response?.data?.message || 'Failed to rotate secret')
  } finally {
    rotating.value = false
    showRotateDialog.value = false
  }
}

async function addUser() {
  if (!app.value || !newUserEmail.value) return
  
  userAddError.value = ''
  addingUser.value = true
  
  try {
    const response = await addUserToApp(app.value.id, {
      email: newUserEmail.value.trim(),
      name: newUserName.value.trim() || undefined,
      role: newUserRole.value
    })
    
    lastAddedUser.value = {
      userId: response.user_id,
      inviteToken: response.invite_token,
      role: response.role,
      isNew: true
    }
    
    showInviteDialog.value = true
    newUserEmail.value = ''
    newUserName.value = ''
    newUserRole.value = 'user'
    loadUsers()
    showSuccess('User added successfully')
  } catch (error: any) {
    const message = error.response?.data?.message || error.response?.data?.error || 'Failed to add user'
    userAddError.value = message
    showError(message)
  } finally {
    addingUser.value = false
  }
}

function promoteUser(user: AppUser) {
  userToChangeRole.value = user
  roleChangeAction.value = 'promote'
  showRoleChangeDialog.value = true
}

function demoteUser(user: AppUser) {
  userToChangeRole.value = user
  roleChangeAction.value = 'demote'
  showRoleChangeDialog.value = true
}

async function executeRoleChange() {
  if (!app.value || !userToChangeRole.value) return
  changingRole.value = true
  try {
    const newRole = roleChangeAction.value === 'promote' ? 'admin' : 'user'
    await updateAppUserRole(app.value.id, userToChangeRole.value.id, { role: newRole })
    showSuccess(`User ${roleChangeAction.value === 'promote' ? 'promoted to Admin' : 'demoted to User'}`)
    showRoleChangeDialog.value = false
    loadUsers()
  } catch (error: any) {
    showError(error.response?.data?.message || 'Failed to update role')
  } finally {
    changingRole.value = false
  }
}

function confirmRemoveUser(user: AppUser) {
  userToRemove.value = user
  showRemoveUserDialog.value = true
}

async function removeUser() {
  if (!app.value || !userToRemove.value) return
  removingUser.value = true
  try {
    await removeUserFromApp(app.value.id, userToRemove.value.id)
    showSuccess('User removed from application')
    loadUsers()
  } catch (error: any) {
    showError(error.response?.data?.message || 'Failed to remove user')
  } finally {
    removingUser.value = false
    showRemoveUserDialog.value = false
    userToRemove.value = null
  }
}

async function resendVerification(userId: number) {
  if (!app.value) return
  try {
    await resendVerificationEmail(app.value.id, userId)
    showSuccess('Verification email sent')
  } catch (error: any) {
    showError(error.response?.data?.message || 'Failed to send verification email')
  }
}

async function resetPassword(userId: number) {
  if (!app.value) return
  try {
    await forcePasswordReset(app.value.id, userId)
    showSuccess('Password reset email sent')
  } catch (error: any) {
    showError(error.response?.data?.message || 'Failed to send password reset')
  }
}

function addRedirectUri() {
  editForm.redirect_uris.push('')
}

function removeRedirectUri(index: number) {
  editForm.redirect_uris.splice(index, 1)
  if (editForm.redirect_uris.length === 0) {
    editForm.redirect_uris.push('')
  }
}

function copyToClipboard(text: string, label: string) {
  navigator.clipboard.writeText(text)
  showSuccess(`${label} copied to clipboard`)
}

function getAppInitials(name: string): string {
  return name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2)
}

function getInitials(name: string): string {
  return name.split(/[@\s]/).filter(Boolean).map(w => w[0]).join('').toUpperCase().slice(0, 2)
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

function formatEventType(type: string): string {
  return type.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
}

function getEventIcon(type: string): string {
  const icons: Record<string, string> = {
    login_success: 'pi-sign-in',
    login_failed: 'pi-times-circle',
    logout: 'pi-sign-out',
    token_refresh: 'pi-refresh',
    password_reset: 'pi-key',
    email_verified: 'pi-check-circle'
  }
  return icons[type] || 'pi-info-circle'
}

function getEventColor(success: boolean): string {
  return success ? 'text-success-600' : 'text-error-600'
}

// Activity logs are loaded lazily when the user switches to that tab
watch(activeTab, (newTab) => {
  if (newTab === '2' && activityLogs.value.length === 0) loadActivityLogs()
})

// Lifecycle — await the app before loading dependent data
onMounted(async () => {
  await loadApplication()
  // Users are always pre-fetched so the tab is ready instantly
  await loadUsers()
})
</script>
