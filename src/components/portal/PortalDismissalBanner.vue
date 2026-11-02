<script setup lang="ts">
/**
 * 教師端全域「接送」可見提醒（day-qa F7，2026-11-02）。
 *
 * 實測：家長按「預告接送」時老師正開著聯絡簿抽屜，畫面上沒有任何可見提示——提醒只有
 * 音效／語音（手機靜音就沒了）、系統推播（要先授權）與側邊選單徽章；帶班老師底部導覽
 * 也沒有「接送」頁籤。家長按「已到門口」時接送卡又會自動完成而從清單消失。
 *
 * 不在接送頁時，每則新的預告／抵達都跳一則 ElNotification（由 Element Plus 管 z-index，
 * 會蓋在抽屜／對話框之上），點一下就到接送頁。「已到門口」不自動關閉。
 */
import { onBeforeUnmount, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElNotification } from 'element-plus'
import { usePortalDismissalAlerts } from '@/composables/usePortalDismissalAlerts'

const DISMISSAL_PATH = '/portal/dismissal-calls'
const PRE_ARRIVAL_DURATION_MS = 20000

const route = useRoute()
const router = useRouter()
const { liveAnnounce } = usePortalDismissalAlerts()

let current: { close: () => void } | null = null

function closeCurrent(): void {
  current?.close()
  current = null
}

watch(() => liveAnnounce?.value ?? '', (text) => {
  if (!text || route.path === DISMISSAL_PATH) return
  closeCurrent()
  const arrived = text.includes('已到門口')
  current = ElNotification({
    title: arrived ? '家長已到門口' : '接送通知',
    message: `${text}（點此前往接送通知）`,
    type: arrived ? 'error' : 'warning',
    duration: arrived ? 0 : PRE_ARRIVAL_DURATION_MS,
    position: 'top-right',
    customClass: 'portal-dismissal-notification',
    onClick: () => {
      closeCurrent()
      void router.push(DISMISSAL_PATH)
    },
  })
})

// 已經在接送頁就不需要再提醒（頁內有卡片與語音）
watch(
  () => route.path,
  (path) => {
    if (path === DISMISSAL_PATH) closeCurrent()
  },
)

onBeforeUnmount(closeCurrent)
</script>

<template>
  <span class="portal-dismissal-banner-host" aria-hidden="true" />
</template>

<style scoped>
.portal-dismissal-banner-host {
  display: none;
}
</style>
