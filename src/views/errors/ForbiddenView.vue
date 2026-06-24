<template>
  <div class="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-brand-950 px-4">
    <div class="text-center">
      <div class="w-24 h-24 mx-auto mb-6 bg-error-100 dark:bg-error-900/30 rounded-full flex items-center justify-center">
        <i class="pi pi-lock text-4xl text-error-600 dark:text-error-400"></i>
      </div>
      
      <h1 class="text-6xl font-bold text-gray-900 dark:text-white mb-2">403</h1>
      <h2 class="text-2xl font-semibold text-gray-700 dark:text-gray-300 mb-4">
        Access Denied
      </h2>
      <p class="text-gray-500 dark:text-brand-400 max-w-md mx-auto mb-8">
        You don't have permission to access this resource. Please contact your administrator if you believe this is a mistake.
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
