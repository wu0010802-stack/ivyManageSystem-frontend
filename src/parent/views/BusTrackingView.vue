<script setup lang="ts">
/**
 * 家長端娃娃車即時位置頁（route `/bus`）。
 *
 * 設計上的兩條硬規則：
 *
 * 1. **不得把不新鮮的位置呈現成即時的。** 「車在哪」是安全性功能，凍結的地圖比沒有
 *    地圖更危險。因此只要 `stale`（server 60 秒沒收到車機回報）或 `lastFetchFailedAt`
 *    （快照 403 / 500，Task 9 F4）任一成立，就收起地圖並明說原因，只保留不隨座標
 *    過期而失效的接送進度（`stop_status`）。
 *
 * 2. **連線狀態只有兩態：正常 / 斷線重連中。** 後端 `/api/ws/parent/bus` 的
 *    4001 / 4007 / 4029 / 1008 全都在 `ws.accept()` 之前 close，ASGI 未 accept 就 close
 *    會退回 HTTP 握手失敗，瀏覽器一律只看得到 1006。唯一到得了 client 的自訂碼是
 *    post-accept 的 4003（token 每 15 分鐘過期的正常現象，composable 會靜默 refresh
 *    後重連，使用者無感）。因此**不為 `state.wsBlocked` 做 UI**——那會是永遠不觸發的
 *    死程式。
 *
 * 隱私（spec 硬規則）：`stop_lat` / `stop_lng` 是家庭住址。座標只交給 Leaflet 畫點，
 * 不得進 console / Sentry / URL query / localStorage / sessionStorage，也不得以文字
 * 或 DOM 屬性顯示在畫面上。
 *
 * Leaflet 一律**動態** import（含它的 CSS）：靜態 import 會把 ~150KB 的地圖庫靜態
 * 橋接進 parent-app 首屏 bundle（vite.config.js manualChunks 的 `leaflet` chunk 註解）。
 */
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import EmptyState from '@/components/common/EmptyState.vue'
import KawaiiStar from '@/components/brand/KawaiiStar.vue'
import { formatTaipeiClock } from '@/utils/taipeiTime'
import M3Card from '../components/m3/M3Card.vue'
import M3Button from '../components/m3/M3Button.vue'
import SkeletonBlock from '../components/SkeletonBlock.vue'
import { useBusTracking } from '../composables/useBusTracking'

const { state, init, teardown, refresh, retryWs } = useBusTracking()

const mapEl = ref<HTMLElement | null>(null)
const retrying = ref(false)

const isInProgress = computed(() => state.trip?.status === 'in_progress')
/** 快照失敗（403 / 500）：畫面上的座標可能是好幾分鐘前的，一律當作不可信 */
const fetchFailed = computed(() => state.lastFetchFailedAt !== null)
/** 只有「進行中 + 有座標 + 不 stale + 快照沒失敗」才准把地圖當即時位置呈現 */
const showMap = computed(
  () => isInProgress.value && !!state.position && !state.stale && !fetchFailed.value,
)
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
  if (child.stop_status === 'pending') return `前面還有 ${child.stops_ahead} 站`
  if (child.stop_status === 'departed') {
    return state.trip?.direction === 'morning' ? '已上車前往學校' : '已完成接送'
  }
  // excused（請假核准／家長今天不搭／後台排除）與司機主動 skipped 是不同語意：
  // 家長剛申報完不搭進來看到「略過此站」會誤解為司機漏接。
  if (child.stop_status === 'excused') return '今日不搭車'
  return '今日略過此站'
}

/**
 * 自己這一站的預估到達時刻（spec「家長端」第 2 點）。
 *
 * 只在 `pending` 顯示：車已駛過（`departed`）或當日不搭（`excused`）之後，
 * 「預計 07:35 到」只會誤導。`eta` 是 naive 台北牆鐘字串，一律走
 * `formatTaipeiClock`——裸 `new Date()` 會以裝置時區解析，非台北時區的裝置
 * 整個位移 8 小時（CLAUDE.md「Datetime 與 Taipei TZ」）。
 *
 * 後端已把 `eta_live`（行進間即時重算）優先、無值退 `eta_planned` 的判斷做完，
 * 前端拿到的就是單一結果值，不重算也不改優先序。
 */
function etaText(child: { stop_status: string; eta: string | null }): string | null {
  if (child.stop_status !== 'pending') return null
  const clock = formatTaipeiClock(child.eta)
  return clock ? `預計 ${clock} 到` : null
}

// ── Leaflet（動態載入）──
// leaflet 沒有 @types 套件，比照 RecruitmentAddressHeatmap.vue 的既有慣例以 any + 逐行
// eslint-disable 承接（棘輪規則：修掉 any 時必須連同 disable 註解一起刪）。
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let leafletApi: any = null
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let leafletPromise: Promise<any> | null = null
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let map: any = null
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let busMarker: any = null
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let staticMarkers: any[] = []
let renderedStaticSignature = ''

const MAP_ZOOM = 15

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function ensureLeaflet(): Promise<any> {
  if (leafletApi) return leafletApi
  if (!leafletPromise) {
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore – leaflet has no @types package in this project
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    leafletPromise = import('leaflet').then(async (module: any) => {
      // CSS 也走動態 import，避免 leaflet 樣式被靜態併進 parent 首屏 css
      await import('leaflet/dist/leaflet.css')
      leafletApi = module.default ?? module
      return leafletApi
    })
  }
  return leafletPromise
}

/**
 * 自家站點與學校是靜態點位，只在內容真的變了才重畫（signature 比對）。
 * signature 只用於相等比較，**不會**被渲染或記錄到任何地方。
 */
function staticSignature(): string {
  const stops = state.children
    .filter((c) => c.stop_lat != null && c.stop_lng != null)
    .map((c) => `${c.stop_lat},${c.stop_lng}`)
    .join('|')
  return `${stops}#${state.school ? `${state.school.lat},${state.school.lng}` : ''}`
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function drawStaticMarkers(L: any): void {
  const signature = staticSignature()
  if (signature === renderedStaticSignature) return
  staticMarkers.forEach((m) => { m.remove?.() })
  staticMarkers = []
  for (const child of state.children) {
    if (child.stop_lat == null || child.stop_lng == null) continue
    staticMarkers.push(L.marker([child.stop_lat, child.stop_lng], { title: '我家' }).addTo(map))
  }
  if (state.school) {
    staticMarkers.push(L.marker([state.school.lat, state.school.lng], { title: '學校' }).addTo(map))
  }
  renderedStaticSignature = signature
}

async function renderMap(): Promise<void> {
  if (!showMap.value) return
  await nextTick()
  const position = state.position
  if (!mapEl.value || !position) return
  const L = await ensureLeaflet()
  // await 期間可能已經改判為不可信（stale / 快照失敗）或元件已卸載
  if (!mapEl.value || !showMap.value || !state.position) return
  if (!map) {
    map = L.map(mapEl.value).setView([position.lat, position.lng], MAP_ZOOM)
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors',
      maxZoom: 19,
    }).addTo(map)
    busMarker = L.marker([position.lat, position.lng], { title: '娃娃車' }).addTo(map)
  } else {
    busMarker?.setLatLng([state.position.lat, state.position.lng])
  }
  drawStaticMarkers(L)
}

function destroyMap(): void {
  if (!map) return
  map.remove?.()
  map = null
  busMarker = null
  staticMarkers = []
  renderedStaticSignature = ''
}

// 地圖收起（stale / 快照失敗 / 班次結束）時必須真的拆掉實例，否則下次恢復時
// mapEl 已是新的 DOM 節點，舊 map 會綁在被移除的節點上而不再更新。
watch(showMap, (visible) => {
  if (visible) void renderMap()
  else destroyMap()
})
watch(() => state.position, () => { void renderMap() })
watch(() => [state.children, state.school], () => { void renderMap() }, { deep: true })

onMounted(async () => {
  await init()
  void renderMap()
})

onBeforeUnmount(() => {
  destroyMap()
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
        掛在 in_progress 分支內的話畫面會走空狀態、謊稱「今天沒有班次」——那比凍結的地圖
        更糟，家長會直接不看了。同理 `completed` 也可能只是抓不到新班次。
      -->
      <M3Card
        v-if="fetchFailed"
        data-testid="bus-fetch-error"
        variant="outlined"
        role="status"
        aria-live="polite"
        class="bus-notice is-error"
      >
        <div class="bus-notice-title">無法取得最新位置</div>
        <div class="bus-notice-text">
          與園所的連線出了狀況，畫面上的資訊可能已經不是現在的狀況，因此暫時不顯示地圖。
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
        description="發車後這裡會顯示即時位置"
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
          <div class="bus-notice-title">位置訊號暫時中斷</div>
          <div class="bus-notice-text">
            車機超過一分鐘沒有回報位置，暫時不顯示地圖；以下為最近一次的接送進度。
          </div>
        </M3Card>

        <!--
          role 用 region 而非 img：
          - `img` 會讓容器內容變成 presentational，連 Leaflet 自動插入的縮放鈕與
            **OpenStreetMap attribution 連結（授權要求可觸及）**一起被輔助科技隱藏。
          - 但也不能沒有 role：ARIA 不允許為 generic role 命名，掛在裸 `<div>` 上的
            `aria-label` 多數螢幕閱讀器會直接忽略，等於沒修。
          region（landmark，可命名且不影響子節點）兩者兼得。
        -->
        <div
          v-if="showMap"
          ref="mapEl"
          data-testid="bus-map"
          class="bus-map"
          role="region"
          aria-label="娃娃車即時位置地圖"
        />
        <p v-if="showMap && lastUpdatedText" class="bus-updated">{{ lastUpdatedText }}</p>

        <p v-if="showReconnecting" data-testid="bus-conn" role="status" aria-live="polite" class="bus-conn">
          即時連線中斷，正在重新連線⋯
        </p>

        <M3Card v-for="child in state.children" :key="child.student_id" class="bus-progress-card">
          <div class="bus-progress-title">{{ child.student_name }}</div>
          <div class="bus-progress-text">
            {{ progressText(child) }}
            <span v-if="etaText(child)" data-testid="bus-eta" class="bus-eta">
              {{ etaText(child) }}
            </span>
          </div>
        </M3Card>
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
.bus-map {
  height: 48vh;
  min-height: 260px;
  border-radius: 16px;
  overflow: hidden;
  background: var(--pt-surface-mute, #f1f5f9);
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
.bus-eta {
  margin-left: 6px;
  color: var(--pt-text, #0f172a);
  font-variant-numeric: tabular-nums;
}
.bus-progress-note {
  margin-top: 6px;
  font-size: var(--text-xs, 11px);
  color: var(--pt-text-faint, #94a3b8);
}
</style>
