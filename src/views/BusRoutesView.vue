<script setup lang="ts">
/**
 * 管理端娃娃車**班次設定**（route `/bus/routes`，權限 `BUS_WRITE`）。
 *
 * 本檔只負責組裝與呈現；業務邏輯全在 `@/composables/useBusRouteEditor`
 * （replace-all 語意、未儲存保護、跨班次 ride_days 交集判定、逐星期 capacity、
 * 拖拉自動釘選、最佳化預覽）。
 *
 * 組裝的子元件：
 * - `BusRouteSidebar`（FE-ROUTES-02）：早接／午送分組、拖拉 sort_order
 * - `BusRouteForm`（FE-ROUTES-03）：班次欄位（方向與結束時間唯讀）
 * - `BusRouteStopsTable`（FE-ROUTES-04）：名單編輯
 * - `BusOptimizePreviewDialog`（FE-ROUTES-05）：自動排序預覽 → 套用
 * - `BusStopMapTuner`（FE-ROUTES-06）：地址選定**之後**的實際上下車點微調
 * - `BusPickupAddressSelect`（FE-ROUTES-07）：接送地址選擇／就地新增
 *
 * ⚠ 後端**沒有**班次刪除端點（只能停用）。因此建立班次一律先確認，已停用的班次
 * 仍留在側欄並標示，否則停用後就再也改不回來。
 *
 * 隱私：站點座標＝接送地址座標。座標只交給地圖微調元件使用，**不渲染成任何欄位**
 * （FE-ROUTES-04 決策：座標欄改顯示地址文字），也不得進 console / Sentry /
 * URL query / localStorage / sessionStorage / page title。
 */
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { onBeforeRouteLeave } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import PageHeader from '@/components/common/PageHeader.vue'
import BusRouteSidebar from '@/components/bus/BusRouteSidebar.vue'
import BusRouteForm from '@/components/bus/BusRouteForm.vue'
import BusRouteStopsTable from '@/components/bus/BusRouteStopsTable.vue'
import BusOptimizePreviewDialog from '@/components/bus/BusOptimizePreviewDialog.vue'
import BusStopMapTuner from '@/components/bus/BusStopMapTuner.vue'
import BusPickupAddressSelect from '@/components/bus/BusPickupAddressSelect.vue'
import type { OptimizePreview } from '@/components/bus/BusOptimizePreviewDialog.vue'
import type { BusRouteFormPayload } from '@/components/bus/BusRouteForm.vue'
import { getEmployees } from '@/api/employees'
import { geocodeBusStudent, getBusSettings } from '@/api/bus'
import { apiError } from '@/utils/error'
import {
  useBusRouteEditor, DIRECTION_LABELS, MAX_STOPS_PER_ROUTE, WEEKDAY_LABELS,
  type BusDirection, type RouteOptimizePreview,
} from '@/composables/useBusRouteEditor'

const editor = useBusRouteEditor()
const {
  routes, activeRoute, activeRouteId, stops, candidates, capacity,
  loading, saving, creating, updatingRoute, reordering, optimizing, recomputingEtas,
  copying, dirty,
  missingCoordinateCount, staleAddressCount, overloadedWeekdays, copyConflicts,
  loadFailed, studentsFailed, anyDirty,
} = editor

/**
 * 名單編輯的整組鎖：任何一支「完成後會 loadRoutes → resetEditing」的請求 in-flight
 * 時，表格與 toolbar 的編輯入口一起鎖。表格 readonly 但 toolbar 還能按的話，
 * 使用者在 recompute（Azure，可能跑數秒）期間加的站會被完成後的重讀無聲清掉。
 */
const editingLocked = computed(
  () => saving.value || optimizing.value || recomputingEtas.value || copying.value,
)

const pickStudentId = ref<number | null>(null)
const employees = ref<Array<{ id: number; name: string }>>([])
/**
 * 園所座標，只給 `BusStopMapTuner` 當「站點還沒有座標」時的地圖初始中心。
 * 取不到就傳 null，元件自己會退租戶 branding.map，不會白畫面。
 */
const schoolCoords = ref<{ lat: number; lng: number } | null>(null)
/** 班次設定表單的未儲存旗標（composable 的 `dirty` 只追蹤名單）。 */
const formDirty = ref(false)
/**
 * 把表單也接進 composable 的 `confirmDiscard` 防線，`selectRoute` /
 * `updateRoute` / `reorderRoutes` / `createRoute` 四條既有路徑就自動涵蓋表單。
 */
editor.registerExtraDirty(() => formDirty.value)
/** 員工名單載入失敗：隨車老師選單是空的，但**不是**「園裡沒有老師」。 */
const employeesFailed = ref(false)

void editor.init()

// ── 隨車老師候選（只留 id/name；員工回應還帶身分證／薪資等欄位）──────────────
async function loadEmployees(): Promise<void> {
  employeesFailed.value = false
  try {
    const res = await getEmployees({ is_active: true })
    const raw = (res as { data?: unknown }).data
    const items = Array.isArray(raw)
      ? raw
      : (raw && typeof raw === 'object' && Array.isArray((raw as { items?: unknown }).items)
        ? (raw as { items: unknown[] }).items
        : [])
    employees.value = items.flatMap((item) => {
      const r = item as { id?: unknown; name?: unknown }
      return typeof r?.id === 'number'
        ? [{ id: r.id, name: typeof r.name === 'string' ? r.name : `員工 #${r.id}` }]
        : []
    })
  } catch {
    // 不擋整頁（其他編輯照樣能做），但空選單看起來就像「園裡沒有可指派的老師」，
    // 必須明說是載入失敗——與同頁 loadFailed／studentsFailed 同一條誠實降級標準。
    employeesFailed.value = true
    employees.value = []
  }
}
void loadEmployees()

async function loadSchoolCoords(): Promise<void> {
  try {
    const res = await getBusSettings()
    const data = (res as { data?: { school_lat?: number | null; school_lng?: number | null } }).data
    const lat = data?.school_lat
    const lng = data?.school_lng
    schoolCoords.value = typeof lat === 'number' && typeof lng === 'number' ? { lat, lng } : null
  } catch {
    // 只是地圖初始中心，取不到不影響任何編輯；元件有 branding fallback。
    schoolCoords.value = null
  }
}
void loadSchoolCoords()

// ── 側欄 ──────────────────────────────────────────────────────────────────

async function onSelectRoute(routeId: number): Promise<void> {
  await editor.selectRoute(routeId)
}

/**
 * reorder 沒寫進去（確認被取消或 PATCH 失敗）時強制側欄重掛：vuedraggable 是單向
 * `:model-value`，拖放已經動了 DOM，而 props 沒變不會觸發重繪（keyed diff 對相同
 * key 順序也不會把 DOM 搬回來），畫面會停在「看起來排好了、實際上沒寫進去」的順序。
 */
const sidebarRenderKey = ref(0)

async function onReorderRoutes(payload: { direction: BusDirection; ids: number[] }): Promise<void> {
  const ok = await editor.reorderRoutes(payload.ids)
  if (!ok) sidebarRenderKey.value += 1
}

// ── 新增班次 Dialog（含「帶入其他班次名單」）────────────────────────────────

const createVisible = ref(false)
const createName = ref('')
const createDirection = ref<BusDirection>('morning')
const createDepartTime = ref('07:30:00')
const createCapacity = ref<number | undefined>(20)
const copySourceRouteId = ref<number | null>(null)
const copyReverse = ref(true)

const DIRECTION_OPTIONS: Array<{ value: BusDirection; label: string }> = [
  { value: 'morning', label: DIRECTION_LABELS.morning },
  { value: 'afternoon', label: DIRECTION_LABELS.afternoon },
]

/** 可當來源的班次＝除了正在建立的以外全部（跨方向也可以，反序就是典型用法）。 */
const copySourceOptions = computed(() => routes.value)

function openCreateDialog(): void {
  createName.value = ''
  createDirection.value = 'morning'
  createDepartTime.value = '07:30:00'
  createCapacity.value = 20
  copySourceRouteId.value = null
  copyReverse.value = true
  createVisible.value = true
}

async function onCreateRoute(): Promise<void> {
  // RouteCreateIn.capacity 是必填 gt=0；el-input-number 被清空時是 undefined。
  if (typeof createCapacity.value !== 'number') {
    ElMessage.error('請輸入座位上限')
    return
  }
  const newId = await editor.createRoute({
    name: createName.value,
    direction: createDirection.value,
    depart_time: createDepartTime.value,
    capacity: createCapacity.value,
  })
  if (newId === null) return
  createVisible.value = false
  // 建立成功才帶名單：copy-from 需要一個已存在的目標班次。
  if (copySourceRouteId.value !== null) {
    await editor.copyFromRoute(copySourceRouteId.value, copyReverse.value)
  }
}

// ── 班次設定表單 ──────────────────────────────────────────────────────────

async function onSubmitRouteForm(payload: BusRouteFormPayload): Promise<void> {
  const routeId = activeRouteId.value
  if (routeId === null) return
  await editor.updateRoute(routeId, payload)
}

// ── 名單編輯 ──────────────────────────────────────────────────────────────

function onAddStop(): void {
  editor.addStop(pickStudentId.value)
  pickStudentId.value = null
}

// ── 接送地址 Dialog ────────────────────────────────────────────────────────

const addressDialogVisible = ref(false)
const addressStopIndex = ref<number | null>(null)

const addressStop = computed(() =>
  addressStopIndex.value === null ? null : (stops.value[addressStopIndex.value] ?? null),
)

function openAddressDialog(index: number): void {
  addressStopIndex.value = index
  addressDialogVisible.value = true
}

/**
 * 後端的「住家」虛擬項是寫死的 `lat/lng: None`（住家地址不入地址簿表，自然沒有
 * geocode 結果）。若不補這一段，選住家就等於把站點座標清空 → 該班次無法發車。
 * `POST /bus/routes/geocode` 正是為這條路徑保留的：依學生住址查座標，不落庫、
 * 隨名單一起儲存。查不到就明說要改用地圖微調，不留一個沒有下一步的死巷。
 *
 * **重選同一筆且站點已有座標時跳過 geocode**：原本就用住家、已用地圖微調好
 * 上下車點的站，再點一次住家不能被巷弄級的 geocode 結果蓋回去（composable 的
 * `setPickupAddress` 對 sameAddress 會保留既有座標，這裡不 geocode 它就不會被動）。
 * 刪除地址退回住家的路徑不受影響——站點原本指向被刪的那筆，id 必不同，照樣重查。
 */
async function onAddressResolved(
  resolved: {
    id: number | null
    lat: number | null
    lng: number | null
    address: string
    reason: 'selected' | 'fallback'
  },
): Promise<void> {
  const index = addressStopIndex.value
  const stop = addressStop.value
  if (index === null || !stop) return
  let { lat, lng } = resolved
  const sameAddressWithCoords =
    resolved.id === stop.pickup_address_id && stop.lat !== null && stop.lng !== null
  if (resolved.id === null && (lat === null || lng === null) && !sameAddressWithCoords) {
    try {
      const res = await geocodeBusStudent(stop.student_id)
      const data = (res as { data?: { lat?: number | null; lng?: number | null } }).data
      if (typeof data?.lat === 'number' && typeof data?.lng === 'number') {
        lat = data.lat
        lng = data.lng
        ElMessage.success('已帶入住家座標（僅到巷弄層級，請用地圖微調到實際上下車點）')
      } else {
        ElMessage.warning('住家地址查不到座標，請用「地圖微調」手動放置，否則無法發車')
      }
    } catch (e) {
      ElMessage.warning(apiError(e, '住家地址查不到座標，請用「地圖微調」手動放置，否則無法發車'))
    }
  }
  editor.setPickupAddress(index, { id: resolved.id, lat, lng, address: resolved.address || null })
  // fallback（刪除選中地址被動退回住家）時使用者還在管理地址簿，不關 Dialog。
  if (resolved.reason !== 'fallback') addressDialogVisible.value = false
}

// ── 地圖微調 Dialog ────────────────────────────────────────────────────────

const tuneVisible = ref(false)
const tuneStudentId = ref<number | null>(null)
const tuneStop = computed(
  () => stops.value.find((s) => s.student_id === tuneStudentId.value) ?? null,
)

function openMapTune(studentId: number): void {
  tuneStudentId.value = studentId
  tuneVisible.value = true
}

function onTuneConfirm(lat: number, lng: number): void {
  if (tuneStudentId.value !== null) editor.setCoordinates(tuneStudentId.value, lat, lng)
  tuneVisible.value = false
  tuneStudentId.value = null
}

function onTuneCancel(): void {
  tuneVisible.value = false
  tuneStudentId.value = null
}

// ── 自動排序預覽 ──────────────────────────────────────────────────────────

const optimizeVisible = ref(false)
const optimizeError = ref<string | null>(null)
const rawPreview = ref<RouteOptimizePreview | null>(null)

/**
 * composable 的預覽是「後端原樣」（只有 student_id/seq/eta）；Dialog 要的是可讀的
 * diff（姓名、新舊順位、是否被移動、是否釘選）。缺的欄位一律取自**目前的編輯緩衝**
 * ——預覽是對已儲存名單算的，兩者此刻必然一致（`optimizePreview` 有 dirty 前置擋）。
 */
const dialogPreview = computed<OptimizePreview | null>(() => {
  const preview = rawPreview.value
  if (!preview) return null
  const moved = new Set(preview.moved_unpinned_student_ids)
  const order = preview.stops.flatMap((s) => {
    const stop = stops.value.find((x) => x.student_id === s.student_id)
    if (!stop) return []
    return [{
      student_id: s.student_id,
      student_name: stop.student_name,
      old_seq: stop.seq,
      new_seq: s.seq,
      pinned: stop.pinned,
      eta: s.eta_planned,
      moved: moved.has(s.student_id),
    }]
  })
  return {
    order,
    end_time_planned: preview.end_time_planned,
    moved_unpinned_count: preview.moved_unpinned_student_ids.length,
  }
})

async function runOptimize(): Promise<void> {
  optimizeError.value = null
  const preview = await editor.optimizePreview()
  if (!preview) {
    // 兩種 null 要分開處理：
    // - 被「有未儲存變更」前置擋下 → 不是錯誤，composable 已用 ElMessage 說明，
    //   不該彈一個帶「重試」鈕的錯誤對話框（重試也還是會被擋）。
    // - 真的失敗（Azure 不可用時後端 502）→ spec「錯誤處理與邊界」要求給重試提示，
    //   一閃而過的 ElMessage 沒有重試入口。
    const message = editor.optimizeErrorMessage.value
    if (message) {
      optimizeError.value = message
      optimizeVisible.value = true
    }
    return
  }
  rawPreview.value = preview
  optimizeVisible.value = true
}

function onApplyOptimize(): void {
  if (rawPreview.value) editor.applyOptimize(rawPreview.value)
  optimizeVisible.value = false
  rawPreview.value = null
  ElMessage.success('已套用建議順序，確認後請按儲存')
}

function onCancelOptimize(): void {
  optimizeVisible.value = false
  optimizeError.value = null
  rawPreview.value = null
}

// ── 未儲存保護 ────────────────────────────────────────────────────────────

onBeforeRouteLeave(async () => {
  if (!anyDirty.value) return true
  try {
    await ElMessageBox.confirm(
      '這個班次有尚未儲存的變更，離開後會遺失。確定要離開嗎？', '尚未儲存',
      { type: 'warning', confirmButtonText: '離開', cancelButtonText: '留在這裡' },
    )
    return true
  } catch {
    return false
  }
})

// 關分頁／重新整理的未儲存保護；SPA 內部導航已由上面的 onBeforeRouteLeave 涵蓋，
// 這兩者互不重疊（同慣例見 ActivityPublicView.vue／ActivityPublicQueryView.vue）。
function handleBeforeUnload(event: BeforeUnloadEvent): void {
  if (!anyDirty.value) return
  event.preventDefault()
  event.returnValue = ''
}
onMounted(() => window.addEventListener('beforeunload', handleBeforeUnload))
onBeforeUnmount(() => window.removeEventListener('beforeunload', handleBeforeUnload))

// ── 「帶入其他班次名單」（既有班次，非建立流程）──────────────────────────────

const copyVisible = ref(false)

function openCopyDialog(): void {
  copySourceRouteId.value = null
  copyReverse.value = true
  copyVisible.value = true
}

async function onCopyFrom(): Promise<void> {
  if (copySourceRouteId.value === null) {
    ElMessage.error('請選擇來源班次')
    return
  }
  const ok = await editor.copyFromRoute(copySourceRouteId.value, copyReverse.value)
  if (ok) copyVisible.value = false
}

async function onRecomputeEtas(): Promise<void> {
  await editor.recomputeEtas()
}

/** 儲存失敗時 composable 已用 ElMessage 呈現後端 422 訊息，這裡不再包一層。 */
async function onSave(): Promise<void> {
  await editor.save()
}

const overloadedLabel = computed(() =>
  overloadedWeekdays.value.map((i) => WEEKDAY_LABELS[i]).join('、'),
)
</script>

<template>
  <div class="bus-routes">
    <PageHeader
      title="娃娃車班次"
      subtitle="設定各班次的出發時間、座位上限、隨車老師與接送順序"
    >
      <template #actions>
        <el-button
          type="primary"
          data-testid="bus-routes-create"
          :loading="creating"
          :disabled="loadFailed"
          @click="openCreateDialog"
        >
          新增班次
        </el-button>
      </template>
    </PageHeader>

    <el-skeleton v-if="loading" :rows="6" animated />

    <!--
      載入失敗必須**優先於**空狀態：`routes` 停在初始 [] 時渲染「尚未建立任何班次 +
      建立第一個班次」，等於把一次 403／500／斷網講成「園裡沒有班次」，而管理者按下去
      就會建出一個後端沒有端點可以刪掉的重複班次。
    -->
    <el-alert
      v-else-if="loadFailed"
      data-testid="bus-routes-load-error"
      type="error"
      show-icon
      :closable="false"
      title="無法載入娃娃車班次"
      description="與伺服器的連線出了狀況，目前無法確認園內既有的班次；請重新整理後再操作，先不要新增班次以免建出重複的班次。"
    />

    <el-empty
      v-else-if="!routes.length"
      data-testid="bus-routes-empty"
      description="尚未建立任何娃娃車班次"
    >
      <el-button type="primary" @click="openCreateDialog">建立第一個班次</el-button>
    </el-empty>

    <div v-else class="bus-routes__layout">
      <BusRouteSidebar
        :key="sidebarRenderKey"
        class="bus-routes__sidebar"
        :routes="routes"
        :active-route-id="activeRouteId"
        :reordering="reordering"
        @select="onSelectRoute"
        @reorder="onReorderRoutes"
        @create="openCreateDialog"
      />

      <div class="bus-routes__main">
        <el-tag
          v-if="activeRoute && !activeRoute.is_active"
          type="info"
          data-testid="bus-route-inactive"
        >
          此班次已停用，不會出現在司機開班選單
        </el-tag>

        <el-alert
          v-if="employeesFailed"
          data-testid="bus-employees-error"
          type="warning"
          show-icon
          :closable="false"
          title="隨車老師名單載入失敗"
          description="選單目前是空的——這不代表園內沒有可指派的老師，請重新整理後再設定。"
        />

        <BusRouteForm
          :route="activeRoute"
          :employees="employees"
          :saving="updatingRoute"
          @submit="onSubmitRouteForm"
          @update:dirty="formDirty = $event"
        />

        <div class="bus-routes__toolbar">
          <!--
            編輯入口與表格的 readonly 同一組鎖（editingLocked）：這幾支請求完成後
            都會重讀名冊而 resetEditing，in-flight 期間放行編輯等於邀請使用者做
            一筆馬上會被無聲清掉的變更。
          -->
          <el-select
            v-model="pickStudentId"
            filterable
            clearable
            :disabled="editingLocked"
            placeholder="加入搭車學生"
            style="width: 220px"
            data-testid="bus-student-select"
          >
            <el-option v-for="s in candidates" :key="s.id" :label="s.name" :value="s.id" />
          </el-select>
          <el-button
            :disabled="pickStudentId === null || editingLocked"
            data-testid="bus-add-stop"
            @click="onAddStop"
          >
            加入
          </el-button>
          <el-button
            data-testid="bus-copy-from"
            :loading="copying"
            :disabled="editingLocked"
            @click="openCopyDialog"
          >
            帶入其他班次名單
          </el-button>
          <el-button
            data-testid="bus-optimize"
            :loading="optimizing"
            :disabled="editingLocked"
            @click="runOptimize"
          >
            自動排序
          </el-button>
          <el-button
            data-testid="bus-recompute-etas"
            :loading="recomputingEtas"
            :disabled="editingLocked"
            @click="onRecomputeEtas"
          >
            重算預計抵達
          </el-button>
          <el-button
            type="primary"
            :loading="saving"
            :disabled="editingLocked"
            data-testid="bus-save"
            @click="onSave"
          >
            儲存名單
          </el-button>
          <el-tag v-if="dirty" type="warning" data-testid="bus-dirty">尚未儲存</el-tag>
          <span class="bus-routes__count">{{ stops.length }} / {{ MAX_STOPS_PER_ROUTE }} 站</span>
        </div>

        <el-alert
          v-if="studentsFailed"
          data-testid="bus-students-error"
          type="warning"
          show-icon
          :closable="false"
          title="學生名單載入失敗"
          description="「加入搭車學生」的選單目前是空的——這不代表沒有學生可以加，請重新整理。"
        />

        <el-alert
          v-if="missingCoordinateCount > 0"
          data-testid="bus-missing-coords"
          type="warning"
          show-icon
          :closable="false"
          :title="`有 ${missingCoordinateCount} 站尚未設定可定位的接送地址，這個班次無法發車`"
        />

        <!--
          地址過期＝存檔時的地址快照與所選地址來源的現值不一致（學生搬家／地址簿被改）。
          彙總提示放在逐列標示之前，站數多時不必逐列找。
        -->
        <el-alert
          v-if="staleAddressCount > 0"
          data-testid="bus-stale-addresses"
          type="warning"
          show-icon
          :closable="false"
          :title="`有 ${staleAddressCount} 站的接送地址已變更，站點座標可能已過期，請重新設定接送地址`"
        />

        <el-alert
          v-if="overloadedWeekdays.length > 0"
          data-testid="bus-capacity-overload"
          type="error"
          show-icon
          :closable="false"
          :title="`週${overloadedLabel}的搭車人數超過座位上限 ${capacity}，儲存會被擋下`"
        />

        <el-alert
          v-if="copyConflicts.length > 0"
          data-testid="bus-copy-conflicts"
          type="error"
          show-icon
          :closable="false"
          :title="`帶入的名單有 ${copyConflicts.length} 位學生與其他班次重複，需移除後才能儲存`"
          :description="copyConflicts.map((c) => `${c.student_name}（${c.conflict_route_name ?? '其他班次'}）`).join('、')"
        />

        <BusRouteStopsTable
          :stops="stops"
          :capacity="capacity"
          :readonly="editingLocked"
          @reorder="editor.moveStop"
          @remove="editor.removeStop"
          @toggle-pinned="editor.togglePinned"
          @update-ride-days="editor.setRideDays"
          @pick-address="openAddressDialog"
          @tune-map="openMapTune"
        />
      </div>
    </div>

    <!-- 新增班次（含「帶入其他班次名單」選項）-->
    <el-dialog v-model="createVisible" title="新增班次" width="480px">
      <!--
        舊版用 ElMessageBox.prompt 時這句警語在標題列；改成 Dialog 後不能就這樣
        消失——後端沒有班次刪除端點（只能停用），方向也因為 migration 依方向拆分
        而建立後唯讀，兩者都只有在建立當下講才有用。
      -->
      <el-alert
        type="warning"
        show-icon
        :closable="false"
        data-testid="create-warning"
        title="班次建立後無法刪除（只能停用），方向也不可更改，請先確認名稱與方向。"
      />
      <el-form label-width="110px">
        <el-form-item label="班次名稱">
          <el-input v-model="createName" maxlength="50" data-testid="create-name" />
        </el-form-item>
        <el-form-item label="方向">
          <el-select v-model="createDirection" data-testid="create-direction">
            <el-option
              v-for="opt in DIRECTION_OPTIONS"
              :key="opt.value"
              :label="opt.label"
              :value="opt.value"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="出發時間">
          <el-time-picker
            v-model="createDepartTime"
            value-format="HH:mm:ss"
            format="HH:mm"
            data-testid="create-depart-time"
          />
        </el-form-item>
        <el-form-item label="座位上限">
          <el-input-number v-model="createCapacity" :min="1" data-testid="create-capacity" />
        </el-form-item>
        <el-form-item label="帶入其他班次名單">
          <el-select
            v-model="copySourceRouteId"
            clearable
            placeholder="不帶入"
            data-testid="create-copy-source"
          >
            <el-option v-for="r in copySourceOptions" :key="r.id" :label="r.name" :value="r.id" />
          </el-select>
          <el-checkbox v-model="copyReverse" data-testid="create-copy-reverse">
            反序（早上最後接的，下午最先送）
          </el-checkbox>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button data-testid="create-cancel" @click="createVisible = false">取消</el-button>
        <el-button
          type="primary"
          :loading="creating"
          data-testid="create-submit"
          @click="onCreateRoute"
        >
          建立
        </el-button>
      </template>
    </el-dialog>

    <!-- 既有班次的「帶入其他班次名單」-->
    <el-dialog v-model="copyVisible" title="帶入其他班次名單" width="420px">
      <el-select
        v-model="copySourceRouteId"
        placeholder="選擇來源班次"
        data-testid="copy-source"
        style="width: 100%"
      >
        <el-option
          v-for="r in copySourceOptions.filter((r) => r.id !== activeRouteId)"
          :key="r.id"
          :label="r.name"
          :value="r.id"
        />
      </el-select>
      <el-checkbox v-model="copyReverse" data-testid="copy-reverse">
        反序（早上最後接的，下午最先送）
      </el-checkbox>
      <template #footer>
        <el-button data-testid="copy-cancel" @click="copyVisible = false">取消</el-button>
        <el-button type="primary" :loading="copying" data-testid="copy-submit" @click="onCopyFrom">
          預覽並帶入
        </el-button>
      </template>
    </el-dialog>

    <!-- 接送地址選擇／就地新增 -->
    <el-dialog v-model="addressDialogVisible" title="設定接送地址" width="480px">
      <BusPickupAddressSelect
        v-if="addressStop"
        :student-id="addressStop.student_id"
        :model-value="addressStop.pickup_address_id"
        :home-address="null"
        @resolved="onAddressResolved"
      />
    </el-dialog>

    <BusStopMapTuner
      :visible="tuneVisible"
      :lat="tuneStop?.lat ?? null"
      :lng="tuneStop?.lng ?? null"
      :label="tuneStop?.student_name ?? ''"
      :school-coords="schoolCoords"
      @confirm="onTuneConfirm"
      @cancel="onTuneCancel"
    />

    <BusOptimizePreviewDialog
      :visible="optimizeVisible"
      :loading="optimizing"
      :preview="dialogPreview"
      :error="optimizeError"
      @apply="onApplyOptimize"
      @cancel="onCancelOptimize"
      @retry="runOptimize"
    />
  </div>
</template>

<style scoped>
.bus-routes {
  padding: var(--space-4, 16px);
  display: flex;
  flex-direction: column;
  gap: var(--space-3, 12px);
}
.bus-routes__layout {
  display: grid;
  grid-template-columns: 240px minmax(0, 1fr);
  gap: var(--space-4, 16px);
  align-items: start;
}
.bus-routes__main {
  display: flex;
  flex-direction: column;
  gap: var(--space-3, 12px);
  min-width: 0;
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
@media (max-width: 900px) {
  .bus-routes__layout {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
