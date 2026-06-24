<template>
  <div :class="{ 'dark': isDark }">
    <Toast position="top-right" />
    <ConfirmDialog />
    <router-view />
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import Toast from 'primevue/toast'
import ConfirmDialog from 'primevue/confirmdialog'
import { useThemeStore } from '@/stores/themeStore'

const themeStore = useThemeStore()
const isDark = computed(() => themeStore.isDark)
</script>
