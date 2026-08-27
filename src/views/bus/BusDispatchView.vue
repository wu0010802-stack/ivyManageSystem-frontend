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
import { busInProgressWriteLabel } from '@/constants/bus'

const dispatch = useBusDailyDispatch()
const {
  date, plans, selectedPlan, selectedTripId, loading, saving, loadFailed,
  holidayNotice, etaStale, rosterOutOfSync, overCapacity, editable, inProgress, lockedByPermission,
  optimizePreviewData, optimizing, optimizeError, lastError, departedPending,
  insertCandidates, studentsLoading, studentsFailed,
} = dispatch

/**
 * 任一寫入或最佳化 in-flight。`saving` 與 `optimizing` 是兩把互不相擋的鎖——
 * 只吃 `saving` 的話，使用者在「套用建議順序」in-flight 時拖一列，reorder PATCH
 * 會照送（不會 422，optimize 不改 pending 集合只改 seq），然後被 applyOptimize
 * 後的 `load()` 靜默覆蓋掉。收斂到的是一致狀態，但不是使用者以為的那個。
 */
const busy = computed(() => saving.value || optimizing.value)

// ── 班次卡片 ────────────────────────────────────────────────────────────────
type CardStatus = 'none' | 'planned' | 'in_progress' | 'completed' | 'expired'

const CARD_STATUSES: readonly CardStatus[] = ['none', 'planned', 'in_progress', 'completed', 'expired']

/**
 * `trip.status` 在 codegen 只是 `string`（後端 Pydantic 宣告 `status: str`，沒有 enum）。
 * 直接 `as` 成聯集會把型別檢查關掉，而 `BusDispatchRouteCard` 內部是
 * `STATUS_META[status]` 查表——查不到回 `undefined`，template 再讀 `.label` 就是整頁
 * render 崩，型別上還完全看不出來。未知值一律退 `none`。
 *
 * ⚠ 「未生成」對一個**確實存在、只是狀態不認識**的 trip 略失真。之所以仍選它：
 * 五個既有狀態每一個都會讓卡片對編輯能力做出承諾，`none` 是唯一不承諾任何事的；
 * 真正的寫入權限另由 `editable` 依後端規則判定，所以失真只在文案、不在行為。
 * 要更誠實得在 `BusDispatchRouteCard` 的 `STATUS_META` 加一個 `unknown` 態——
 * 那支是共用元件，不為一個「後端擴 enum 才會發生」的情境去動它。
 */
function toCardStatus(status: string): CardStatus {
  return (CARD_STATUSES as readonly string[]).includes(status) ? (status as CardStatus) : 'none'
}

/**
 * `end_time_estimated` 固定為 null：後端 `DailyPlanTripOut`（`api/bus/daily_plans.py::
 * _trip_out`）**沒有帶這個欄位**，只有 `BusTripAdminOut` 有。與其自己拿別的數字充數，
 * 不如照實留空——卡片對 null 已經是「不顯示」。
 * TODO(backend): `DailyPlanTripOut` 補 `end_time_estimated` 後改成
 * `p.trip.end_time_estimated ?? null`；在那之前卡片的「預計 … 結束」永遠不會渲染。
 */
const cards = computed(() => plans.value.map((p) => ({
  route_id: p.trip.route_id,
  route_name: p.route_name,
  direction: p.direction,
  depart_time: p.depart_time,
  status: toCardStatus(p.trip.status),
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
        address: current?.address ?? null,
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
  // 422（跨班次重複／超 capacity／缺座標）：Dialog 保持開啟且不清空，把**後端原話**
  // 帶回去——那三句都直接指出下一步（是哪個班次撞了、超了幾人、誰缺座標），
  // 換成自己編的通用句等於把可行動的資訊丟掉。
  // `lastError` 為 null 代表「因重入守衛根本沒送出」，不是失敗，不顯示假錯誤。
  insertError.value = lastError.value
}

async function retryLoadStudents(): Promise<void> {
  await dispatch.loadStudents()
}

/** 由 student_id 取當日名單上的姓名；查不到時退回編號而不是空字串。 */
function stopNameOf(studentId: number | null): string {
  if (studentId === null) return ''
  const stop = selectedPlan.value?.stops.find((s) => s.student_id === studentId)
  return stop?.student_name ?? `學生 #${studentId}`
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
/** 套用地址失敗時的持久訊息（Dialog 不關，讓使用者照著後端原話改）。 */
const addressError = ref<string | null>(null)

const addressVisible = computed(() => addressStudentId.value !== null)
const addressStudentName = computed(() => stopNameOf(addressStudentId.value))
/** 當日名單上這位學生目前的接送地址快照（給地址選單當住家項的備援顯示）。 */
const addressCurrent = computed(
  () => selectedPlan.value?.stops.find((s) => s.student_id === addressStudentId.value)?.address ?? null,
)
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
  addressError.value = null
}

function closeAddress(): void {
  addressStudentId.value = null
  addressPickupId.value = null
  addressResolved.value = null
  addressError.value = null
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
  addressError.value = null
  const ok = await dispatch.changeAddress({
    student_id: studentId,
    pickup_address_id: resolved.id,
    lat: resolved.lat,
    lng: resolved.lng,
  })
  if (ok) {
    closeAddress()
    return
  }
  // 與插入 Dialog 同一條原則：失敗時 Dialog 不關、把後端原話留在畫面上，
  // 而不是只彈一次三秒後就消失的 toast。null＝重入守衛擋下、根本沒送出。
  addressError.value = lastError.value
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
/**
 * 移除站點的二次確認。
 *
 * 一定要帶出**姓名**：這是一張十幾列、每列按鈕長得都一樣的表，點錯一行而確認框
 * 又沒有任何可核對的資訊，結果就是錯的孩子從今天的名單消失、早上七點司機不會去
 * 接他。也要說清楚**怎麼救回來**——不是按個 undo，而是要重走「插入學生」並重選
 * 接送地址。
 */
async function onRemove(studentId: number): Promise<void> {
  const name = stopNameOf(studentId)
  try {
    await ElMessageBox.confirm(
      `確定要把「${name}」從今天的名單移除嗎？移除後若要恢復，需重新用「插入學生」並重選接送地址。`,
      '移除站點',
      { type: 'warning', confirmButtonText: '移除', cancelButtonText: '取消' },
    )
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
        description="尚未建立任何啟用中的班次，請先到「路線管理」新增"
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
              ? `此班次已發車，調整名單需要「${busInProgressWriteLabel()}」權限`
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

          <!--
            懶生成只在 trip 首次建立時跑一次，之後路線名單／接送地址的異動不會
            自動回填（見 useBusDailyDispatch.ts::rosterOutOfSync）——不提示的話
            使用者只會看到「人數對不上」卻不知道為什麼、也不知道要做什麼。
          -->
          <el-alert
            v-if="rosterOutOfSync && editable"
            data-testid="bus-dispatch-roster-out-of-sync"
            type="warning"
            show-icon
            :closable="false"
            title="班次名單有更新，此班次的名單/地址與路線設定不同步"
          >
            <template #default>
              <p>路線管理的名單或接送地址在這個班次生成後被異動過，需要按「重設為預設名單」才會套用最新內容。</p>
              <el-button
                type="warning"
                plain
                size="small"
                :loading="saving"
                data-testid="bus-dispatch-roster-out-of-sync-reset"
                @click="onReset"
              >
                立即重設
              </el-button>
            </template>
          </el-alert>

          <el-alert
            v-if="overCapacity"
            data-testid="bus-dispatch-overcapacity"
            type="warning"
            show-icon
            :closable="false"
            :title="`今日人數已超過座位上限（${departedPending} / ${selectedPlan.capacity} 人）`"
            description="銷假還原不會自動拒載，請確認是否需要改排到其他班次或加派車輛。"
          />

          <BusDispatchStopsTable
            :stops="selectedPlan.stops"
            :readonly="!editable"
            :trip-status="selectedPlan.trip.status"
            :eta-stale="etaStale"
            :busy="busy"
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
      :candidates-loading="studentsLoading"
      :candidates-failed="studentsFailed"
      :inserting="saving"
      :error-message="insertError"
      @submit="onInsertSubmit"
      @retry-candidates="retryLoadStudents"
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
      <!--
        `home-address` 傳該站現有的 address 快照：後端住家虛擬項若沒帶 address
        （學生資料未填住址），選單會顯示「住家（尚未填寫地址）」而不是實際住址。
        這一格拿得到真值，就不該傳 null。
      -->
      <BusPickupAddressSelect
        v-if="addressStudentId !== null"
        v-model="addressPickupId"
        :student-id="addressStudentId"
        :home-address="addressCurrent"
        @resolved="onAddressResolved"
      />
      <el-alert
        v-if="addressError"
        class="bus-dispatch__address-warning"
        type="error"
        :closable="false"
        show-icon
        data-testid="bus-dispatch-address-error"
      >
        <template #title>{{ addressError }}</template>
      </el-alert>
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
