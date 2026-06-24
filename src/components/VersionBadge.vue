<template>
  <div class="px-3 py-2 text-[10px] text-gray-400 dark:text-brand-600 leading-relaxed select-none">
    <div class="flex items-center gap-1.5 flex-wrap">
      <span class="font-mono">FE {{ clientVersion }}</span>
      <span class="opacity-40">·</span>
      <span class="font-mono" :class="fetchError ? 'text-error-400 dark:text-error-500' : ''">
        BE {{ backendVersion }}
      </span>
      <span
        v-if="fetchError"
        class="text-error-400 dark:text-error-500"
        v-tooltip.right="'Backend version endpoint unreachable'"
      >(offline)</span>
    </div>
    <div class="mt-0.5 opacity-60 font-mono truncate" :title="clientBuildDate">
      Built {{ formatBuildDate(clientBuildDate) }}
    </div>
  </div>
</template>

<script setup lang="ts">
import { useVersionInfo } from '@/composables/useVersionInfo'

const {
  clientVersion,
  clientBuildDate,
  backendVersion,
  fetchError,
} = useVersionInfo()

function formatBuildDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      month: 'short',
      day:   'numeric',
      year:  'numeric',
    })
  } catch {
    return iso
  }
}
</script>
