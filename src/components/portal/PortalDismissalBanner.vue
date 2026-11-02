<script setup lang="ts">
/**
 * 教師端全域「接送」可見提醒（day-qa F7，2026-11-02）。
 *
 * 實測：家長按「預告接送」時老師正開著聯絡簿抽屜，畫面上沒有任何可見提示——提醒只有
 * 音效／語音（手機靜音就沒了）、系統推播（要先授權）與側邊選單徽章；帶班老師底部導覽
 * 也沒有「接送」頁籤。家長按「已到門口」時接送卡又會自動完成而從清單消失。
 *
 * 不在接送頁時跳 ElNotification（由 Element Plus 管 z-index，會蓋在抽屜／對話框之上），
 * 點一下就到接送頁：
 * - 家長預告（pre）：20 秒後自動關；新的預告取代舊的預告。
 * - 已到門口／行政建單（waiting）：不自動關，每張接送單各一則，**不會被後來的預告蓋掉**
 *   （審查 P2：放學尖峰連續來通知時，先到門口的家長不能從畫面消失）。同一張單到門口時
 *   取代它自己的預告。
 * - WebSocket 斷線改走輪詢時沒有逐筆事件：改由接送清單的變化（新單、抵達）補提醒。
 */
import { onBeforeUnmount, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElNotification } from 'element-plus'
// ElNotification 是程式化呼叫的 API，按需樣式不會自動帶入（main.ts 只手動載了 message／message-box）；
// 沒有這行它會以無樣式的 static 區塊掉到頁面最底，看起來就像沒跳提醒。
import 'element-plus/theme-chalk/el-notification.css'
import {
  usePortalDismissalAlerts,
  type DismissalAnnouncement,
} from '@/composables/usePortalDismissalAlerts'

const DISMISSAL_PATH = '/portal/dismissal-calls'
const PRE_ARRIVAL_DURATION_MS = 20000

type Handle = { close: () => void }
type CallLike = { id: number; student_name?: string | null; classroom_name?: string | null; arrived_at?: string | null; status?: string | null }

const route = useRoute()
const router = useRouter()
const alerts = usePortalDismissalAlerts() as Partial<ReturnType<typeof usePortalDismissalAlerts>>

let preHandle: { callId: number; handle: Handle } | null = null
const waitingHandles = new Map<number, Handle>()
// 已提醒過的單（避免 WS 事件與輪詢快照重複跳）
const notifiedPre = new Set<number>()
const notifiedWaiting = new Set<number>()

function closeAll(): void {
  preHandle?.handle.close()
  preHandle = null
  waitingHandles.forEach((h) => h.close())
  waitingHandles.clear()
}

function goDismissal(): void {
  closeAll()
  void router.push(DISMISSAL_PATH)
}

function show(callId: number, kind: DismissalAnnouncement['kind'], text: string): void {
  if (kind === 'pre') notifiedPre.add(callId)
  else notifiedWaiting.add(callId)
  if (route.path === DISMISSAL_PATH) return
  if (kind === 'pre') {
    preHandle?.handle.close()
    preHandle = {
      callId,
      handle: ElNotification({
        title: '接送通知',
        message: `${text}（點此前往接送通知）`,
        type: 'warning',
        duration: PRE_ARRIVAL_DURATION_MS,
        position: 'top-right',
        customClass: 'portal-dismissal-notification',
        onClick: goDismissal,
      }),
    }
    return
  }
  // waiting：同一張單的預告由抵達取代；其他家長的提醒一律保留
  if (preHandle?.callId === callId) {
    preHandle.handle.close()
    preHandle = null
  }
  waitingHandles.get(callId)?.close()
  waitingHandles.set(
    callId,
    ElNotification({
      title: text.includes('已到門口') ? '家長已到門口' : '接送通知',
      message: `${text}（點此前往接送通知）`,
      type: 'error',
      duration: 0,
      position: 'top-right',
      customClass: 'portal-dismissal-notification',
      onClick: goDismissal,
      onClose: () => waitingHandles.delete(callId),
    }),
  )
}

// WS 事件：每則一個序號，文字相同的連續事件也會觸發
watch(
  () => alerts.lastAnnouncement?.value?.seq ?? 0,
  () => {
    const ev = alerts.lastAnnouncement?.value
    if (ev) show(ev.callId, ev.kind, ev.text)
  },
)

// 輪詢退路：WS 斷線時沒有逐筆事件，從清單變化補提醒。
// 開 App 當下已存在的單不補跳：掛載時清單已有資料就以它為基準；掛載時還是空的（首次載入
// 尚未回來，WS 也還沒連上），就以第一份回來的清單為基準。
let primed = false
let sawInitial = false
watch(
  () => (alerts.activeCalls?.value ?? []) as CallLike[],
  (calls) => {
    if (!primed) {
      calls.forEach((c) => (c.arrived_at ? notifiedWaiting.add(c.id) : notifiedPre.add(c.id)))
      if (calls.length > 0 || sawInitial) primed = true
      sawInitial = true
      return
    }
    if (alerts.wsConnected?.value) return
    for (const c of calls) {
      if (c.status === 'completed' || c.status === 'cancelled') continue
      const who = `${c.classroom_name ?? ''}${c.student_name || '學生'}`
      if (c.arrived_at && !notifiedWaiting.has(c.id)) {
        show(c.id, 'waiting', `${c.student_name || '學生'}家長已到門口，請準備放學`)
      } else if (!c.arrived_at && !notifiedPre.has(c.id)) {
        show(c.id, 'pre', `預告接送：${who}的家長即將抵達`)
      }
    }
  },
  { deep: true, immediate: true },
)

// 已經在接送頁就不需要再提醒（頁內有卡片與語音）
watch(
  () => route.path,
  (path) => {
    if (path === DISMISSAL_PATH) closeAll()
  },
)

onBeforeUnmount(closeAll)
</script>

<template>
  <span class="portal-dismissal-banner-host" aria-hidden="true" />
</template>

<style scoped>
.portal-dismissal-banner-host {
  display: none;
}
</style>
