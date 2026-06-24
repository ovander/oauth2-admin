<template>
  <div class="text-center py-12">
    <div
      class="w-16 h-16 mx-auto mb-4 rounded-full bg-gray-100 dark:bg-brand-800 flex items-center justify-center"
    >
      <i :class="['pi', icon, 'text-2xl text-gray-400 dark:text-brand-500']"></i>
    </div>
    <h3 class="text-lg font-semibold text-gray-900 dark:text-white mb-1">
      {{ title }}
    </h3>
    <p class="text-gray-500 dark:text-brand-400 max-w-sm mx-auto mb-6">
      {{ description }}
    </p>
    <slot name="action">
      <Button
        v-if="actionLabel"
        :label="actionLabel"
        :icon="actionIcon"
        class="btn-primary"
        @click="$emit('action')"
      />
    </slot>
  </div>
</template>

<script setup lang="ts">
import Button from 'primevue/button'

defineProps<{
  icon: string
  title: string
  description: string
  actionLabel?: string
  actionIcon?: string
}>()

defineEmits<{
  action: []
}>()
</script>
