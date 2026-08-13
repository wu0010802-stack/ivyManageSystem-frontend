<script setup lang="ts">
/**
 * 家長端連線狀態 banner。
 * - 離線：暖黃 money tint（--pt-tint-money）「目前離線，部分功能受限」
 * - WS 斷線（online 且 **wsExpected**——確實有頁面需要 WS——但 wsConnected=false
 *   超過 delay）：藍綠 message tint（--pt-tint-message）「即時通知暫停，正在重連...」
 *   ⚠ 沒有任何頁面持有 WS（wsExpected=false）時**不顯示**——「沒在用」≠「斷線」
 *   （2026-08-13 前曾因此全站常駐重連 banner）。
 */
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { useConnectionStatus } from '@/parent/composables/useConnectionStatus'

const props = withDefaults(defineProps<{
  wsBannerDelayMs?: number
}>(), {
  wsBannerDelayMs: 3000,
})

const { online, wsConnected, wsExpected } = useConnectionStatus()
const wsBannerVisible = ref<boolean>(false)
let wsTimer: ReturnType<typeof setTimeout> | null = null

function scheduleWsBanner(): void {
  if (wsTimer !== null) clearTimeout(wsTimer)
  if (online.value && wsExpected.value && !wsConnected.value) {
    wsTimer = setTimeout(() => {
      wsBannerVisible.value = wsExpected.value && !wsConnected.value
    }, props.wsBannerDelayMs)
  } else {
    wsBannerVisible.value = false
  }
}

// 初始
scheduleWsBanner()
// watch 變化
watch([online, wsConnected, wsExpected], scheduleWsBanner)

onBeforeUnmount(() => { if (wsTimer !== null) clearTimeout(wsTimer) })

const variant = computed<string | null>(() => {
  if (!online.value) return 'offline'
  if (wsBannerVisible.value) return 'ws'
  return null
})

const message = computed<string>(() => {
  if (variant.value === 'offline') return '目前離線，部分功能受限'
  if (variant.value === 'ws') return '即時通知暫停，正在重連...'
  return ''
})

function retry(): void {
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
/* P2.4 rebrand：離線改用暖黃 money tint（警告語意）；WS 斷線維持藍綠 message tint（資訊語意） */
.pt-conn-offline {
  background: var(--pt-tint-money, #fff8d8);
  color: var(--pt-tint-money-fg, #7a6500);
}
.pt-conn-ws {
  background: var(--pt-tint-message, #e0f7f4);
  color: var(--pt-tint-message-fg, #0d7a6a);
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
