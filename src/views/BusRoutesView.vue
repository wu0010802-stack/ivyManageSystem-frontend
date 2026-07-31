<script setup lang="ts">
/**
 * 管理端娃娃車路線管理（route `/bus-routes`，權限 `BUS_WRITE`）。
 *
 * 業務邏輯全在 `@/composables/useBusRouteEditor`（含 replace-all 語意、未儲存保護、
 * 站數上限、候選名單過濾）；本檔只負責呈現與地圖微調。
 *
 * ⚠ 後端目前**沒有**路線改名／停用／刪除端點（`api/bus/admin_routes.py` 只有
 * GET routes / POST routes / PUT stops / POST geocode）。因此本頁：
 * - 建立路線一律先確認（建錯了刪不掉）
 * - 只顯示 `is_active`，不提供停用開關（做了也沒有端點可打）
 *
 * 隱私：站點座標＝家庭住址。座標只交給 Leaflet 畫點與表格顯示（管理端有
 * `BUS_WRITE`，看得到是合理的），但不得進 console / Sentry / URL query /
 * localStorage / sessionStorage / page title。
 *
 * Leaflet 一律**動態** import（含 CSS），比照 `RecruitmentAddressHeatmap.vue` 與
 * 家長端 `BusTrackingView.vue`：靜態 import 會把 ~150KB 的地圖庫橋接進首屏 bundle。
 */
import { computed, nextTick, onBeforeUnmount, ref } from 'vue'
import { onBeforeRouteLeave } from 'vue-router'
import { ElMessageBox } from 'element-plus'
import PageHeader from '@/components/common/PageHeader.vue'
import {
  useBusRouteEditor, DIRECTION_LABELS, MAX_STOPS_PER_DIRECTION, type BusDirection,
} from '@/composables/useBusRouteEditor'

const editor = useBusRouteEditor()
const {
  routes, activeRoute, activeRouteId, direction, stops, candidates,
  loading, saving, creating, geocodingStudentId, dirty, missingCoordinateCount,
} = editor

const pickStudentId = ref<number | null>(null)
const mapDialogVisible = ref(false)
const tuneStudentId = ref<number | null>(null)
const tuneMapEl = ref<HTMLElement | null>(null)

const tuneStop = computed(
  () => stops.value.find((s) => s.student_id === tuneStudentId.value) ?? null,
)
const directionTabs: Array<{ name: BusDirection; label: string }> = [
  { name: 'morning', label: DIRECTION_LABELS.morning },
  { name: 'afternoon', label: DIRECTION_LABELS.afternoon },
]

void editor.init()

/**
 * 分頁與路線下拉一律用 `:model-value` 單向綁定 + 事件回寫：`v-model` 會在
 * composable 的「未儲存確認」還沒回答之前就把畫面切走，使用者按「留在這裡」也回不去。
 */
async function onDirectionChange(name: string | number): Promise<void> {
  await editor.setDirection(String(name) as BusDirection)
}

async function onRouteChange(routeId: number): Promise<void> {
  await editor.selectRoute(routeId)
}

function onAddStop(): void {
  editor.addStop(pickStudentId.value)
  pickStudentId.value = null
}

async function onCreateRoute(): Promise<void> {
  try {
    // ElMessageBox 的回傳型別是 union（confirm 回字串、prompt 回 { value }），
    // 故以 narrow 取值而非解構。
    const result = await ElMessageBox.prompt(
      '路線建立後目前無法改名或刪除，請確認名稱。', '新增娃娃車路線',
      { confirmButtonText: '建立', cancelButtonText: '取消', inputPattern: /\S/, inputErrorMessage: '請輸入路線名稱' },
    )
    const input = typeof result === 'object' && result !== null && 'value' in result
      ? String((result as { value?: unknown }).value ?? '')
      : ''
    await editor.createRoute(input)
  } catch {
    /* 使用者取消 */
  }
}

// ── 地圖微調（Leaflet 動態載入）──────────────────────────────────────────────
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

/** 沒有座標時的起始視野：高雄市中心（園所所在地），只作為拖曳起點。 */
const FALLBACK_CENTER: [number, number] = [22.6273, 120.3014]
const MAP_ZOOM = 16

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

function openMapTune(studentId: number): void {
  tuneStudentId.value = studentId
  mapDialogVisible.value = true
}

async function renderTuneMap(): Promise<void> {
  await nextTick()
  const stop = tuneStop.value
  if (!tuneMapEl.value || !stop) return
  const L = await ensureLeaflet()
  if (!tuneMapEl.value || !tuneStop.value) return
  const center: [number, number] = stop.lat != null && stop.lng != null
    ? [stop.lat, stop.lng]
    : FALLBACK_CENTER
  destroyMap()
  map = L.map(tuneMapEl.value).setView(center, MAP_ZOOM)
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; OpenStreetMap contributors', maxZoom: 19,
  }).addTo(map)
  marker = L.marker(center, { draggable: true }).addTo(map)
  marker.on('dragend', () => {
    const pos = marker.getLatLng()
    const id = tuneStudentId.value
    if (id !== null) editor.setCoordinates(id, pos.lat, pos.lng)
  })
}

function destroyMap(): void {
  if (!map) return
  map.remove?.()
  map = null
  marker = null
}

function closeMapTune(): void {
  destroyMap()
  tuneStudentId.value = null
}

// 離開頁面前保護未儲存的編輯（replace-all 語意下，重排一輪的成本不低）
onBeforeRouteLeave(async () => {
  if (!dirty.value) return true
  try {
    await ElMessageBox.confirm(
      '這個方向有尚未儲存的變更，離開後會遺失。確定要離開嗎？', '尚未儲存',
      { type: 'warning', confirmButtonText: '離開', cancelButtonText: '留在這裡' },
    )
    return true
  } catch {
    return false
  }
})

onBeforeUnmount(destroyMap)
</script>

<template>
  <div class="bus-routes">
    <PageHeader title="娃娃車路線" subtitle="設定各路線早上接、下午送的停靠順序與座標">
      <template #actions>
        <el-button type="primary" :loading="creating" @click="onCreateRoute">新增路線</el-button>
      </template>
    </PageHeader>

    <el-skeleton v-if="loading" :rows="6" animated />

    <el-empty
      v-else-if="!routes.length"
      data-testid="bus-routes-empty"
      description="尚未建立任何娃娃車路線"
    >
      <el-button type="primary" @click="onCreateRoute">建立第一條路線</el-button>
    </el-empty>

    <template v-else>
      <div class="bus-routes__toolbar">
        <el-select
          :model-value="activeRouteId"
          data-testid="bus-route-select"
          placeholder="選擇路線"
          style="width: 200px"
          @change="onRouteChange"
        >
          <el-option
            v-for="r in routes"
            :key="r.id"
            :label="r.is_active ? r.name : `${r.name}（停用）`"
            :value="r.id"
          />
        </el-select>
        <el-tag v-if="activeRoute && !activeRoute.is_active" type="info">此路線已停用，不會出現在開班選單</el-tag>
      </div>

      <el-tabs :model-value="direction" @tab-change="onDirectionChange">
        <el-tab-pane v-for="tab in directionTabs" :key="tab.name" :label="tab.label" :name="tab.name" />
      </el-tabs>

      <div class="bus-routes__toolbar">
        <el-select
          v-model="pickStudentId"
          filterable
          clearable
          placeholder="加入搭車學生"
          style="width: 220px"
          data-testid="bus-student-select"
        >
          <el-option v-for="s in candidates" :key="s.id" :label="s.name" :value="s.id" />
        </el-select>
        <el-button :disabled="pickStudentId === null" @click="onAddStop">加入</el-button>
        <el-button
          v-if="direction === 'afternoon'"
          data-testid="bus-mirror"
          @click="editor.mirrorFromMorning()"
        >
          帶入早接反序
        </el-button>
        <el-button type="primary" :loading="saving" data-testid="bus-save" @click="editor.save()">
          儲存此方向
        </el-button>
        <el-tag v-if="dirty" type="warning" data-testid="bus-dirty">尚未儲存</el-tag>
        <span class="bus-routes__count">
          {{ stops.length }} / {{ MAX_STOPS_PER_DIRECTION }} 站
        </span>
      </div>

      <el-alert
        v-if="missingCoordinateCount > 0"
        data-testid="bus-missing-coords"
        type="warning"
        show-icon
        :closable="false"
        :title="`有 ${missingCoordinateCount} 站尚未定位，家長端不會看到該站位置`"
      />

      <el-table :data="stops" size="small" row-key="student_id" empty-text="此方向尚未排入任何學生">
        <el-table-column label="順序" width="130">
          <template #default="{ $index }">
            <span class="bus-routes__seq">{{ $index + 1 }}</span>
            <el-button text size="small" :disabled="$index === 0" aria-label="上移" @click="editor.move($index, -1)">↑</el-button>
            <el-button text size="small" :disabled="$index === stops.length - 1" aria-label="下移" @click="editor.move($index, 1)">↓</el-button>
          </template>
        </el-table-column>
        <el-table-column prop="student_name" label="學生" />
        <el-table-column label="座標">
          <template #default="{ row }">
            <span v-if="row.lat != null && row.lng != null">
              {{ row.lat.toFixed(5) }}, {{ row.lng.toFixed(5) }}
            </span>
            <el-tag v-else type="warning">未定位</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="240">
          <template #default="{ row, $index }">
            <el-button
              size="small"
              :loading="geocodingStudentId === row.student_id"
              @click="editor.geocodeStop(row.student_id)"
            >
              定位
            </el-button>
            <el-button size="small" @click="openMapTune(row.student_id)">地圖微調</el-button>
            <el-button size="small" type="danger" text @click="editor.removeStop($index)">移除</el-button>
          </template>
        </el-table-column>
      </el-table>
    </template>

    <el-dialog
      v-model="mapDialogVisible"
      title="拖曳圖釘微調停靠點"
      width="80%"
      @opened="renderTuneMap"
      @closed="closeMapTune"
    >
      <p class="bus-routes__tune-hint">
        {{ tuneStop?.student_name }}：地址定位只到巷弄層級，請拖曳到實際上下車的位置。
      </p>
      <!--
        role 用 region 而非 img：img 會讓容器內容變 presentational，連 Leaflet 的縮放鈕與
        OpenStreetMap attribution 連結（授權要求可觸及）一起被輔助科技隱藏；裸 div 的
        aria-label 又會被多數螢幕閱讀器忽略。region 兩者兼得。
      -->
      <div ref="tuneMapEl" class="bus-routes__map" role="region" aria-label="停靠點位置微調地圖" />
    </el-dialog>
  </div>
</template>

<style scoped>
.bus-routes {
  padding: var(--space-4, 16px);
  display: flex;
  flex-direction: column;
  gap: var(--space-3, 12px);
}
.bus-routes__toolbar {
  display: flex;
  align-items: center;
  gap: var(--space-2, 8px);
  flex-wrap: wrap;
}
.bus-routes__count {
  color: var(--text-tertiary, #909399);
  font-size: var(--text-sm, 13px);
}
.bus-routes__seq {
  display: inline-block;
  min-width: 1.5em;
}
.bus-routes__map {
  height: 50vh;
  border-radius: var(--radius-md, 8px);
  overflow: hidden;
}
.bus-routes__tune-hint {
  margin: 0 0 var(--space-2, 8px);
  color: var(--text-secondary, #606266);
  font-size: var(--text-sm, 13px);
}
</style>
