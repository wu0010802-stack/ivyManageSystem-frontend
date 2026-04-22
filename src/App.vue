
<script setup>
import { computed, watch } from 'vue'
import { useRoute } from 'vue-router'
import AdminLayout from './layouts/AdminLayout.vue'
import { applyPageTitle } from './utils/pageTitle'

const route = useRoute()
const isPortalRoute = computed(() => route.path.startsWith('/portal'))
const isLoginPage = computed(() => route.path === '/login')
const isPublicRoute = computed(() => route.path.startsWith('/public'))
const isBareRoute = computed(() => route.meta?.bare === true)

watch(
  () => [route.path, route.meta?.title, route.meta?.portal, route.meta?.noAuth],
  () => applyPageTitle(route),
  { immediate: true }
)
</script>

<template>
  <!-- Portal routes, admin login, public routes, and bare (print) routes use their own layout -->
  <RouterView v-if="isPortalRoute || isLoginPage || isPublicRoute || isBareRoute" />

  <!-- Admin routes use the AdminLayout -->
  <AdminLayout v-else />
</template>

<style>
/* Global resets if needed, but main.css handles most */
</style>
