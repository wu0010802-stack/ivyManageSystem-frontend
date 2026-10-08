<script setup lang="ts">
/**
 * 家長端娃娃車到站進度。只顯示自家剩餘站數與預估時間。
 * 資料過期、快照失敗或斷線時保留最近進度，暫停倒數，避免誤認為即時資訊。
 * 家庭座標不渲染、不記錄、不存入瀏覽器儲存空間。
 */
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import EmptyState from '@/components/common/EmptyState.vue'
import KawaiiStar from '@/components/brand/KawaiiStar.vue'
import { formatTaipeiClock } from '@/utils/taipeiTime'
import M3Card from '../components/m3/M3Card.vue'
import M3Button from '../components/m3/M3Button.vue'
import SkeletonBlock from '../components/SkeletonBlock.vue'
import { useBusTracking } from '../composables/useBusTracking'
import { busArrivalEstimate } from '../utils/busArrival'

const { state, init, teardown, refresh, retryWs } = useBusTracking()

const CLOCK_REFRESH_MS = 30_000
const now = ref(Date.now())
let clockTimer: ReturnType<typeof setInterval> | null = null
const retrying = ref(false)

const isInProgress = computed(() => state.trip?.status === 'in_progress')
const fetchFailed = computed(() => state.lastFetchFailedAt !== null)
/**
 * 斷線重連中（實務上一律是 1006）。
 * 必須加上 `lastWsClose !== null`：`wsConnected` 初值就是 false，而 `init()` 會先 await
 * 快照、`onopen` 更晚才到，只看 `wsConnected` 的話**每次進頁都會先閃一次「連線中斷」**
 * （全域 ConnectionBanner 的 `wsBannerDelayMs = 3000` 正是為了迴避同一件事）。
 * 只有真的斷過（收過 close）才提示。
 */
const showReconnecting = computed(
  () => isInProgress.value && !state.wsConnected && state.lastWsClose !== null,
)
const progressOutdated = computed(() => state.stale || fetchFailed.value || showReconnecting.value)
const lastUpdatedText = computed(() => {
  const clock = formatTaipeiClock(state.position?.at ?? null)
  return clock ? `最後回報 ${clock}` : ''
})

/**
 * 手動重試：快照與 WS 一起救。只重抓快照的話，WS 若同時死著仍然回不到即時；
 * `retryWs()` 會立刻換一條連線並把退避次數歸零。
 * 連點防護只留 `:disabled="retrying"` 一道：M3Button 是原生 `<button :disabled>`，disable 期間
 * 事件根本不會送達，再加一道 `if (retrying.value) return` 早退是永遠跑不到的死程式
 * （mutation M47 實測：兩者互相遮蔽，拿掉任一個測試都不會紅），故不留。
 */
async function retryNow(): Promise<void> {
  retrying.value = true
  try {
    retryWs()
    await refresh()
  } finally {
    retrying.value = false
  }
}

function progressText(child: { stop_status: string; stops_ahead: number }): string {
  if (child.stop_status === 'pending') {
    return child.stops_ahead === 0 ? '下一站就是您這站' : `前面還有 ${child.stops_ahead} 站`
  }
  if (child.stop_status === 'departed') {
    return state.trip?.direction === 'morning' ? '已上車前往學校' : '已完成接送'
  }
  // excused（請假核准／家長今天不搭／後台排除）與司機主動 skipped 是不同語意：
  // 家長剛申報完不搭進來看到「略過此站」會誤解為司機漏接。
  if (child.stop_status === 'excused') return '今日不搭車'
  return '今日略過此站'
}

/** 後端已決定即時／排程 ETA 優先序；此處只呈現，不自行推算行車速度。 */
function etaText(child: { stop_status: string; eta: string | null }): string | null {
  if (child.stop_status !== 'pending') return null
  if (progressOutdated.value) return '預估時間待更新'
  const estimate = busArrivalEstimate(child.eta, now.value)
  if (!estimate.clock) return '預估時間待更新'
  if (estimate.minutes === null) return '預估時間更新中'
  return `約 ${estimate.minutes} 分鐘後到`
}

function etaClock(child: { stop_status: string; eta: string | null }): string | null {
  if (child.stop_status !== 'pending' || progressOutdated.value) return null
  const estimate = busArrivalEstimate(child.eta, now.value)
  return estimate.minutes !== null ? `預計 ${estimate.clock} 到` : null
}

onMounted(() => {
  clockTimer = setInterval(() => { now.value = Date.now() }, CLOCK_REFRESH_MS)
  void init()
})

onBeforeUnmount(() => {
  if (clockTimer !== null) clearInterval(clockTimer)
  teardown()
})
</script>

<template>
  <div class="bus-view">
    <!-- SkeletonBlock 渲染 fragment，attr 無法自動繼承，錨點掛在外層 wrapper -->
    <div v-if="state.loading" data-testid="bus-loading">
      <SkeletonBlock variant="card" :count="2" />
    </div>

    <template v-else>
      <!--
        快照失敗的提示必須在三態**之外**：冷啟動就 403 / 500 時 `state.trip` 會維持 null，
        掛在 in_progress 分支內會誤稱「今天沒有班次」；`completed` 也可能只是抓不到新班次。
      -->
      <M3Card
        v-if="fetchFailed"
        data-testid="bus-fetch-error"
        variant="outlined"
        role="status"
        aria-live="polite"
        class="bus-notice is-error"
      >
        <div class="bus-notice-title">無法取得最新接送進度</div>
        <div class="bus-notice-text">
          {{ isInProgress
            ? '與園所的連線出了狀況，以下為最近一次的接送進度，預估時間暫停更新。'
            : '與園所的連線出了狀況，請重新載入以取得接送進度。' }}
        </div>
        <M3Button
          data-testid="bus-retry"
          variant="filled"
          class="bus-notice-action"
          :disabled="retrying"
          @click="retryNow"
        >
          {{ retrying ? '重新載入中⋯' : '重新載入' }}
        </M3Button>
      </M3Card>

      <!-- 快照失敗時一律不下「沒有班次」「已結束」這種負面斷言，只有進行中的進度照常顯示 -->
      <EmptyState
        v-if="!fetchFailed && !state.trip"
        data-testid="bus-empty"
        variant="mobile"
        :icon="KawaiiStar"
        title="目前沒有進行中的娃娃車班次"
        description="發車後這裡會顯示剩餘站數與預估到站時間"
      />

      <template v-else-if="isInProgress">
        <!-- server 超過 60 秒沒收到車機回報 -->
        <M3Card
          v-if="!fetchFailed && state.stale"
          data-testid="bus-stale"
          variant="outlined"
          role="status"
          aria-live="polite"
          class="bus-notice"
        >
          <div class="bus-notice-title">接送進度暫停更新</div>
          <div class="bus-notice-text">
            車機超過一分鐘沒有回報，以下為最近一次的接送進度，預估時間暫停更新。
          </div>
        </M3Card>

        <p v-if="showReconnecting" data-testid="bus-conn" role="status" aria-live="polite" class="bus-conn">
          即時連線中斷，正在重新連線⋯以下為最近一次的接送進度，預估時間暫停更新。
        </p>

        <M3Card v-for="child in state.children" :key="child.student_id" class="bus-progress-card">
          <div class="bus-progress-title">{{ child.student_name }}</div>
          <div class="bus-stops">{{ progressText(child) }}</div>
          <div v-if="etaText(child)" data-testid="bus-eta" class="bus-eta">
            <div class="bus-arrival">{{ etaText(child) }}</div>
            <div v-if="etaClock(child)" class="bus-progress-text">{{ etaClock(child) }}</div>
          </div>
        </M3Card>
        <p v-if="lastUpdatedText" class="bus-updated">{{ lastUpdatedText }}</p>
      </template>

      <M3Card v-else-if="!fetchFailed && state.trip" data-testid="bus-done" class="bus-progress-card">
      <div class="bus-progress-title">班次已結束</div>
      <div class="bus-progress-text">
        {{ state.trip?.direction === 'morning' ? '孩子已抵達學校' : '接送行程已完成' }}
      </div>
        <div v-if="state.trip?.auto_closed" class="bus-progress-note">
          這筆班次由系統自動結束（司機未手動結束），如有疑問請聯絡園所。
        </div>
      </M3Card>
    </template>
  </div>
</template>

<style scoped>
.bus-view {
  display: flex;
  flex-direction: column;
  gap: var(--space-3, 12px);
  padding: var(--space-4, 16px);
}
.bus-updated {
  margin: 0;
  font-size: var(--text-xs, 11px);
  color: var(--pt-text-faint, #94a3b8);
  text-align: right;
}
.bus-conn {
  margin: 0;
  font-size: var(--text-xs, 11px);
  color: var(--pt-text-soft, #64748b);
}
.bus-notice-title {
  font-weight: 700;
  color: var(--pt-text-strong, #0f172a);
}
.bus-notice-text {
  margin-top: 4px;
  font-size: 0.9rem;
  color: var(--pt-text-soft, #64748b);
}
.bus-notice.is-error {
  border-color: var(--pt-danger-border, #f0b4b4);
}
.bus-notice-action {
  margin-top: var(--space-3, 12px);
}
.bus-progress-title {
  font-weight: 600;
  color: var(--pt-text-strong, #0f172a);
}
.bus-progress-text {
  margin-top: 2px;
  font-size: 0.9rem;
  color: var(--pt-text-soft, #64748b);
}
.bus-stops {
  margin-top: var(--space-3, 12px);
  font-size: var(--text-xl, 20px);
  font-weight: 700;
  color: var(--pt-text-strong, #0f172a);
  font-variant-numeric: tabular-nums;
}
.bus-arrival {
  font-size: var(--text-lg, 18px);
  font-weight: 600;
}
.bus-eta {
  margin-top: var(--space-2, 8px);
  color: var(--pt-text, #0f172a);
  font-variant-numeric: tabular-nums;
}
.bus-progress-note {
  margin-top: 6px;
  font-size: var(--text-xs, 11px);
  color: var(--pt-text-faint, #94a3b8);
}
</style>
