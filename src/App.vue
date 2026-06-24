<template>
  <div :class="{ 'dark': isDark }">
    <Toast position="top-right" />
    <ConfirmDialog />
    <ElevationDialog />
    <router-view />
  </div>
</template>

<script setup lang="ts">
import { computed, watch } from 'vue'
import { useRouter } from 'vue-router'
import Toast from 'primevue/toast'
import ConfirmDialog from 'primevue/confirmdialog'
import ElevationDialog from '@/components/security/ElevationDialog.vue'
import { useThemeStore } from '@/stores/themeStore'
import { passwordChangeRequired } from '@/services/adminGuards'

const themeStore = useThemeStore()
const isDark = computed(() => themeStore.isDark)

// In-app trigger: when an XHR (no navigation) hits 403 password_change_required,
// route to the forced change-password page. Cold-load navigations are covered
// by the router guard; this covers actions taken while already on a page.
const router = useRouter()
watch(passwordChangeRequired, (required) => {
  if (required && router.currentRoute.value.name !== 'ChangePassword') {
    router.push({ name: 'ChangePassword' })
  }
})
</script>
