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

const monitor = useBusMonitor()
const {
  routes, selectedRouteId, trip, stops, loading, snapshotFailed,
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

function stopTagType(status: string): 'success' | 'info' | undefined {
  if (status === 'departed') return 'success'
  if (status === 'skipped') return 'info'
  return undefined
}
function stopLabel(status: string): string {
  if (status === 'departed') return '已離站'
  if (status === 'skipped') return '已跳過'
  return '待接送'
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
            這站仍是 pending（後端刻意不自動跳站，怕請假資料有誤漏接）——沒有這欄，
            行政只會看到「這站沒接」而誤判成漏接，得靠這個標示明講「預期如此」。
          -->
          <el-table-column label="請假" width="90">
            <template #default="{ row }">
              <el-tag
                v-if="row.on_leave"
                type="warning"
                :data-testid="`bus-monitor-onleave-${row.stop_id}`"
              >
                已請假
              </el-tag>
            </template>
          </el-table-column>
          <el-table-column label="離站時間" width="140">
            <template #default="{ row }">
              {{ formatTaipeiClock(row.departed_at) ?? '—' }}
            </template>
          </el-table-column>
        </el-table>
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
