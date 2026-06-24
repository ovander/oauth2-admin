<template>
  <div class="min-h-screen flex">
    <!-- Left side - Branding -->
    <div class="hidden lg:flex lg:w-1/2 gradient-brand relative overflow-hidden">
      <!-- Decorative elements -->
      <div class="absolute inset-0 opacity-10">
        <div class="absolute top-20 left-20 w-72 h-72 bg-white rounded-full blur-3xl"></div>
        <div class="absolute bottom-20 right-20 w-96 h-96 bg-accent-400 rounded-full blur-3xl"></div>
      </div>
      
      <div class="relative z-10 flex flex-col justify-center px-12 xl:px-20">
        <!-- Logo -->
        <div class="flex items-center gap-3 mb-2">
          <div class="w-12 h-12 bg-white/20 backdrop-blur rounded-xl flex items-center justify-center overflow-hidden">
            <img src="/socrate-logo.png" alt="Socrate" class="w-full h-full object-contain p-1" />
          </div>
          <span class="text-2xl font-bold text-white">Socrate</span>
        </div>
        <span class="text-xs font-semibold text-brand-300 uppercase tracking-widest mb-10 ml-15">
          Superadmin Portal
        </span>
        
        <!-- Tagline -->
        <h1 class="text-4xl xl:text-5xl font-bold text-white leading-tight mb-6">
          Server-Level<br />
          Administration
        </h1>
        <p class="text-xl text-brand-200 max-w-md">
          Manage OAuth2 applications, global users, and server configuration with full superadmin privileges.
        </p>
        
        <!-- Features -->
        <div class="mt-12 space-y-4">
          <div class="flex items-center gap-3 text-brand-200">
            <div class="w-8 h-8 bg-white/10 rounded-lg flex items-center justify-center">
              <i class="pi pi-check text-accent-400"></i>
            </div>
            <span>Create & manage OAuth2 applications</span>
          </div>
          <div class="flex items-center gap-3 text-brand-200">
            <div class="w-8 h-8 bg-white/10 rounded-lg flex items-center justify-center">
              <i class="pi pi-check text-accent-400"></i>
            </div>
            <span>Global user administration</span>
          </div>
          <div class="flex items-center gap-3 text-brand-200">
            <div class="w-8 h-8 bg-white/10 rounded-lg flex items-center justify-center">
              <i class="pi pi-check text-accent-400"></i>
            </div>
            <span>Server security & audit logs</span>
          </div>
        </div>
        
        <!-- Warning banner -->
        <div class="mt-10 p-4 bg-amber-500/20 border border-amber-400/30 rounded-lg">
          <div class="flex items-start gap-3">
            <i class="pi pi-exclamation-triangle text-amber-400 mt-0.5"></i>
            <div class="text-sm text-amber-100">
              <p class="font-semibold">Restricted Access</p>
              <p class="text-amber-200/80">This portal is for superadmin users only. App admins should use their application's admin interface.</p>
            </div>
          </div>
        </div>
      </div>
    </div>
    
    <!-- Right side - Form -->
    <div class="flex-1 flex items-center justify-center p-8 bg-gray-50 dark:bg-brand-950">
      <div class="w-full max-w-md">
        <!-- Mobile logo -->
        <div class="lg:hidden flex flex-col items-center justify-center mb-10">
          <div class="flex items-center gap-3 mb-1">
            <div class="w-10 h-10 gradient-brand rounded-xl flex items-center justify-center overflow-hidden">
              <img src="/socrate-logo.png" alt="Socrate" class="w-full h-full object-contain p-0.5" />
            </div>
            <span class="text-xl font-bold text-gray-900 dark:text-white">Socrate</span>
          </div>
          <span class="text-[10px] font-semibold text-brand-600 dark:text-brand-400 uppercase tracking-widest">
            Superadmin Portal
          </span>
        </div>
        
        <router-view v-slot="{ Component }">
          <transition name="fade" mode="out-in">
            <component :is="Component" />
          </transition>
        </router-view>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
// Auth layout - no additional logic needed
</script>

<style scoped>
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
