<script setup>
/**
 * 家長端連線狀態 banner。
 * - 離線：橘色「目前離線，部分功能受限」
 * - WS 斷線（online 但 wsConnected=false 超過 delay）：淺灰「即時通知暫停，正在重連...」
 */
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { useConnectionStatus } from '@/parent/composables/useConnectionStatus'

const props = defineProps({
  wsBannerDelayMs: { type: Number, default: 3000 },
})

const { online, wsConnected } = useConnectionStatus()
const wsBannerVisible = ref(false)
let wsTimer = null

function scheduleWsBanner() {
  clearTimeout(wsTimer)
  if (online.value && !wsConnected.value) {
    wsTimer = setTimeout(() => { wsBannerVisible.value = !wsConnected.value }, props.wsBannerDelayMs)
  } else {
    wsBannerVisible.value = false
  }
}

// 初始
scheduleWsBanner()
// watch 變化
watch([online, wsConnected], scheduleWsBanner)

onBeforeUnmount(() => clearTimeout(wsTimer))

const variant = computed(() => {
  if (!online.value) return 'offline'
  if (wsBannerVisible.value) return 'ws'
  return null
})

const message = computed(() => {
  if (variant.value === 'offline') return '目前離線，部分功能受限'
  if (variant.value === 'ws') return '即時通知暫停，正在重連...'
  return ''
})

function retry() {
  if (typeof window !== 'undefined') window.location.reload()
}
</script>

<template>
  <Transition name="pt-conn">
    <div
      v-if="variant"
      role="status"
      aria-live="polite"
      class="pt-conn-banner"
      :class="`pt-conn-${variant}`"
    >
      <span class="pt-conn-msg">{{ message }}</span>
      <button v-if="variant === 'offline'" type="button" class="pt-conn-retry" @click="retry">
        重試
      </button>
    </div>
  </Transition>
</template>

<style scoped>
.pt-conn-banner {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 16px;
  font-size: 13px;
  font-weight: 500;
  border-bottom: var(--pt-hairline);
}
.pt-conn-offline {
  background: var(--pt-tint-money, #fef3c7);
  color: var(--pt-tint-money-fg, #b45309);
}
.pt-conn-ws {
  background: var(--pt-tint-message, #dbeafe);
  color: var(--pt-tint-message-fg, #1d4ed8);
}
.pt-conn-retry {
  background: transparent;
  border: 1px solid currentColor;
  border-radius: 6px;
  padding: 4px 10px;
  color: inherit;
  font-size: 12px;
  cursor: pointer;
}

.pt-conn-enter-active, .pt-conn-leave-active {
  transition: transform 0.28s ease, opacity 0.28s ease;
}
.pt-conn-enter-from, .pt-conn-leave-to {
  transform: translateY(-100%); opacity: 0;
}
</style>
