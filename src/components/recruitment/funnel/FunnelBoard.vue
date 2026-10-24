<template>
  <div class="funnel-board" v-loading="store.loadingBoard">
    <div class="funnel-board__toolbar">
      <el-select
        v-model="schoolYearLocal"
        placeholder="入學學年"
        clearable
        size="small"
        style="width: 120px"
      >
        <el-option
          v-for="y in yearOptions"
          :key="y"
          :value="y"
          :label="`${y} 學年`"
        />
      </el-select>
      <el-select
        v-model="semesterLocal"
        placeholder="入學學期"
        clearable
        size="small"
        style="width: 100px"
      >
        <el-option :value="1" label="上學期" />
        <el-option :value="2" label="下學期" />
      </el-select>
      <el-button size="small" @click="onRefresh">重新整理</el-button>
      <FunnelAddVisit :dashboard="dashboard" class="funnel-board__add" @created="onVisitCreated" />
    </div>

    <FunnelSummaryBar v-if="store.board" :summary="store.board.summary" />

    <!-- 沒有入學學期的訪視不屬於任何學年看板（2026-09-06）。不講出來，空看板會
         謊稱「還沒有訪視紀錄」，操作者只會覺得系統壞了（e2e-115 實測明細 170
         筆、看板 0 張）。 -->
    <el-alert
      v-if="unscopedCount > 0"
      type="info"
      :closable="false"
      show-icon
      class="funnel-board__unscoped"
      data-test="funnel-unscoped-alert"
    >
      <template #title>
        另有 {{ unscopedCount }} 筆訪視沒有填入學學期，不會出現在任何學年的看板。
        <el-link type="primary" :underline="false" @click="$emit('show-unscoped')">
          到訪視明細處理
        </el-link>
      </template>
    </el-alert>

    <div class="funnel-board__columns">
      <FunnelColumn
        v-for="col in columnConfigs"
        :key="col.stage"
        :stage="col.stage"
        :title="col.title"
        :accent-color="col.color"
        :cards="store.getStageCards(col.stage)"
        :can-drag-set="canDragSetForStage(col.stage)"
        :pending-set="store.pendingTransitions"
        @card-click="onCardClick"
        @transition-attempt="onTransitionAttempt"
      />
    </div>

    <TransitionConfirmDialog
      v-model="dialogOpen"
      :from-stage="pendingTransition?.fromStage ?? 'visited'"
      :to-stage="pendingTransition?.toStage ?? 'visited'"
      :visit-id="pendingTransition?.visitId ?? 0"
      :child-name="pendingTransition?.childName ?? ''"
      @confirm="onDialogConfirm"
      @cancel="onDialogCancel"
    />

    <TimelineDrawer v-model="drawerOpen" :visit-id="drawerVisitId" />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { ElSelect, ElOption, ElButton, ElMessage, ElMessageBox, ElAlert, ElLink } from 'element-plus'
import { useRecruitmentFunnelStore, type Stage, type FunnelCardData } from '@/stores/recruitmentFunnel'
import { hasPermission } from '@/utils/auth'
import { currentRocYear } from '@/utils/academic'
import { FUNNEL_STAGES, FUNNEL_STAGE_LABELS, FUNNEL_STAGE_COLORS } from '@/constants/recruitmentFunnel'
import FunnelSummaryBar from './FunnelSummaryBar.vue'
import FunnelColumn from './FunnelColumn.vue'
import TransitionConfirmDialog from './TransitionConfirmDialog.vue'
import TimelineDrawer from './TimelineDrawer.vue'
import type { useRecruitmentDashboard } from '@/composables/useRecruitmentDashboard'
import FunnelAddVisit from './FunnelAddVisit.vue'

const props = defineProps<{
  dashboard: ReturnType<typeof useRecruitmentDashboard>
  /** 入學學年／學期由父層統一持有（2026-09-06），四個 tab 共用一份 */
  schoolYear?: number | null
  semester?: 1 | 2 | null
}>()

const emit = defineEmits<{
  created: []
  /** 使用者要去處理沒有入學學期的訪視（父層切到明細 tab） */
  'show-unscoped': []
  'update:schoolYear': [value: number | null]
  'update:semester': [value: 1 | 2 | null]
}>()

const store = useRecruitmentFunnelStore()

/** 沒有入學學期、不屬於任何學年看板的訪視數（後端 board 回傳）。 */
const unscopedCount = computed(() => store.board?.unscoped_count ?? 0)

// === 篩選器（2026-09-06 起由父層統一持有，四個 tab 共用一份）===
const currentYear = currentRocYear()
const yearOptions = computed(() => [currentYear + 1, currentYear, currentYear - 1, currentYear - 2])

const schoolYearLocal = computed({
  get: () => props.schoolYear ?? null,
  set: (v: number | null) => emit('update:schoolYear', v),
})
const semesterLocal = computed({
  get: () => props.semester ?? null,
  set: (v: 1 | 2 | null) => emit('update:semester', v),
})

async function onRefresh() {
  await store.setFilter(schoolYearLocal.value, semesterLocal.value)
}

// 父層改了學年學期就重載看板（切 tab 回來時 store 已是同一組條件）
watch(
  () => [props.schoolYear, props.semester],
  () => { void store.setFilter(props.schoolYear ?? null, props.semester ?? null) },
)

// === Column 設定 ===
const columnConfigs: Array<{ stage: Stage; title: string; color: string }> =
  FUNNEL_STAGES.map((stage) => ({
    stage,
    title: FUNNEL_STAGE_LABELS[stage],
    color: FUNNEL_STAGE_COLORS[stage],
  }))

// === 權限控管 ===
// 使用 hasPermission() 字串名稱 API（內部已用 BigInt 避免 32-bit overflow）
function canDragSetForStage(stage: Stage): Set<number> {
  let allowed = false
  if (stage === 'visited' || stage === 'deposited') {
    allowed =
      hasPermission('RECRUITMENT_WRITE') || hasPermission('RECRUITMENT_CONVERT')
  } else if (stage === 'withdrawn') {
    // 退出欄拖出＝取消退費：招生寫入權即可
    allowed = hasPermission('RECRUITMENT_WRITE')
  } else {
    // enrolled：拖出會刪學生檔，需要 STUDENTS_WRITE
    allowed = hasPermission('STUDENTS_WRITE')
  }
  if (!allowed) return new Set<number>()
  return new Set<number>(store.getStageCards(stage).map((c) => c.visit_id))
}

// === 轉換流程 ===
interface PendingTransition {
  visitId: number
  fromStage: Stage
  toStage: Stage
  childName: string
}

const pendingTransition = ref<PendingTransition | null>(null)
const dialogOpen = ref(false)

/**
 * 每一種階段轉換都先跳確認框（2026-09-06 招生流程審查）。
 *
 * 原本只有「選班別」與「進退出欄」會攔；`visited→deposited` 直接送出，於是
 * 拖曳完全填不到「收預繳人員」；`withdrawn→*` 也直接送出，進退出欄要填原因、
 * 離開卻一聲不響，一手滑就把退費個案復原了。
 *
 * 保留這個函式而不是寫死 true：對話框內容仍依 from/to 分模式，未來若有真正
 * 無需確認的轉換，改這裡就好。
 */
function needsDialog(from: Stage, to: Stage): boolean {
  // deposited → enrolled：需選教室（dropdown mode）
  if (from === 'deposited' && to === 'enrolled') return true
  // 進退出欄（退預繳／退註冊）：destructive，必填原因
  if (to === 'withdrawn') return true
  // 離開退出欄（取消退費）：與進欄對稱，要確認
  if (from === 'withdrawn') return true
  // 標記已預繳：順手記下誰收的
  if (from === 'visited' && to === 'deposited') return true
  // 自「已註冊」往前退：destructive
  const order: readonly Stage[] = FUNNEL_STAGES
  if (from === 'enrolled' && order.indexOf(to) < order.indexOf(from)) return true
  // 取消預繳（deposited → visited）：狀態倒退，確認
  if (from === 'deposited' && to === 'visited') return true
  return false
}

async function onTransitionAttempt(payload: {
  visitId: number
  fromStage: Stage
  toStage: Stage
}) {
  const card = store.getCardByVisitId(payload.visitId)
  if (!card) return

  if (needsDialog(payload.fromStage, payload.toStage)) {
    pendingTransition.value = { ...payload, childName: card.child_name }
    dialogOpen.value = true
  } else {
    try {
      const result = await store.transition(payload.visitId, payload.toStage, {})
      notifyTransitionSuccess(result)
    } catch (err) {
      handleTransitionError(err)
    }
  }
}

async function onDialogConfirm(payload: {
  classroomId?: number
  reason?: string
  depositCollector?: string
}) {
  if (!pendingTransition.value) return
  const { visitId, toStage } = pendingTransition.value
  try {
    const result = await store.transition(visitId, toStage, payload)
    notifyTransitionSuccess(result)
  } catch (err) {
    handleTransitionError(err)
  } finally {
    pendingTransition.value = null
  }
}

/**
 * 後端回的 warnings 要講給人聽（2026-09-06）：退預繳只關招生端的旗標，不會退錢，
 * 名下還有預繳金時得提醒去學費管理，否則錢就這樣掛著沒人知道。
 */
const TRANSITION_WARNING_TEXT: Record<string, string> = {
  active_prepayment_needs_refund:
    '已標記退預繳，但這筆在「學費管理」還有未處理的預繳金，請另外走退款流程。',
  duplicate_student_name_birthday:
    '系統裡已有同名同生日的在學學生，請確認不是重複建檔。',
}

function notifyTransitionSuccess(result: unknown): void {
  const warnings = (result as { warnings?: string[] } | undefined)?.warnings ?? []
  const texts = warnings.map((w) => TRANSITION_WARNING_TEXT[w]).filter(Boolean)
  if (texts.length) {
    ElMessageBox.alert(texts.join('\n'), '已更新，但有事情要處理', { type: 'warning' })
    return
  }
  ElMessage.success('已更新階段')
}

function onDialogCancel() {
  pendingTransition.value = null
}

function handleTransitionError(err: unknown): void {
  const e = err as {
    response?: {
      status?: number
      data?: { detail?: { code?: string; message?: string } }
    }
  }
  const code = e?.response?.data?.detail?.code
  const status = e?.response?.status
  const msg = e?.response?.data?.detail?.message

  if (code === 'REVERT_STUDENT_HAS_DATA') {
    ElMessageBox.alert(
      `${msg ?? '該學生已有業務資料，無法退回'}。請改走「學生管理 → 學生檔案 → 生命週期 → 退學」。`,
      '無法退回',
      { type: 'warning' },
    )
  } else if (status === 403) {
    ElMessage.warning('無權限執行此操作')
  } else if (status === 409) {
    ElMessage.info('狀態已被其他人變更，已自動重新載入')
  } else {
    ElMessage.error(msg ?? '操作失敗，請稍後再試')
  }
}

// === 時間線 Drawer ===
const drawerOpen = ref(false)
const drawerVisitId = ref<number | null>(null)

function onCardClick(card: FunnelCardData) {
  drawerVisitId.value = card.visit_id
  drawerOpen.value = true
}

// 看板新增訪視成功：重載看板使新卡片出現；若該訪視月份不在目前篩選的學年/學期，提示使用者
async function onVisitCreated(record: { id: number; [k: string]: unknown }): Promise<void> {
  try {
    await store.loadBoard({ force: true })
  } catch {
    // 重載失敗：仍通知父層同步統計；不做篩選範圍判斷（避免以過期看板誤報）
    ElMessage.warning('新增成功，但看板重載失敗，請手動重新整理')
    emit('created')
    return
  }
  if (!store.getCardByVisitId(record.id)) {
    ElMessage.info('新增成功，但該參觀日期不在目前篩選的學年/學期，請切換篩選查看')
  }
  emit('created')
}

onMounted(() => {
  // 掛載時把父層的學年學期同步進 store（切 tab 回來也走這裡）
  if (props.schoolYear != null || props.semester != null) {
    void store.setFilter(props.schoolYear ?? null, props.semester ?? null)
  } else {
    void store.loadBoard()
  }
})
</script>

<style scoped>
.funnel-board {
  padding: var(--space-3);
}

.funnel-board__toolbar {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
  margin-bottom: var(--space-3);
  align-items: center;
}

.funnel-board__add {
  margin-left: auto;
}

.funnel-board__unscoped {
  margin-bottom: 12px;
}
.funnel-board__columns {
  display: flex;
  gap: var(--space-3);
  min-height: 500px;
}

/* 四欄原本是無 min-width 的 flex，既沒有 wrap 也沒有 overflow：窄螢幕下不換行、
 * 不產生水平捲軸，而是等比壓扁（實測 390px 時每欄僅剩 83px，且 scrollWidth 等於
 * clientWidth，代表內容連捲動去看的餘地都沒有）。以下兩段給壓扁兩條替代出路。 */

/* 平板：保底欄寬 + 橫向捲動，看板的並排語意得以保留 */
@media (--to-md) {
  .funnel-board__columns {
    overflow-x: auto;
    scroll-snap-type: x proximity;
    padding-bottom: var(--space-2);
  }

  .funnel-board__columns > * {
    flex: 0 0 clamp(240px, 42vw, 300px);
    scroll-snap-align: start;
  }
}

/* 手機：並排已無意義，改直向堆疊；min-height 必須一併解除，
 * 否則四個空階段各自撐出 500px、要捲很久才看得完 */
@media (--to-sm) {
  .funnel-board__columns {
    flex-direction: column;
    overflow-x: visible;
    min-height: 0;
  }

  .funnel-board__columns > * {
    flex: 1 1 auto;
  }
}
</style>
