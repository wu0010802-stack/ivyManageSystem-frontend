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
import {
  useBusRouteEditor, DIRECTION_LABELS, MAX_STOPS_PER_ROUTE,
  type BusDirection, type RouteOptimizePreview,
} from '@/composables/useBusRouteEditor'

const editor = useBusRouteEditor()
const {
  routes, activeRoute, activeRouteId, stops, candidates, capacity,
  loading, saving, creating, updatingRoute, reordering, optimizing, copying, dirty,
  missingCoordinateCount, staleAddressCount, overloadedWeekdays, copyConflicts,
  loadFailed, studentsFailed,
} = editor

const pickStudentId = ref<number | null>(null)
const employees = ref<Array<{ id: number; name: string }>>([])

void editor.init()

// ── 隨車老師候選（只留 id/name；員工回應還帶身分證／薪資等欄位）──────────────
async function loadEmployees(): Promise<void> {
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
    // 隨車老師選單空掉不影響其他編輯；表單自己會顯示空選單，不必擋整頁。
    employees.value = []
  }
}
void loadEmployees()

// ── 側欄 ──────────────────────────────────────────────────────────────────

async function onSelectRoute(routeId: number): Promise<void> {
  await editor.selectRoute(routeId)
}

async function onReorderRoutes(payload: { direction: BusDirection; ids: number[] }): Promise<void> {
  await editor.reorderRoutes(payload.ids)
}

// ── 新增班次 Dialog（含「帶入其他班次名單」）────────────────────────────────

const createVisible = ref(false)
const createName = ref('')
const createDirection = ref<BusDirection>('morning')
const createDepartTime = ref('07:30:00')
const createCapacity = ref(20)
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

function onAddressResolved(
  resolved: { id: number | null; lat: number | null; lng: number | null; address: string },
): void {
  if (addressStopIndex.value === null) return
  editor.setPickupAddress(addressStopIndex.value, {
    id: resolved.id,
    lat: resolved.lat,
    lng: resolved.lng,
    address: resolved.address || null,
  })
  addressDialogVisible.value = false
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
    // composable 已用 ElMessage 說明原因（未儲存變更／API 失敗）；不重複開空 Dialog。
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
  rawPreview.value = null
}

// ── 未儲存保護 ────────────────────────────────────────────────────────────

onBeforeRouteLeave(async () => {
  if (!dirty.value) return true
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
  if (!dirty.value) return
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
  overloadedWeekdays.value.map((i) => ['一', '二', '三', '四', '五'][i]).join('、'),
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

        <BusRouteForm
          :route="activeRoute"
          :employees="employees"
          :saving="updatingRoute"
          @submit="onSubmitRouteForm"
        />

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
          <el-button :disabled="pickStudentId === null" data-testid="bus-add-stop" @click="onAddStop">
            加入
          </el-button>
          <el-button data-testid="bus-copy-from" :loading="copying" @click="openCopyDialog">
            帶入其他班次名單
          </el-button>
          <el-button data-testid="bus-optimize" :loading="optimizing" @click="runOptimize">
            自動排序
          </el-button>
          <el-button data-testid="bus-recompute-etas" :loading="optimizing" @click="onRecomputeEtas">
            重算預計抵達
          </el-button>
          <el-button type="primary" :loading="saving" data-testid="bus-save" @click="onSave">
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
          :readonly="saving"
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
        :home-address="addressStop.address_snapshot"
        @resolved="onAddressResolved"
      />
    </el-dialog>

    <BusStopMapTuner
      :visible="tuneVisible"
      :lat="tuneStop?.lat ?? null"
      :lng="tuneStop?.lng ?? null"
      :label="tuneStop?.student_name ?? ''"
      :school-coords="null"
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
