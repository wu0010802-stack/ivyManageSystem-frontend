<script setup lang="ts">
/**
 * 路線預覽地圖（FE-ROUTES-08）。
 *
 * 把後端 `route_shape`（Azure 實際道路折線＋逐段行駛資料）畫成地圖：園所起終點、
 * 依新順序編號的站點、以及實際走法。折線來自最佳化同一次 Azure 回應
 * （`routeOutputOptions` 本來就含 `routePath`），**不額外計費**。
 *
 * 單段高亮（`highlightSeq`）：hover 名單某一位時，把「上一個點 → 這一站」那一段
 * 標紅並放大該站圖釘——`legs[seq - 1]` 即該段（段序與點序對齊，見 RouteLegOut）。
 * 高亮**不重建地圖**（只換 icon 與紅線圖層），否則每次滑過都閃一次白。
 *
 * 降級：後端沒回幾何（`polyline` 空）時改畫站點之間的虛線直線，並標明那是示意
 * 連線而非實際路徑——沒有路徑資料時畫實線會讓人誤以為車真的那樣開。單段幾何
 * 缺漏時同理，高亮退成「上一點 → 這一站」的紅色虛線。
 *
 * 隱私：站點座標與折線＝接送地址等級資料。只交給 Leaflet 畫圖，**不得**進
 * console／Sentry／URL query／localStorage／sessionStorage／page title；
 * marker 的 tooltip 只放學生名與順位，不放座標數字。
 *
 * Leaflet 一律**動態** import（含 CSS），比照 BusStopMapTuner.vue：靜態 import
 * 會把 ~150KB 的地圖庫橋接進首屏 bundle。
 */
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { getBranding } from '@/composables/useTenantBranding'

export interface RoutePreviewStop {
  /** 顯示順位（1-based），即最佳化後的新順序 */
  seq: number
  label: string
  lat: number | null
  lng: number | null
}

export interface RoutePreviewLeg {
  /** 這一段的道路折線，[lat, lng] 序列；空＝後端沒給這段幾何 */
  polyline: number[][]
}

const props = withDefaults(defineProps<{
  /** 全程道路折線，[lat, lng] 序列；空陣列＝後端沒給幾何，改畫示意直線 */
  polyline: number[][]
  stops: RoutePreviewStop[]
  /** 園所座標（路線起終點）；缺座標時只畫站點 */
  origin: { lat: number; lng: number } | null
  /** 逐段幾何；`legs[seq - 1]`＝「上一個點 → 第 seq 站」 */
  legs?: RoutePreviewLeg[]
  /** 要高亮的站順位（hover 中的那一位）；null＝不高亮 */
  highlightSeq?: number | null
  /** 是否可見；隱藏時銷毀地圖實例（Dialog 內用） */
  visible?: boolean
}>(), { legs: () => [], highlightSeq: null, visible: true })

const FALLBACK_ZOOM = 14
const LINE_COLOR = '#409eff'
const HIGHLIGHT_COLOR = '#f56c6c'

// leaflet 沒有 @types 套件，比照 repo 既有慣例以 any + 逐行 eslint-disable 承接
// （棘輪規則：修掉 any 時必須連同 disable 註解一起刪）。
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let leafletApi: any = null
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let leafletPromise: Promise<any> | null = null
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let map: any = null
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const markersBySeq = new Map<number, any>()
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let highlightLayer: any = null

const mapEl = ref<HTMLElement | null>(null)

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

/** 有座標的站（缺座標的站畫不出來，但仍在表格裡，不靜默當作不存在）。 */
function locatedStops(): Array<RoutePreviewStop & { lat: number; lng: number }> {
  return props.stops.flatMap((s) => (
    s.lat != null && s.lng != null ? [{ ...s, lat: s.lat, lng: s.lng }] : []
  ))
}

function toLatLngs(raw: number[][]): Array<[number, number]> {
  return raw.filter((p) => p.length >= 2).map((p) => [p[0], p[1]])
}

/** 站點編號圖釘：用 divIcon 直接把順位畫在圖上，免得要逐一點開才知道順序。 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function seqIcon(L: any, seq: number, active: boolean) {
  const size = active ? 38 : 26
  return L.divIcon({
    className: `bus-route-preview-map__pin${active ? ' is-active' : ''}`,
    html: `<span class="bus-route-preview-map__pin-body">${seq}</span>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  })
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function originIcon(L: any) {
  return L.divIcon({
    className: 'bus-route-preview-map__pin is-origin',
    html: '<span class="bus-route-preview-map__pin-body">園</span>',
    iconSize: [26, 26],
    iconAnchor: [13, 13],
  })
}

/** 高亮段的起點：第 1 站是園所出發，其餘是前一站。 */
function highlightFrom(seq: number): [number, number] | null {
  const stops = locatedStops()
  if (seq <= 1) return props.origin ? [props.origin.lat, props.origin.lng] : null
  const prev = stops.find((s) => s.seq === seq - 1)
  return prev ? [prev.lat, prev.lng] : null
}

/**
 * 只更新高亮，不動底圖：換 marker icon ＋ 重畫紅線圖層。
 * 高亮點若落在視野外才 panTo——每次 hover 都 recenter 會讓整張圖跳個不停。
 */
function applyHighlight(): void {
  if (!map || !leafletApi) return
  const L = leafletApi
  const active = props.highlightSeq

  markersBySeq.forEach((marker, seq) => {
    marker.setIcon?.(seqIcon(L, seq, seq === active))
  })

  if (highlightLayer) {
    highlightLayer.remove?.()
    highlightLayer = null
  }
  if (active == null) return

  const leg = props.legs[active - 1]
  const segment = toLatLngs(leg?.polyline ?? [])
  if (segment.length >= 2) {
    highlightLayer = L.polyline(segment, {
      color: HIGHLIGHT_COLOR, weight: 7, opacity: 0.95,
    }).addTo(map)
  } else {
    // 沒有這段的道路幾何：退成「上一點 → 這一站」的直線，虛線表示只是示意
    const from = highlightFrom(active)
    const to = locatedStops().find((s) => s.seq === active)
    if (from && to) {
      highlightLayer = L.polyline([from, [to.lat, to.lng]], {
        color: HIGHLIGHT_COLOR, weight: 5, opacity: 0.9, dashArray: '6 6',
      }).addTo(map)
    }
  }
  highlightLayer?.bringToFront?.()

  const target = markersBySeq.get(active)
  const pos = target?.getLatLng?.()
  if (pos && map.getBounds?.()?.contains?.(pos) === false) map.panTo(pos)
}

async function renderMap(): Promise<void> {
  await nextTick()
  if (!mapEl.value || !props.visible) return
  const L = await ensureLeaflet()
  if (!mapEl.value || !props.visible) return

  destroyMap()
  const stops = locatedStops()
  const line = toLatLngs(props.polyline)

  map = L.map(mapEl.value)
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; OpenStreetMap contributors', maxZoom: 19,
  }).addTo(map)

  if (line.length >= 2) {
    L.polyline(line, { color: LINE_COLOR, weight: 5, opacity: 0.85 }).addTo(map)
  } else if (stops.length >= 1) {
    // 沒有道路幾何時只畫示意直線（虛線），語意差別由圖例文字說明
    const originLatLng: Array<[number, number]> = props.origin
      ? [[props.origin.lat, props.origin.lng]]
      : []
    const via: Array<[number, number]> = [
      ...originLatLng,
      ...stops.map((s) => [s.lat, s.lng] as [number, number]),
      ...originLatLng,
    ]
    if (via.length >= 2) {
      L.polyline(via, { color: '#909399', weight: 3, opacity: 0.7, dashArray: '6 6' }).addTo(map)
    }
  }

  if (props.origin) {
    L.marker([props.origin.lat, props.origin.lng], { icon: originIcon(L) })
      .addTo(map)
      .bindTooltip('園所（起點／終點）')
  }
  stops.forEach((s) => {
    const marker = L.marker([s.lat, s.lng], { icon: seqIcon(L, s.seq, false) })
      .addTo(map)
      .bindTooltip(`${s.seq}. ${s.label}`)
    markersBySeq.set(s.seq, marker)
  })

  const bounds: Array<[number, number]> = [
    ...line,
    ...stops.map((s) => [s.lat, s.lng] as [number, number]),
    ...(props.origin ? [[props.origin.lat, props.origin.lng] as [number, number]] : []),
  ]
  if (bounds.length >= 2) {
    map.fitBounds(bounds, { padding: [24, 24] })
  } else if (bounds.length === 1) {
    map.setView(bounds[0], FALLBACK_ZOOM)
  } else {
    const { lat, lng } = getBranding().map
    map.setView([lat, lng], FALLBACK_ZOOM)
  }

  applyHighlight()  // 重建後恢復目前的 hover 狀態
}

function destroyMap(): void {
  markersBySeq.clear()
  highlightLayer = null
  if (!map) return
  map.remove?.()
  map = null
}

onMounted(() => {
  if (props.visible) void renderMap()
})

// flush: 'post' 等 teleport／v-if 內容 render 完才拿 mapEl（Dialog 內用時必要）
watch(
  () => [props.visible, props.polyline, props.stops, props.origin],
  () => {
    if (props.visible) void renderMap()
    else destroyMap()
  },
  { flush: 'post', deep: true },
)

// highlightSeq **不**進上面那個 watch：hover 只換圖層，重建整張地圖會閃白。
watch(() => props.highlightSeq, applyHighlight, { flush: 'post' })

onBeforeUnmount(destroyMap)
</script>

<template>
  <div class="bus-route-preview-map" data-test="route-preview-map">
    <!--
      role 用 region 而非 img：img 會讓容器內容變 presentational，連 Leaflet 的
      縮放鈕與 OpenStreetMap attribution 連結（授權要求可觸及）一起被輔助科技
      隱藏；裸 div 的 aria-label 又會被多數螢幕閱讀器忽略。region 兩者兼得。
    -->
    <div ref="mapEl" class="bus-route-preview-map__canvas" role="region" aria-label="路線預覽地圖" />
    <p class="bus-route-preview-map__legend" data-test="route-preview-legend">
      <template v-if="polyline.length >= 2">
        藍線為 Azure 依實際道路規劃的走法，數字為停靠順位；把游標移到上方名單的
        某一位，會標出「上一站 → 該站」的路段。
      </template>
      <template v-else>
        目前沒有道路路徑資料，灰色虛線只是站點連線示意，不代表實際走法。
      </template>
    </p>
  </div>
</template>

<style scoped>
.bus-route-preview-map__canvas {
  width: 100%;
  height: 360px;
  border-radius: 4px;
}
.bus-route-preview-map__legend {
  margin: 6px 0 0;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}
/*
  divIcon 的內容在 Leaflet 的 pane 裡，不受 scoped 屬性選擇器涵蓋 → 用 :deep。
*/
.bus-route-preview-map :deep(.bus-route-preview-map__pin-body) {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
  border-radius: 50%;
  background: var(--el-color-primary);
  color: #fff;
  font-size: 12px;
  font-weight: 700;
  box-shadow: 0 1px 4px rgb(0 0 0 / 35%);
  transition: background-color 0.15s ease;
}
.bus-route-preview-map :deep(.is-origin .bus-route-preview-map__pin-body) {
  background: var(--el-color-success);
}
/* 高亮站：放大＋轉紅＋描白邊，和藍色路線上的其他站拉開差距 */
.bus-route-preview-map :deep(.is-active .bus-route-preview-map__pin-body) {
  background: var(--el-color-danger);
  font-size: 16px;
  border: 2px solid #fff;
  box-shadow: 0 2px 10px rgb(0 0 0 / 45%);
}
</style>
