<script setup lang="ts">
/**
 * 地圖座標微調 Dialog（FE-ROUTES-06，自 BusRoutesView 內嵌區塊抽出）。
 *
 * 供班次名單、當日調度插入學生、娃娃車設定（園所座標）三處共用：
 * 拖曳 marker 微調，按「確認」才 emit 最終座標（呼叫端決定落庫時機）。
 *
 * 隱私：座標＝家庭住址。只交給 Leaflet 畫點，不得進 console / Sentry /
 * URL query / localStorage / sessionStorage / page title。
 *
 * Leaflet 一律**動態** import（含 CSS），比照 RecruitmentAddressHeatmap.vue：
 * 靜態 import 會把 ~150KB 的地圖庫橋接進首屏 bundle。
 */
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { getBranding, NEUTRAL_MAP_VIEW } from '@/composables/useTenantBranding'

const props = defineProps<{
  visible: boolean
  lat: number | null
  lng: number | null
  /** 站點學生名或「園所位置」 */
  label: string
  /**
   * 無座標時的初始中心（園所座標）；亦無時退租戶 branding.map；
   * 非預設租戶連 branding.map 都沒設定時退中性全台視角（F65）。
   */
  schoolCoords: { lat: number; lng: number } | null
}>()

const emit = defineEmits<{
  confirm: [lat: number, lng: number]
  cancel: []
}>()

const MAP_ZOOM = 16

// leaflet 沒有 @types 套件，比照 repo 既有慣例以 any + 逐行 eslint-disable 承接
// （棘輪規則：修掉 any 時必須連同 disable 註解一起刪）。
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let leafletApi: any = null
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let leafletPromise: Promise<any> | null = null
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let map: any = null
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let marker: any = null

const mapEl = ref<HTMLElement | null>(null)
/** 目前 marker 位置（confirm 時回傳；初值＝initialView().center） */
const current = ref<{ lat: number; lng: number } | null>(null)
/**
 * 初始中心是中性全台視角（沒有任何真實座標可用）時為 true：圖釘所在的「台灣中心」
 * 不是任何人的上下車點，必須拖曳過才准確認，否則會被當真實座標存下去（F65）。
 */
const usingNeutralView = ref(false)
const moved = ref(false)

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

interface InitialView {
  center: [number, number]
  zoom: number
  neutral: boolean
}

function initialView(): InitialView {
  if (props.lat != null && props.lng != null) {
    return { center: [props.lat, props.lng], zoom: MAP_ZOOM, neutral: false }
  }
  if (props.schoolCoords) {
    return { center: [props.schoolCoords.lat, props.schoolCoords.lng], zoom: MAP_ZOOM, neutral: false }
  }
  const brand = getBranding().map
  if (brand) return { center: [brand.lat, brand.lng], zoom: MAP_ZOOM, neutral: false }
  // 非預設租戶未設園所座標：不借用義華座標（F65）
  return {
    center: [NEUTRAL_MAP_VIEW.lat, NEUTRAL_MAP_VIEW.lng],
    zoom: NEUTRAL_MAP_VIEW.zoom,
    neutral: true,
  }
}

async function renderMap(): Promise<void> {
  await nextTick()
  if (!mapEl.value) return
  const L = await ensureLeaflet()
  if (!mapEl.value || !props.visible) return
  const { center, zoom, neutral } = initialView()
  current.value = { lat: center[0], lng: center[1] }
  usingNeutralView.value = neutral
  moved.value = false
  destroyMap()
  map = L.map(mapEl.value).setView(center, zoom)
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; OpenStreetMap contributors', maxZoom: 19,
  }).addTo(map)
  marker = L.marker(center, { draggable: true }).addTo(map)
  marker.on('dragend', () => {
    const pos = marker.getLatLng()
    current.value = { lat: pos.lat, lng: pos.lng }
    moved.value = true
  })
}

function destroyMap(): void {
  if (!map) return
  map.remove?.()
  map = null
  marker = null
}

// 不用 el-dialog 的 @opened（依賴 transition after-enter）：mounted 時已可見就
// render，之後 watch visible（flush: 'post' 等 teleport 內容 render 完才拿 mapEl）。
// 測試環境（happy-dom）也能觸發。
onMounted(() => {
  if (props.visible) void renderMap()
})
watch(
  () => props.visible,
  (visible) => {
    if (visible) void renderMap()
    else destroyMap()
  },
  { flush: 'post' },
)

function onConfirm(): void {
  const c = current.value
  if (!c || (usingNeutralView.value && !moved.value)) return
  emit('confirm', c.lat, c.lng)
}

onBeforeUnmount(destroyMap)
</script>

<template>
  <el-dialog
    :model-value="visible"
    title="拖曳圖釘微調位置"
    width="80%"
    @close="emit('cancel')"
  >
    <p class="bus-stop-map-tuner__hint" data-test="tune-hint">
      {{ label }}：若定位跟實際上下車點有落差，請拖曳圖釘微調。
    </p>
    <p v-if="usingNeutralView" class="bus-stop-map-tuner__hint" data-test="tune-neutral-hint">
      尚未設定園所座標，地圖先顯示全台灣；請放大後把圖釘拖到正確位置再按「確認」。
    </p>
    <!--
      role 用 region 而非 img：img 會讓容器內容變 presentational，連 Leaflet 的
      縮放鈕與 OpenStreetMap attribution 連結（授權要求可觸及）一起被輔助科技
      隱藏；裸 div 的 aria-label 又會被多數螢幕閱讀器忽略。region 兩者兼得。
    -->
    <div ref="mapEl" class="bus-stop-map-tuner__map" role="region" aria-label="位置微調地圖" />
    <template #footer>
      <el-button data-test="cancel-btn" @click="emit('cancel')">取消</el-button>
      <el-button
        type="primary"
        data-test="confirm-btn"
        :disabled="usingNeutralView && !moved"
        @click="onConfirm"
      >確認</el-button>
    </template>
  </el-dialog>
</template>

<style scoped>
.bus-stop-map-tuner__hint {
  margin: 0 0 8px;
  color: var(--el-text-color-secondary);
  font-size: 13px;
}

.bus-stop-map-tuner__map {
  height: 420px;
  border-radius: 8px;
}
</style>
