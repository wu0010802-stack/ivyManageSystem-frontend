
<script setup>
import { computed, watch } from 'vue'
import { useRoute } from 'vue-router'
import AdminLayout from './layouts/AdminLayout.vue'
import { useRouteLoading } from './composables/useRouteLoading'
import { applyPageTitle } from './utils/pageTitle'

const route = useRoute()
const { routeLoading } = useRouteLoading()
const isPortalRoute = computed(() => route.path.startsWith('/portal'))
const isLoginPage = computed(() => route.path === '/login')
const isPublicRoute = computed(() => route.path.startsWith('/public'))
const isBareRoute = computed(() => route.meta?.bare === true)

// public/ 資源的完整路徑（含 Vite base URL），runtime 字串，Vue template 不會 transform
const loadingLogoSrc = `${import.meta.env.BASE_URL}images/ivy-kids-loading.png`

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

  <Transition name="route-loading-fade">
    <div
      v-if="routeLoading"
      class="route-loading-overlay"
      role="status"
      aria-label="頁面載入中"
    >
      <div class="route-loading-mark" aria-hidden="true">
        <!-- public/ 資源用 :src binding，避免 Vue SFC 把 /xxx 當成 import 解析 -->
        <img :src="loadingLogoSrc" alt="" class="route-loading-logo" />
      </div>
    </div>
  </Transition>
</template>

<style>
.route-loading-overlay {
  position: fixed;
  inset: 0;
  z-index: 5000;
  display: grid;
  place-items: center;
  background: rgba(248, 250, 252, 0.72);
  backdrop-filter: blur(4px);
  pointer-events: none;
}

.route-loading-mark {
  position: relative;
  display: grid;
  place-items: center;
  width: clamp(96px, 14vw, 136px);
  aspect-ratio: 1;
}

.route-loading-mark::before {
  content: '';
  position: absolute;
  inset: 0;
  border: 3px solid rgba(63, 125, 72, 0.18);
  border-top-color: #f4b43f;
  border-radius: 50%;
  animation: route-loading-spin 0.95s linear infinite;
}

.route-loading-logo {
  width: 78%;
  height: 78%;
  object-fit: contain;
  filter: drop-shadow(0 8px 16px rgba(15, 23, 42, 0.18));
  animation: route-loading-breathe 1.4s ease-in-out infinite;
}

.route-loading-fade-enter-active,
.route-loading-fade-leave-active {
  transition: opacity 0.18s ease;
}

.route-loading-fade-enter-from,
.route-loading-fade-leave-to {
  opacity: 0;
}

@keyframes route-loading-spin {
  to {
    transform: rotate(360deg);
  }
}

@keyframes route-loading-breathe {
  0%,
  100% {
    transform: scale(0.96);
  }
  50% {
    transform: scale(1.03);
  }
}
</style>
