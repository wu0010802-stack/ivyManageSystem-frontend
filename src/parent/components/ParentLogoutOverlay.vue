<script setup lang="ts">
import { useParentLogoutState } from '../composables/useParentLogout'

const { inProgress } = useParentLogoutState()
</script>

<template>
  <div
    v-if="inProgress"
    class="parent-logout-shield"
    data-testid="parent-logout-shield"
    role="status"
    aria-live="assertive"
    aria-busy="true"
  >
    <span class="parent-logout-spinner" aria-hidden="true" />
    <p>正在安全登出…</p>
  </div>
</template>

<style scoped>
.parent-logout-shield {
  position: fixed;
  inset: 0;
  z-index: 2147483647;
  display: grid;
  place-content: center;
  justify-items: center;
  gap: 16px;
  background: var(--m3-surface, #f7fbf3);
  color: var(--m3-on-surface, #181d18);
  font-size: 15px;
  font-weight: 600;
  text-align: center;
}

.parent-logout-shield p {
  margin: 0;
}

.parent-logout-spinner {
  width: 32px;
  height: 32px;
  border: 3px solid color-mix(in srgb, var(--brand-primary, #0d9053) 24%, transparent);
  border-top-color: var(--brand-primary, #0d9053);
  border-radius: 50%;
  animation: parent-logout-spin 700ms linear infinite;
}

@keyframes parent-logout-spin {
  to { transform: rotate(360deg); }
}

@media (prefers-reduced-motion: reduce) {
  .parent-logout-spinner { animation: none; }
}
</style>
