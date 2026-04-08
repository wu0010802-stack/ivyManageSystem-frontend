
<script setup>
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import AdminLayout from './layouts/AdminLayout.vue'

const route = useRoute()
const isPortalRoute = computed(() => route.path.startsWith('/portal'))
const isLoginPage = computed(() => route.path === '/login')
const isPublicRoute = computed(() => route.path.startsWith('/public'))
</script>

<template>
  <!-- Portal routes, admin login, and public routes use their own layout -->
  <RouterView v-if="isPortalRoute || isLoginPage || isPublicRoute" />

  <!-- Admin routes use the AdminLayout -->
  <AdminLayout v-else />
</template>

<style>
/* Global resets if needed, but main.css handles most */
</style>
