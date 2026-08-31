<script setup lang="ts">
/**
 * 管理端娃娃車即時監看（route `/bus/monitor`，權限 `BUS_READ`）。
 *
 * 連線／事件比對／探測邏輯全在 `@/composables/useBusMonitor`；本檔只負責呈現。
 *
 * 兩條硬規則（與家長端同源）：
 * 1. **不得把不新鮮的位置呈現成即時的。** 車機超過 60 秒沒回報（`stale`）或快照失敗
 *    （`snapshotFailed`）時收起地圖並明說原因，只留站點進度——凍結的地圖比沒有地圖危險。
 * 2. **連線狀態只有兩態：正常 / 斷線重連中。** `/api/ws/admin/bus` 的
 *    4001/4007/4029/1008 全在 `ws.accept()` 前 close，瀏覽器只看得到 1006；唯一到得了
 *    client 的自訂碼是 post-accept 的 4003（token 到期，composable 靜默 refresh 後重連）。
 *    因此**不做**「權限不足請聯絡管理員」這類永遠不觸發的 UI。
 *
 * 隱私：座標只交給 Leaflet 畫點，不進 console / Sentry / URL query / storage / 標題。
 * Leaflet 動態 import（含 CSS），理由同家長端。
 */
import { computed, nextTick, onBeforeUnmount, onMounted, watch, ref } from 'vue'
import PageHeader from '@/components/common/PageHeader.vue'
import { formatTaipeiClock } from '@/utils/taipeiTime'
import { useBusMonitor, DIRECTION_LABELS } from '@/composables/useBusMonitor'
import { excuseReasonLabel } from '@/constants/bus'

const monitor = useBusMonitor()
const {
  routes, selectedRouteId, trip, stops, loading, snapshotFailed, rosterOutOfSync,
  reconnecting, isLive, stale, showMap, tripSummary,
} = monitor

const mapEl = ref<HTMLElement | null>(null)

const lastUpdatedText = computed(() => {
  const clock = formatTaipeiClock(trip.value?.last_ping_at ?? null)
  return clock ? `最後回報 ${clock}` : ''
})
const doneTitle = computed(
  () => (trip.value?.auto_closed ? '班次已逾時自動關閉（司機未手動結束）' : '班次已結束'),
)
const directionLabel = computed(
  () => DIRECTION_LABELS[trip.value?.direction ?? ''] ?? trip.value?.direction ?? '',
)

const endTimeText = computed(() => {
  const clock = formatTaipeiClock(trip.value?.end_time_estimated ?? null)
  return clock ? `預計 ${clock} 回到園所` : ''
})

function stopTagType(status: string): 'success' | 'info' | 'warning' | undefined {
  if (status === 'departed') return 'success'
  if (status === 'skipped') return 'info'
  if (status === 'excused') return 'warning'
  return undefined
}
/**
 * 後端 `status` 是裸 `str`（沒有 enum），值域日後可能再擴。未知值**原樣顯示**而不是
 * 落進「待接送」——把一個不認識的狀態說成「等一下會接」是這一頁最不該犯的謊，
 * 而印出裸英文碼至少讓行政知道要回報。與 `BusDispatchStopsTable.statusMeta` 同慣例。
 */
const STOP_LABELS: Record<string, string> = {
  pending: '待接送',
  departed: '已離站',
  skipped: '已跳過',
  excused: '今日不搭',
}
function stopLabel(status: string): string {
  return STOP_LABELS[status] ?? status
}
/** excused 站才有原因；其餘狀態不顯示（空字串＝該欄留白）。 */
function excuseText(status: string, reason: string | null): string {
  return status === 'excused' ? excuseReasonLabel(reason) : ''
}
/**
 * 站點 ETA：`eta_live`（行進間即時重算）優先，退回 `eta_planned`（當日平移值）。
 * 與後端 `services/bus_events.py::build_stop_update_event` 的 `eta` 取值同順序，
 * 家長端與監看頁看到的是同一個數字。
 *
 * **只有 `pending` 的站才有 ETA**：excused 的站後端會跳過、departed／skipped 已經
 * 過去了。對一件不會發生的事給出精確時間，行政（或被行政轉述的家長）會照著在門口
 * 等——那比不顯示更糟。
 */
function stopEtaText(status: string, etaLive: string | null, etaPlanned: string | null): string {
  if (status !== 'pending') return '—'
  return formatTaipeiClock(etaLive ?? etaPlanned) ?? '—'
}

async function onRouteChange(routeId: number): Promise<void> {
  await monitor.selectRoute(routeId)
}

// ── Leaflet（動態載入）──
// leaflet 無 @types，比照 repo 既有慣例以 any + 逐行 eslint-disable 承接。
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let leafletApi: any = null
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let leafletPromise: Promise<any> | null = null
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let map: any = null
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let busMarker: any = null
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let stopMarkers: any[] = []
let renderedStopSignature = ''

const MAP_ZOOM = 14

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function ensureLeaflet(): Promise<any> {
  if (leafletApi) return leafletApi
  if (!leafletPromise) {
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore – leaflet has no @types package in this project
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    leafletPromise = import('leaflet').then(async (module: any) => {
      await import('leaflet/dist/leaflet.css')
      leafletApi = module.default ?? module
      return leafletApi
    })
  }
  return leafletPromise
}

/** 站點是靜態點位，只有內容真的變了才重畫（signature 僅供相等比較，不輸出到任何地方）。 */
function stopSignature(): string {
  return stops.value
    .filter((s) => s.lat != null && s.lng != null)
    .map((s) => `${s.seq}:${s.lat},${s.lng}`)
    .join('|')
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function drawStopMarkers(L: any): void {
  const signature = stopSignature()
  if (signature === renderedStopSignature) return
  stopMarkers.forEach((m) => { m.remove?.() })
  stopMarkers = []
  for (const stop of stops.value) {
    if (stop.lat == null || stop.lng == null) continue
    stopMarkers.push(
      L.marker([stop.lat, stop.lng], { title: `${stop.seq}. ${stop.student_name}` }).addTo(map),
    )
  }
  renderedStopSignature = signature
}

async function renderMap(): Promise<void> {
  if (!showMap.value) return
  await nextTick()
  const current = trip.value
  if (!mapEl.value || !current || current.last_lat == null || current.last_lng == null) return
  const L = await ensureLeaflet()
  // await 期間可能已改判為不可信（stale / 快照失敗）或元件已卸載
  if (!mapEl.value || !showMap.value) return
  const position: [number, number] = [current.last_lat, current.last_lng]
  if (!map) {
    map = L.map(mapEl.value).setView(position, MAP_ZOOM)
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors', maxZoom: 19,
    }).addTo(map)
    busMarker = L.marker(position, { title: '娃娃車' }).addTo(map)
  } else {
    busMarker?.setLatLng(position)
  }
  drawStopMarkers(L)
}

function destroyMap(): void {
  if (!map) return
  map.remove?.()
  map = null
  busMarker = null
  stopMarkers = []
  renderedStopSignature = ''
}

// 地圖收起（stale / 快照失敗 / 班次結束 / 換路線）時要真的拆掉實例，否則下次恢復時
// mapEl 已是新的 DOM 節點，舊 map 綁在被移除的節點上而不再更新。
watch(showMap, (visible) => {
  if (visible) void renderMap()
  else destroyMap()
})
watch(() => [trip.value?.last_lat, trip.value?.last_lng], () => { void renderMap() })
watch(stops, () => { void renderMap() }, { deep: true })

onMounted(async () => {
  await monitor.init()
  void renderMap()
})

onBeforeUnmount(() => {
  destroyMap()
  monitor.teardown()
})
</script>

<template>
  <div class="bus-monitor">
    <PageHeader title="娃娃車監看" subtitle="今日班次的車輛位置與各站接送進度">
      <template #actions>
        <el-select
          :model-value="selectedRouteId"
          data-testid="bus-monitor-route"
          placeholder="選擇路線"
          style="width: 180px"
          @change="onRouteChange"
        >
          <el-option
            v-for="r in routes"
            :key="r.id"
            :label="r.is_active ? r.name : `${r.name}（停用）`"
            :value="r.id"
          />
        </el-select>
      </template>
    </PageHeader>

    <el-skeleton v-if="loading" :rows="5" animated />

    <template v-else>
      <!--
        快照失敗要放在三態之外：冷啟動就 403 / 500 時 trip 會是 null，掛在其他分支內
        會讓畫面謊稱「今日尚無班次」——那比凍結的地圖更糟。
      -->
      <el-alert
        v-if="snapshotFailed"
        data-testid="bus-monitor-error"
        type="error"
        show-icon
        :closable="false"
        title="無法取得最新班次資料"
        description="與伺服器的連線出了狀況，畫面上的資訊可能已經過時，因此暫時不顯示地圖。"
      />

      <el-empty
        v-else-if="!trip"
        data-testid="bus-monitor-empty"
        description="這條路線今天尚無娃娃車班次"
      />

      <template v-else>
        <div class="bus-monitor__summary" data-testid="bus-monitor-summary">
          {{ tripSummary }}
          <el-tag v-if="isLive" type="success" size="small">行駛中</el-tag>
        </div>

        <!--
          監看頁是唯讀（沒有重設按鈕）——只能引導去調度頁操作，語意同
          BusDispatchView.vue 的同名警示，見 useBusMonitor.ts::rosterOutOfSync。
        -->
        <el-alert
          v-if="rosterOutOfSync"
          data-testid="bus-monitor-roster-out-of-sync"
          type="warning"
          show-icon
          :closable="false"
          title="班次名單有更新，此班次的名單/地址與路線設定不同步"
          description="請到「今日調度」頁按「重設為預設名單」套用最新內容。"
        />

        <el-alert
          v-if="!isLive"
          data-testid="bus-monitor-done"
          type="info"
          show-icon
          :closable="false"
          :title="doneTitle"
        />

        <el-alert
          v-else-if="stale"
          data-testid="bus-monitor-stale"
          type="warning"
          show-icon
          :closable="false"
          title="位置訊號暫時中斷"
          description="車機超過一分鐘沒有回報位置，暫時不顯示地圖；以下為最近一次的接送進度。"
        />

        <p v-if="reconnecting" data-testid="bus-monitor-conn" role="status" aria-live="polite" class="bus-monitor__conn">
          即時連線中斷，正在重新連線⋯（畫面仍會定時更新）
        </p>

        <!-- role=region 的理由同家長端：img 會連 OSM attribution 一起隱藏，裸 div 的 aria-label 會被忽略 -->
        <div
          v-if="showMap"
          ref="mapEl"
          data-testid="bus-monitor-map"
          class="bus-monitor__map"
          role="region"
          aria-label="娃娃車即時位置地圖"
        />
        <p v-if="showMap && lastUpdatedText" class="bus-monitor__updated">{{ lastUpdatedText }}</p>

        <el-table :data="stops" size="small" empty-text="此班次沒有站點">
          <el-table-column prop="seq" label="順序" width="70" />
          <el-table-column prop="student_name" label="學生" />
          <el-table-column label="狀態" width="120">
            <template #default="{ row }">
              <el-tag :type="stopTagType(row.status)">{{ stopLabel(row.status) }}</el-tag>
            </template>
          </el-table-column>
          <!--
            excused 站的原因（第二期起 excused 是落庫事實，後端會跳站）。沒有這欄，
            行政只看得到「這站沒接」，分不出是家長按了今天不搭、老師准的假，還是
            後台自己排除的——三者的後續處置完全不同。
          -->
          <el-table-column label="不搭原因" width="110">
            <template #default="{ row }">
              <el-tag
                v-if="row.status === 'excused'"
                type="warning"
                :data-testid="`bus-monitor-excused-${row.stop_id}`"
              >
                {{ excuseText(row.status, row.excuse_reason) }}
              </el-tag>
            </template>
          </el-table-column>
          <el-table-column label="預計抵達" width="110">
            <template #default="{ row }">
              <span :data-testid="`bus-monitor-eta-${row.stop_id}`">
                {{ stopEtaText(row.status, row.eta_live, row.eta_planned) }}
              </span>
            </template>
          </el-table-column>
          <el-table-column label="離站時間" width="140">
            <template #default="{ row }">
              {{ formatTaipeiClock(row.departed_at) ?? '—' }}
            </template>
          </el-table-column>
        </el-table>
        <p v-if="isLive && endTimeText" data-testid="bus-monitor-end-time" class="bus-monitor__direction">
          {{ endTimeText }}
        </p>
        <p class="bus-monitor__direction">方向：{{ directionLabel }}</p>
      </template>
    </template>
  </div>
</template>

<style scoped>
.bus-monitor {
  padding: var(--space-4, 16px);
  display: flex;
  flex-direction: column;
  gap: var(--space-3, 12px);
}
.bus-monitor__summary {
  display: flex;
  align-items: center;
  gap: var(--space-2, 8px);
  font-weight: 600;
  color: var(--text-primary, #303133);
}
.bus-monitor__map {
  height: 45vh;
  min-height: 260px;
  border-radius: var(--radius-md, 8px);
  overflow: hidden;
}
.bus-monitor__updated,
.bus-monitor__direction,
.bus-monitor__conn {
  margin: 0;
  font-size: var(--text-sm, 13px);
  color: var(--text-tertiary, #909399);
}
.bus-monitor__updated {
  text-align: right;
}
</style>
