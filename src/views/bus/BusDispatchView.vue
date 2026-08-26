<script setup lang="ts">
/**
 * 管理端「今日調度」（route `/bus/dispatch`，進頁權限 `BUS_READ`）。
 *
 * 狀態與落庫全在 `@/composables/useBusDailyDispatch`；本檔只做組裝、二次確認文案
 * 與呈現層的型別轉換。
 *
 * ── 三條這一頁專有的規則 ───────────────────────────────────────────────────
 *
 * 1. **進頁與換日都是寫入**。`GET /bus/daily-plans` 懶生成當日 planned 計畫，
 *    所以這頁沒有「自動輪詢」也沒有 watch 觸發的重載——每一次重載都是使用者的
 *    顯式動作。
 *
 * 2. **唯讀鎖分兩種，文案不能共用**。「班次已結束」是誰都不能改；「權限不足」
 *    是這個人不能改，要講出去找誰。混成一句「無法編輯」等於讓行政去猜。
 *
 * 3. **重設的破壞範圍依狀態不同**（spec 生命週期第 6 點）。planned 是丟棄全部
 *    當日修改；in_progress 是保留已離站的站、丟棄後台排除與臨時插入。二次確認
 *    的文案必須說出是哪一種，否則使用者按下去之前根本不知道會失去什麼。
 *
 * ── 隱私 ────────────────────────────────────────────────────────────────────
 * 站點座標只交給 `BusStopMapTuner` 當地圖起始位置，不顯示數字、不進 console／
 * Sentry／URL query／storage。
 */
import { computed, onMounted, ref } from 'vue'
import { ElMessageBox } from 'element-plus'
import PageHeader from '@/components/common/PageHeader.vue'
import BusDispatchDateBar from '@/components/bus/BusDispatchDateBar.vue'
import BusDispatchRouteCard from '@/components/bus/BusDispatchRouteCard.vue'
import BusDispatchStopsTable from '@/components/bus/BusDispatchStopsTable.vue'
import BusDispatchInsertStudentDialog from '@/components/bus/BusDispatchInsertStudentDialog.vue'
import BusOptimizePreviewDialog, {
  type OptimizePreview,
} from '@/components/bus/BusOptimizePreviewDialog.vue'
import BusPickupAddressSelect from '@/components/bus/BusPickupAddressSelect.vue'
import BusStopMapTuner from '@/components/bus/BusStopMapTuner.vue'
import { useBusDailyDispatch } from '@/composables/useBusDailyDispatch'
import { DIRECTION_LABELS } from '@/composables/useBusRouteEditor'

const dispatch = useBusDailyDispatch()
const {
  date, plans, selectedPlan, selectedTripId, loading, saving, loadFailed,
  holidayNotice, etaStale, overCapacity, editable, inProgress, lockedByPermission,
  optimizePreviewData, optimizing, optimizeError, insertCandidates, studentsLoading,
} = dispatch

// ── 班次卡片 ────────────────────────────────────────────────────────────────
/**
 * `end_time_estimated` 固定為 null：後端 `DailyPlanTripOut`（`api/bus/daily_plans.py::
 * _trip_out`）**沒有帶這個欄位**，只有 `BusTripAdminOut` 有。與其自己拿別的數字充數，
 * 不如照實留空——卡片對 null 已經是「不顯示」。後端補上同名欄位後這裡即可接上。
 */
const cards = computed(() => plans.value.map((p) => ({
  route_id: p.trip.route_id,
  route_name: p.route_name,
  direction: p.direction,
  depart_time: p.depart_time,
  status: p.trip.status as 'none' | 'planned' | 'in_progress' | 'completed' | 'expired',
  departed_count: p.stops.filter((s) => s.status === 'departed').length,
  pending_count: p.stops.filter((s) => s.status === 'pending').length,
  capacity: p.capacity,
  end_time_estimated: null,
  trip_id: p.trip.id,
})))

function onSelectRoute(routeId: number): void {
  const target = plans.value.find((p) => p.trip.route_id === routeId)
  if (target) dispatch.selectTrip(target.trip.id)
}

const selectedTitle = computed(() => {
  const p = selectedPlan.value
  return p ? `${p.route_name}・${DIRECTION_LABELS[p.direction]}` : ''
})

// ── 自動排序預覽（把後端形狀轉成 Dialog 的呈現契約）────────────────────────
const optimizeVisible = ref(false)

const optimizePreview = computed<OptimizePreview | null>(() => {
  const preview = optimizePreviewData.value
  const plan = selectedPlan.value
  if (!preview || !plan) return null
  const byStudent = new Map(plan.stops.map((s) => [s.student_id, s]))
  const moved = new Set(preview.moved_unpinned_student_ids ?? [])
  return {
    order: preview.stops.map((s) => {
      const current = byStudent.get(s.student_id)
      return {
        student_id: s.student_id,
        student_name: current?.student_name ?? `學生 #${s.student_id}`,
        old_seq: current?.seq ?? 0,
        new_seq: s.seq,
        pinned: current?.pinned ?? false,
        eta: s.eta_planned ?? null,
        moved: moved.has(s.student_id),
      }
    }),
    end_time_planned: preview.end_time_estimated ?? null,
    moved_unpinned_count: moved.size,
  }
})

async function openOptimize(): Promise<void> {
  optimizeVisible.value = true
  await dispatch.optimizePreview()
}

async function onApplyOptimize(): Promise<void> {
  if (await dispatch.applyOptimize()) optimizeVisible.value = false
}

function onCancelOptimize(): void {
  optimizeVisible.value = false
  dispatch.cancelOptimize()
}

// ── 插入學生 ────────────────────────────────────────────────────────────────
const insertVisible = ref(false)
const insertError = ref<string | null>(null)

async function openInsert(): Promise<void> {
  insertError.value = null
  insertVisible.value = true
  await dispatch.loadStudents()
}

async function onInsertSubmit(payload: Parameters<typeof dispatch.insertStop>[0]): Promise<void> {
  insertError.value = null
  if (await dispatch.insertStop(payload)) {
    insertVisible.value = false
    return
  }
  // 422（跨班次重複／超 capacity）：Dialog 保持開啟且不清空，只把後端原話帶回去
  insertError.value = '插入失敗，請確認該學生今天是否已排在其他班次，或座位是否已滿'
}

// ── 接送地址（含地圖微調）────────────────────────────────────────────────
/**
 * 為什麼地址與座標一起送：`BusStopAdminOut` 不含 `pickup_address_id`，前端無從
 * 得知這一站目前選的是哪一筆地址。若只送 `{student_id, lat, lng}`，後端會把
 * `pickup_address_id` 清成 null 並把 `address_snapshot` 改寫成學生住家住址——
 * 那是使用者沒要求的靜默異動。所以一律走「選地址（拿到 id 與座標）→ 可微調 →
 * 一次送出」，兩個欄位永遠一致。
 */
const addressStudentId = ref<number | null>(null)
const addressPickupId = ref<number | null>(null)
const addressResolved = ref<{ id: number | null; lat: number | null; lng: number | null; address: string } | null>(null)
const mapTunerVisible = ref(false)

const addressVisible = computed(() => addressStudentId.value !== null)
const addressStudentName = computed(() => {
  const id = addressStudentId.value
  return selectedPlan.value?.stops.find((s) => s.student_id === id)?.student_name ?? ''
})
const addressCanSubmit = computed(
  () => addressResolved.value !== null
    && addressResolved.value.lat != null
    && addressResolved.value.lng != null
    && !saving.value,
)

function openAddress(studentId: number): void {
  addressStudentId.value = studentId
  addressPickupId.value = null
  addressResolved.value = null
}

function closeAddress(): void {
  addressStudentId.value = null
  addressPickupId.value = null
  addressResolved.value = null
  mapTunerVisible.value = false
}

function onAddressResolved(
  payload: { id: number | null; lat: number | null; lng: number | null; address: string },
): void {
  addressResolved.value = payload
}

function onMapConfirm(lat: number, lng: number): void {
  if (addressResolved.value) addressResolved.value = { ...addressResolved.value, lat, lng }
  mapTunerVisible.value = false
}

async function submitAddress(): Promise<void> {
  const studentId = addressStudentId.value
  const resolved = addressResolved.value
  if (studentId === null || !resolved || resolved.lat == null || resolved.lng == null) return
  const ok = await dispatch.changeAddress({
    student_id: studentId,
    pickup_address_id: resolved.id,
    lat: resolved.lat,
    lng: resolved.lng,
  })
  if (ok) closeAddress()
}

// ── 重設為預設名單 ─────────────────────────────────────────────────────────
const RESET_COPY = {
  planned: '將丟棄今天對這條班次的全部修改（臨時插入、後台排除、順序調整），依班次預設名單重新產生。',
  in_progress: '已離站的站會保留；後台排除與臨時插入、順序調整將一併丟棄，請假與家長取消會依當下資料重新推導。',
} as const

async function onReset(): Promise<void> {
  const status = selectedPlan.value?.trip.status
  if (status !== 'planned' && status !== 'in_progress') return
  try {
    await ElMessageBox.confirm(RESET_COPY[status], '重設為預設名單', {
      type: 'warning', confirmButtonText: '重設', cancelButtonText: '取消',
    })
  } catch {
    return
  }
  await dispatch.resetPlan()
}

// ── 名單動作 ────────────────────────────────────────────────────────────────
async function onRemove(studentId: number): Promise<void> {
  try {
    await ElMessageBox.confirm('將這位學生從今天的名單移除？', '移除站點', {
      type: 'warning', confirmButtonText: '移除', cancelButtonText: '取消',
    })
  } catch {
    return
  }
  await dispatch.removeStop(studentId)
}

onMounted(() => { void dispatch.load() })
</script>

<template>
  <div class="bus-dispatch">
    <PageHeader title="娃娃車今日調度" subtitle="當日名單、接送順序與臨時異動（可預排未來一週）" />

    <BusDispatchDateBar
      :model-value="date"
      :holiday-notice="holidayNotice"
      data-testid="bus-dispatch-datebar"
      @update:model-value="dispatch.setDate"
    />

    <el-skeleton v-if="loading" :rows="5" animated />

    <template v-else>
      <!--
        載入失敗要放在空狀態之外：403／500 時 plans 是空的，若照樣顯示「今天沒有
        班次」，管理者會以為園裡今天不發車——那比顯示一張錯誤卡危險得多。
      -->
      <el-alert
        v-if="loadFailed"
        data-testid="bus-dispatch-error"
        type="error"
        show-icon
        :closable="false"
        title="無法取得當日計畫"
        description="與伺服器的連線出了狀況，請重新整理後再試；在此之前畫面上沒有任何可信的名單。"
      />

      <el-empty
        v-else-if="!plans.length"
        data-testid="bus-dispatch-empty"
        description="尚未建立任何啟用中的班次，請先到「班次設定」新增"
      />

      <template v-else>
        <div class="bus-dispatch__cards" data-testid="bus-dispatch-cards">
          <BusDispatchRouteCard
            v-for="c in cards"
            :key="c.trip_id"
            :plan="c"
            :active="c.trip_id === selectedTripId"
            @select="onSelectRoute"
          />
        </div>

        <template v-if="selectedPlan">
          <div class="bus-dispatch__toolbar">
            <h3 class="bus-dispatch__title" data-testid="bus-dispatch-title">{{ selectedTitle }}</h3>
            <div class="bus-dispatch__actions">
              <el-button
                :disabled="!editable"
                :loading="optimizing"
                data-testid="bus-dispatch-optimize"
                @click="openOptimize"
              >
                自動排序
              </el-button>
              <el-button
                :disabled="!editable || inProgress"
                data-testid="bus-dispatch-insert"
                @click="openInsert"
              >
                插入學生
              </el-button>
              <el-button
                type="danger"
                plain
                :disabled="!editable"
                :loading="saving"
                data-testid="bus-dispatch-reset"
                @click="onReset"
              >
                重設為預設名單
              </el-button>
            </div>
          </div>

          <!-- 兩種唯讀的原因不同，文案不可共用一句「無法編輯」 -->
          <el-alert
            v-if="lockedByPermission"
            data-testid="bus-dispatch-locked"
            type="info"
            show-icon
            :closable="false"
            :title="inProgress
              ? '此班次已發車，調整名單需要「娃娃車追蹤 (發車後調整)」權限'
              : '你沒有編輯娃娃車班次的權限，以下為唯讀檢視'"
            description="需要調整請聯絡系統管理員授權。"
          />
          <el-alert
            v-else-if="!editable"
            data-testid="bus-dispatch-closed"
            type="info"
            show-icon
            :closable="false"
            title="此班次已結束，名單為唯讀"
          />

          <el-alert
            v-if="overCapacity"
            data-testid="bus-dispatch-overcapacity"
            type="warning"
            show-icon
            :closable="false"
            title="今日人數已超過座位上限"
            description="銷假還原不會自動拒載，請確認是否需要改排到其他班次或加派車輛。"
          />

          <BusDispatchStopsTable
            :stops="selectedPlan.stops"
            :readonly="!editable"
            :trip-status="selectedPlan.trip.status"
            :eta-stale="etaStale"
            :busy="saving"
            data-testid="bus-dispatch-stops"
            @reorder="dispatch.moveStop"
            @mark-excused="dispatch.markExcusedAdmin"
            @unmark-excused="dispatch.unmarkExcused"
            @remove="onRemove"
            @change-address="openAddress"
          />
        </template>
      </template>
    </template>

    <BusOptimizePreviewDialog
      :visible="optimizeVisible"
      :loading="optimizing"
      :preview="optimizePreview"
      :error="optimizeError"
      @apply="onApplyOptimize"
      @cancel="onCancelOptimize"
      @retry="dispatch.optimizePreview"
    />

    <BusDispatchInsertStudentDialog
      :visible="insertVisible"
      :candidates="insertCandidates"
      :inserting="saving || studentsLoading"
      :error-message="insertError"
      @submit="onInsertSubmit"
      @cancel="insertVisible = false"
    />

    <el-dialog
      :model-value="addressVisible"
      title="設定當日接送地址"
      width="520px"
      :close-on-click-modal="false"
      data-testid="bus-dispatch-address-dialog"
      @close="closeAddress"
    >
      <p class="bus-dispatch__hint">{{ addressStudentName }}・僅影響今天這一趟</p>
      <BusPickupAddressSelect
        v-if="addressStudentId !== null"
        v-model="addressPickupId"
        :student-id="addressStudentId"
        :home-address="null"
        @resolved="onAddressResolved"
      />
      <el-alert
        v-if="addressResolved && (addressResolved.lat == null || addressResolved.lng == null)"
        class="bus-dispatch__address-warning"
        type="warning"
        :closable="false"
        show-icon
        data-testid="bus-dispatch-address-nocoord"
      >
        <template #title>
          這個地址尚未定位，套用後會讓整條班次無法發車。請改選其他地址或先補上定位。
        </template>
      </el-alert>
      <template #footer>
        <el-button
          :disabled="!addressResolved"
          data-testid="bus-dispatch-address-map"
          @click="mapTunerVisible = true"
        >
          在地圖上微調
        </el-button>
        <el-button data-testid="bus-dispatch-address-cancel" @click="closeAddress">取消</el-button>
        <el-button
          type="primary"
          :disabled="!addressCanSubmit"
          :loading="saving"
          data-testid="bus-dispatch-address-submit"
          @click="submitAddress"
        >
          套用
        </el-button>
      </template>
    </el-dialog>

    <BusStopMapTuner
      :visible="mapTunerVisible"
      :lat="addressResolved?.lat ?? null"
      :lng="addressResolved?.lng ?? null"
      :label="addressStudentName"
      :school-coords="null"
      @confirm="onMapConfirm"
      @cancel="mapTunerVisible = false"
    />
  </div>
</template>

<style scoped>
.bus-dispatch {
  padding: var(--space-4, 16px);
  display: flex;
  flex-direction: column;
  gap: var(--space-3, 12px);
}

.bus-dispatch__cards {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: var(--space-2, 8px);
}

.bus-dispatch__toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: var(--space-2, 8px);
  flex-wrap: wrap;
}

.bus-dispatch__title {
  margin: 0;
  font-size: var(--text-base, 15px);
}

.bus-dispatch__actions {
  display: flex;
  gap: var(--space-1, 4px);
}

.bus-dispatch__hint {
  margin: 0 0 var(--space-2, 8px);
  font-size: var(--text-sm, 13px);
  color: var(--text-tertiary, #909399);
}

.bus-dispatch__address-warning {
  margin-top: var(--space-2, 8px);
}
</style>
