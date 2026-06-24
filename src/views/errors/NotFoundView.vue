<template>
  <div class="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-brand-950 px-4">
    <div class="text-center">
      <div class="w-24 h-24 mx-auto mb-6 bg-brand-100 dark:bg-brand-800 rounded-full flex items-center justify-center">
        <i class="pi pi-search text-4xl text-brand-600 dark:text-brand-400"></i>
      </div>
      
      <h1 class="text-6xl font-bold text-gray-900 dark:text-white mb-2">404</h1>
      <h2 class="text-2xl font-semibold text-gray-700 dark:text-gray-300 mb-4">
        Page Not Found
      </h2>
      <p class="text-gray-500 dark:text-brand-400 max-w-md mx-auto mb-8">
        The page you're looking for doesn't exist or has been moved. Check the URL or navigate back to safety.
      </p>
      
      <div class="flex items-center justify-center gap-3">
        <Button
          label="Go Back"
          icon="pi pi-arrow-left"
          class="btn-secondary"
          @click="$router.back()"
        />
        <Button
          label="Dashboard"
          icon="pi pi-home"
          class="btn-primary"
          @click="$router.push({ name: 'Dashboard' })"
        />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import Button from 'primevue/button'
</script>
