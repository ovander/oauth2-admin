<template>
  <div
    class="px-3 py-2 text-[10px] text-gray-400 dark:text-brand-600 leading-relaxed select-none"
    :title="tooltip"
    :aria-label="tooltip"
  >
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
    <div class="mt-0.5 opacity-60 font-mono truncate">
      Built {{ formatBuildDate(clientBuildDate) }}
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useVersionInfo, withVPrefix } from '@/composables/useVersionInfo'

const {
  clientVersion,
  clientBuildDate,
  clientBuildNode,
  clientBuildVite,
  backendVersion,
  backendCommit,
  backendBranch,
  backendBuildTime,
  backendGoVersion,
  backendLoaded,
  fetchError,
} = useVersionInfo()

const consoleLine =
  `Console ${withVPrefix(clientVersion)} — built ${clientBuildDate} ` +
  `with Node ${clientBuildNode}, Vite ${clientBuildVite}`

// Plain text only: bound to `title`/`aria-label`, which Vue escapes. Parts the
// server did not send (older servers have no go_version) are left out.
const serverLine = computed(() => {
  if (fetchError.value) return 'Server version unavailable'
  if (!backendLoaded.value) return 'Server version loading…'
  let line = `Server ${withVPrefix(backendVersion.value)}`
  const where = [backendCommit.value, backendBranch.value].filter(v => v && v !== '…').join(', ')
  if (where) line += ` (${where})`
  if (backendBuildTime.value || backendGoVersion.value) {
    line += ' — built'
    if (backendBuildTime.value) line += ` ${backendBuildTime.value}`
    if (backendGoVersion.value) line += ` with ${backendGoVersion.value}`
  }
  return line
})

const tooltip = computed(() => `${consoleLine}\n${serverLine.value}`)

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
