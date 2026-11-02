<template>
  <div class="year-plan-workspace">
    <PageHeader title="新學年預編班">
      <template #title-extra>
        <template v-if="status">
          <span class="term-range">
            {{ status.source_school_year }} 學年下學期 → {{ status.target_school_year }} 學年上學期
          </span>
          <span class="status-badge" :class="`status-${state}`">{{ stateLabel }}</span>
        </template>
      </template>
      <!-- mutation in-flight（loading=true）期間鎖住所有互動觸發點：雙擊會以同一
           base_version 送第二發、撞 409 誤導使用者「有別人在動草稿」 -->
      <template #actions>
      <!-- 窄幕（含平板）只留「問題與名單」「發布」「更多」：五顆鈕不換行會把標題擠成逐字直排。
           寬幕「重新產生建議」放最左，不緊貼「發布」（一個會重算全園分班，一個是主要動作） -->
      <div v-if="status" class="actions">
        <el-badge v-if="isNarrow && plan" :value="totalIssueCount" :hidden="totalIssueCount === 0" class="drawer-badge">
          <el-button class="btn-side-drawer" @click="drawerVisible = true">問題與名單</el-button>
        </el-badge>
        <template v-if="canWrite && state === 'draft'">
          <template v-if="!isNarrow">
            <el-button class="btn-regenerate" :disabled="loading" @click="onRegenerateClick">重新產生建議</el-button>
            <el-button class="btn-add-class" :disabled="loading" @click="onAddClassClick">新增班級</el-button>
          </template>
          <el-button type="primary" class="btn-publish" :disabled="!canPublish || loading" @click="onPublishClick">發布</el-button>
        </template>
        <el-button
          v-if="canWrite && state === 'published'"
          class="btn-unpublish"
          :disabled="loading"
          @click="onUnpublishClick"
        >撤回發布</el-button>
        <!-- 「更多」：有計畫就有（匯出只要讀取權限）；寫入相關項目另依權限與狀態 -->
        <el-dropdown v-if="plan" trigger="click" @command="onMoreCommand">
          <el-button class="btn-more" :disabled="loading">
            更多<el-icon class="el-icon--right"><ArrowDown /></el-icon>
          </el-button>
          <template #dropdown>
            <el-dropdown-menu>
              <template v-if="canWrite && isNarrow && state === 'draft'">
                <el-dropdown-item command="add-class">新增班級</el-dropdown-item>
                <el-dropdown-item command="regenerate">重新產生建議</el-dropdown-item>
              </template>
              <el-dropdown-item command="export" :divided="canWrite && isNarrow && state === 'draft'">匯出 Excel</el-dropdown-item>
              <el-dropdown-item
                v-if="canWrite && canCancelPlan"
                command="cancel-plan"
                class="dropdown-item-danger"
                divided
              >{{ state === 'published' ? '作廢計畫' : '作廢草稿' }}</el-dropdown-item>
            </el-dropdown-menu>
          </template>
        </el-dropdown>
      </div>
      </template>
    </PageHeader>

    <!-- 補救模式：已是目標學年上學期，發布＝排程下一輪（約一小時內）不可逆套用到現行班級 -->
    <el-alert
      v-if="showRemedialBanner"
      class="remedial-banner"
      type="error"
      show-icon
      :closable="false"
      :title="remedialTitle"
      :description="remedialDescription"
    />

    <!-- 寫入成功但重新載入失敗：畫面停在儲存前，繼續操作會撞版本衝突，先請使用者重新載入 -->
    <el-alert
      v-if="staleAfterWrite && plan"
      class="stale-banner"
      type="warning"
      show-icon
      :closable="false"
      title="已儲存，但畫面沒有更新"
    >
      <div class="stale-body">
        <span>畫面上還是儲存前的資料，請重新載入後再繼續調整。</span>
        <el-button size="small" class="btn-stale-reload" :loading="loading" @click="load()">重新載入</el-button>
      </div>
    </el-alert>

    <div v-if="loading && !plan" class="loading-skeleton">
      <div class="skeleton-row" v-for="i in 4" :key="i"></div>
    </div>

    <!-- 只有「還沒有 plan 可顯示」的載入失敗才換成錯誤畫面；寫入失敗已由 composable
         toast，工作台必須留著讓使用者修正後重試 -->
    <div v-else-if="error && !plan" class="workspace-error">
      <p>{{ error }}</p>
      <el-button class="btn-reload" @click="load()">重新載入</el-button>
    </div>

    <div v-else-if="state === 'none'" class="empty-state">
      <p class="empty-title">還沒有 {{ status?.target_school_year }} 學年的編班草稿</p>
      <p class="empty-desc">{{ noneDescription }}</p>
      <el-button v-if="canWrite" type="primary" class="btn-generate" @click="onGenerateClick">產生草稿</el-button>
    </div>

    <template v-else-if="plan">
    <!-- 已發布卻有阻擋：套用一定失敗，直接給出路（撤回後重新產生） -->
    <el-alert
      v-if="state === 'published' && plan.issues.blocking.length > 0"
      class="published-blocking-alert"
      type="error"
      show-icon
      :closable="false"
      :title="`已發布的計畫有 ${plan.issues.blocking.length} 項阻擋，套用會失敗`"
    >
      <div class="stale-body">
        <span>處理方式寫在右側「阻擋套用」各項裡；多數要先撤回發布、重新產生建議再發布。</span>
        <el-button
          v-if="canWrite"
          size="small"
          type="danger"
          class="btn-unpublish-regenerate"
          :disabled="loading"
          @click="onUnpublishAndRegenerate"
        >撤回並重新產生</el-button>
      </div>
    </el-alert>
    <PlanPublishedBar
      v-if="state === 'published' && status"
      :published-at="status.published_at ?? plan.published_at ?? null"
      :apply-date="status.apply_date"
      :applies-immediately="appliesImmediately"
      :scheduler-enabled="schedulerEnabled"
      :apply-failure="status.apply_failure ?? null"
      :apply-overdue="status.apply_overdue"
      :today="today"
    />
    <PlanNextSteps
      v-if="state === 'draft'"
      :unassigned-count="unassignedCount"
      :class-count="plan.classes.length"
      :empty-teacher-slots="emptyTeacherSlots"
      :carry-over-slots="carryOverSlots"
      :blocking-count="plan.issues.blocking.length"
      :can-edit="editable && canWrite"
      :apply-date="status?.apply_date ?? null"
      :applies-immediately="appliesImmediately"
      :busy="loading"
      :show-teacher-link="viewMode !== 'teachers'"
      :scheduler-enabled="schedulerEnabled"
      :today="today"
      :retain-pending-count="status?.retain_pending_count ?? 0"
      :graduation-date="status?.graduation_date ?? null"
      :graduation-grade-name="graduationGrade"
      @show-unassigned="onShowUnassigned"
      @carry-over="onCarryOverClick"
      @show-teachers="viewMode = 'teachers'"
    />
    <p v-if="showPendingNewNote" class="pending-new-note">
      另有 {{ status?.pending_new_student_count }} 位已報到的新生不在本計畫，開學後請到班級管理分班
    </p>
    <div class="workspace-body" :class="{ 'is-side-collapsed': !isNarrow && sideCollapsed }">
      <div class="main-column">
        <!-- 固定高度的批次列位置（不多佔一列）：未勾選時是檢視切換＋搜尋／篩選（學生名單）或
             老師指派提示；勾選後換成批次列，表格不會被往下推 -->
        <div v-if="plan.classes.length" class="batch-slot">
          <PlanBatchToolbar
            v-if="editable && canWrite && selectedStudentIds.length > 0"
            class="batch-toolbar"
            :selected-count="selectedStudentIds.length"
            :plan-classes="planClassOptions"
            :selected-students="selectedStudents"
            :disabled="loading"
            @bulk-op="onBulkOp"
            @clear-selection="clearSelection"
          />
          <div v-else class="batch-idle">
            <el-segmented
              v-model="viewMode"
              class="view-switch"
              :options="VIEW_OPTIONS"
              aria-label="編班表檢視"
            />
            <template v-if="viewMode === 'students'">
              <div class="roster-search">
                <el-input
                  v-model="searchQuery"
                  class="roster-search-input"
                  :prefix-icon="Search"
                  placeholder="搜尋姓名或學號"
                  aria-label="搜尋學生姓名或學號，Enter 跳下一位"
                  clearable
                  @keydown="onSearchKeydown"
                />
                <span v-if="matchList" class="search-count" aria-live="polite">{{ searchCountText }}</span>
              </div>
              <!-- 篩選 chip 兼圖例：標記長得跟表格裡一樣 -->
              <div class="roster-chips" role="group" aria-label="篩選學生">
                <button
                  v-for="chip in ROSTER_CHIPS"
                  :key="chip.key"
                  type="button"
                  class="filter-chip"
                  :class="{ 'is-active': activeChips.has(chip.key) }"
                  :aria-pressed="activeChips.has(chip.key) ? 'true' : 'false'"
                  :title="chip.title"
                  @click="toggleChip(chip.key)"
                >
                  <span v-if="chip.key === 'manual'" class="legend-dot" aria-hidden="true"></span>
                  <span v-else :class="chip.markClass" aria-hidden="true">{{ chip.mark }}</span>
                  {{ chip.label }}
                </button>
              </div>
              <el-tooltip
                v-if="editable && canWrite"
                content="勾選學生（或班名旁的方框選整班）可批次調整，也能直接拖到其他班"
                placement="bottom"
              >
                <el-icon class="batch-help" tabindex="0" role="img" aria-label="操作說明：勾選學生可批次調整，也能直接拖到其他班">
                  <QuestionFilled />
                </el-icon>
              </el-tooltip>
            </template>
            <p v-else class="batch-hint teacher-hint">
              {{ editable && canWrite ? '點格子選老師；原班老師可用進度列的「沿用原班老師」一鍵帶入' : '各班的班導、副班導與美語老師' }}
            </p>
          </div>
        </div>
        <div v-if="!plan.classes.length" class="zero-class-state">
          <p class="empty-title">草稿裡還沒有任何班級</p>
          <p class="empty-desc">
            {{ plan.source_school_year }} 學年下學期沒有可以升班的班級（或年級設定無法判斷要升到哪個年級）。
            可以先「新增班級」，或到班級管理確認 {{ plan.source_school_year }} 學年下學期的班級與年級設定後，再「重新產生建議」。
          </p>
        </div>
        <PlanRosterTable
          v-else
          ref="rosterRef"
          :plan="plan"
          :editable="editable && canWrite"
          :selected-ids="selectedSet"
          :teacher-options="teacherOptions"
          :busy="loading"
          :view-mode="viewMode"
          :match-ids="matchIdSet"
          :current-match-id="currentMatchId"
          @set-selected="onSetSelected"
          @class-edit="onClassEdit"
          @student-move="onStudentMove"
          @teacher-change="onTeacherChange"
        />
      </div>
      <!-- 寬幕側欄可收合成窄 rail（只顯示阻擋數）讓表格變寬；用 v-show 保留側欄狀態
           （展開的名單、搜尋字），定位時才能直接用 -->
      <div v-if="!isNarrow" class="side-column" :class="{ 'is-collapsed': sideCollapsed }">
        <button
          v-show="sideCollapsed"
          type="button"
          class="side-rail"
          aria-expanded="false"
          :aria-label="`展開問題與名單（阻擋 ${plan.issues.blocking.length} 項）`"
          @click="setSideCollapsed(false)"
        >
          <el-icon aria-hidden="true"><DArrowLeft /></el-icon>
          <span class="rail-count" :class="{ 'is-zero': plan.issues.blocking.length === 0 }">
            {{ plan.issues.blocking.length }}
          </span>
          <span class="rail-label" aria-hidden="true">阻擋</span>
        </button>
        <div v-show="!sideCollapsed" class="side-expanded">
          <div class="side-toolbar">
            <button
              type="button"
              class="btn-side-collapse"
              aria-expanded="true"
              aria-label="收合問題與名單，讓編班表變寬"
              @click="setSideCollapsed(true)"
            >收合<el-icon aria-hidden="true"><DArrowRight /></el-icon></button>
          </div>
          <PlanSidePanel
            :ref="setSidePanelRef"
            :plan="plan"
            :editable="editable && canWrite"
            :selected-ids="selectedSet"
            :busy="loading"
            @set-selected="onSetSelected"
            @locate-issue="onLocateIssue"
            @assign-student="onAssignStudent"
          />
        </div>
      </div>
    </div>
    </template>

    <!-- 不加遮罩且可穿透：在抽屜勾選畢業／排除名單後，左側表格上方的批次列仍可直接操作 -->
    <el-drawer
      v-model="drawerVisible"
      class="side-drawer"
      title="問題與名單"
      size="360px"
      :modal="false"
      modal-penetrable
      :lock-scroll="false"
    >
      <PlanSidePanel
        v-if="isNarrow && plan"
        :ref="setSidePanelRef"
        :plan="plan"
        :editable="editable && canWrite"
        :selected-ids="selectedSet"
        :busy="loading"
        @set-selected="onSetSelected"
        @locate-issue="onLocateIssue"
        @assign-student="onAssignStudent"
      />
    </el-drawer>

    <el-dialog v-model="regenerateDialogVisible" title="重新產生建議" :width="FORM_DIALOG_WIDTH.compact">
      <div class="regenerate-body">
        <p>依最新的在籍資料重算分班建議：</p>
        <!-- 語意照後端 regenerate（fe-contract）：離園一律移除、手動保留但原班更新、
             刪掉的系統班有條件重建、同名略過 -->
        <ul class="regenerate-rules">
          <li>新入園的學生會加入；已離園的學生一律移除（手動調整過的也是）。</li>
          <li>手動調整過的學生保留你的安排，但原班會更新成他現在的班。</li>
          <li>你刪掉的系統班，只有原班還有照系統規則分派的學生（例如新入園）時才會重建；跟現有班級同名的不會重建，完成後會列出來。</li>
          <li>已指派的老師不受影響。</li>
        </ul>
        <p>目前有 {{ manualAdjustedCount }} 位學生手動調整過（表格中姓名旁有圓點），預設會保留。</p>
        <el-checkbox v-model="overwriteManual" class="regenerate-overwrite">
          連手動調整也放棄，全部依系統規則重新分派（刪掉的系統班也會重建）
        </el-checkbox>
      </div>
      <template #footer>
        <el-button :disabled="loading" @click="regenerateDialogVisible = false">取消</el-button>
        <el-button
          class="btn-regenerate-confirm"
          :type="overwriteManual ? 'danger' : 'primary'"
          :loading="loading"
          @click="onRegenerateConfirm"
        >重新產生</el-button>
      </template>
    </el-dialog>

    <PlanPublishDialog
      ref="publishDialogRef"
      v-model="publishDialogVisible"
      :plan-id="plan?.id ?? null"
      :submitting="loading"
      :apply-date="status?.apply_date ?? null"
      :applies-immediately="appliesImmediately"
      :target-school-year="status?.target_school_year ?? null"
      :moved-count="planMoves.moved"
      :retain-count="planMoves.retained"
      :scheduler-enabled="schedulerEnabled"
      :graduation-date="status?.graduation_date ?? null"
      @confirm="onPublishConfirm"
    />

    <PlanClassEditDialog
      v-model="classEditDialogVisible"
      :mode="classEditMode"
      :plan-class="classEditTarget"
      :submitting="loading"
      @create="onClassCreate"
      @update="onClassUpdate"
      @delete="onClassDelete"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { ArrowDown, DArrowLeft, DArrowRight, QuestionFilled, Search } from '@element-plus/icons-vue'
import { hasPermission } from '@/utils/auth'
import { useYearPlanWorkspace } from '@/composables/useYearPlanWorkspace'
import type { BulkOp } from '@/composables/useYearPlanWorkspace'
import PlanRosterTable from '@/components/enrollment/planning/PlanRosterTable.vue'
import PlanSidePanel from '@/components/enrollment/planning/PlanSidePanel.vue'
import PlanBatchToolbar from '@/components/enrollment/planning/PlanBatchToolbar.vue'
import PlanClassEditDialog from '@/components/enrollment/planning/PlanClassEditDialog.vue'
import PlanPublishDialog from '@/components/enrollment/planning/PlanPublishDialog.vue'
import PlanNextSteps from '@/components/enrollment/planning/PlanNextSteps.vue'
import PlanPublishedBar from '@/components/enrollment/planning/PlanPublishedBar.vue'
import { exportClassroomYearPlan } from '@/api/classroomYearPlan'
import { saveBlobResponse } from '@/utils/download'
import { todayTaipeiISO } from '@/utils/format'
import { showMoveNotice, type MoveNoticeHandle } from '@/components/enrollment/planning/planMoveNotice'
import { tenantGetItem, tenantSetItem } from '@/utils/tenantStorage'
import {
  TEACHER_FIELD_BY_ROLE,
  countCarryOverSlots,
  countPlanMoves,
  GRADUATION_CATCHUP_DAYS,
  addDaysISO,
  buildUndoGroups,
  graduationGradeName,
  isWithinPrepPeriod,
  retainRiskPhase,
  filterRosterMatches,
  orderedRosterEntries,
  type RosterChip,
  type RosterViewMode,
  type TeacherField,
  type UndoGroup,
} from '@/components/enrollment/planning/planHelpers'
import { getTeacherOptions } from '@/api/classrooms'
import { FORM_DIALOG_WIDTH } from '@/constants/formDialog'
import { formatPlanDate } from '@/components/enrollment/planning/planHelpers'
import type { TeacherOptionLike } from '@/utils/teacherOption'
import type { Schema } from '@/api/_generated/typed'
import PageHeader from '@/components/common/PageHeader.vue'

// 新學年預編班工作台（Task 11 唯讀渲染層 + Task 12 互動編輯/批次/發布）。
// 所有互動 mutation 共用 useYearPlanWorkspace 單一狀態來源：成功後 reload() 取得新
// version/status，PlanRosterTable 的 editable（依 plan.status）與 selected 勾選重置
// （依 plan.version watch）都自然跟著變化，本層不需要重複維護唯讀鎖。

type PlanClassOut = Schema<'PlanClassOut'>
type ClassCreatePayload = Omit<Schema<'ClassCreateRequest'>, 'base_version'>
type ClassUpdatePayload = Omit<Schema<'ClassUpdateRequest'>, 'base_version'>
type PlanState = Schema<'StatusOut'>['state']

const {
  status,
  plan,
  loading,
  error,
  versionConflict,
  staleAfterWrite,
  state,
  load,
  generate,
  regenerate,
  createClass,
  updateClass,
  deleteClass,
  bulkUpdateStudents,
  carryOverTeachers,
  publish,
  unpublish,
  cancelPlan,
} = useYearPlanWorkspace()

onMounted(() => {
  void load()
})

// 寫入成功但畫面沒更新時，composable 已提醒一次「已儲存，但畫面沒有更新」；
// 不再疊一則成功 toast（P3-1：不要同時跳兩種結果）
function notifySaved(message: string): void {
  if (staleAfterWrite.value) return
  ElMessage.success(message)
}

const STATE_LABELS: Record<PlanState, string> = {
  none: '無草稿',
  draft: '草稿中',
  published: '已發布',
  applied: '已套用',
}
const stateLabel = computed(() => STATE_LABELS[state.value])

// 台北今天：發布截止、畢業日風險、是否在準備期都以此判斷（頁面停留跨日不重算，重新整理即更新）
const today = todayTaipeiISO()
// 排程（自動產生草稿／自動套用）是否啟用；staging／prod 目前未啟用，所有「系統會自動…」
// 的說法都要看這個。欄位缺省（舊後端）視為啟用。
const schedulerEnabled = computed(() => status.value?.scheduler_enabled !== false)
const inPrepPeriod = computed(() => {
  const st = status.value
  return !!st && isWithinPrepPeriod(today, st.prep_start_date, st.apply_date)
})
const graduationGrade = computed(() => (plan.value ? graduationGradeName(plan.value.students) : null))

// 尚無草稿：講清楚何時進入準備期、系統會不會自動產生、現在產生會依據什麼
const noneDescription = computed(() => {
  const st = status.value
  if (!st) return ''
  const basis = `依 ${st.source_school_year} 學年下學期的班級與在籍學生建立分班建議`
  if (appliesImmediately.value) {
    return schedulerEnabled.value
      ? `現在已是 ${st.target_school_year} 學年上學期：現在產生的草稿一經發布，約一小時內就會套用到現行班級。`
      : `現在已是 ${st.target_school_year} 學年上學期，但自動套用未啟用：草稿發布後不會套用，需請系統管理員開啟。`
  }
  if (today < st.prep_start_date) {
    const prep = formatPlanDate(st.prep_start_date)
    const auto = schedulerEnabled.value ? '，系統會在當天自動產生草稿' : ''
    return `${prep} 起進入新學年準備期${auto}；也可以現在先產生，${basis}。`
  }
  return schedulerEnabled.value
    ? `已進入準備期，系統會自動產生草稿；也可以現在先產生，${basis}。`
    : `已進入準備期，可以產生草稿，${basis}。`
})

// ── 補救模式（status.applies_immediately）：上學期才產生／發布的計畫，排程下一輪就套用。
// 已發布但排程未啟用或上次套用失敗時，「約一小時內套用」不成立：改由 PlanPublishedBar
// 用 error 樣式講原因，這裡不再顯示。
const appliesImmediately = computed(() => status.value?.applies_immediately === true)
const showRemedialBanner = computed(() =>
  appliesImmediately.value
  && state.value !== 'applied'
  && !(state.value === 'published' && (!schedulerEnabled.value || !!status.value?.apply_failure)),
)
const remedialTitle = computed(() => {
  const year = status.value?.target_school_year
  if (!schedulerEnabled.value) {
    return `現在已是 ${year} 學年上學期，但自動套用未啟用：發布後不會套用到現行班級，需請系統管理員開啟`
  }
  if (state.value === 'published') return `已發布，${year} 學年上學期已開始：排程會在約一小時內套用到現行班級`
  if (state.value === 'none') return `現在已是 ${year} 學年上學期：草稿產生並發布後，約一小時內就會套用到現行班級`
  return `現在已是 ${year} 學年上學期：這份計畫發布後約一小時內就會套用到現行班級`
})
const remedialDescription = computed(() =>
  state.value === 'published'
    ? '要停止請立即「撤回發布」。套用後會搬動全園學生的班級、讓大班生轉為畢業、更新老師帶班資料，且無法復原。'
    : '套用會搬動全園學生的班級、讓大班生轉為畢業、更新老師帶班資料，且無法復原。只想調整個別學生，請到「班級管理」或學生資料處理。',
)

// 權限鎖：對齊 ClassroomView.vue 慣例，寫入動作鈕（新增班/重生成/發布/撤回/產生草稿
// CTA）與 PlanRosterTable 的可編輯性一律疊加此權限；僅 READ 者連勾選/編輯鈕都不出現。
const canWrite = computed(() => hasPermission('CLASSROOMS_WRITE'))

// 唯讀鎖：僅 draft 狀態的草稿可編輯（published/applied 皆唯讀）。
const editable = computed(() => plan.value?.status === 'draft')

// 發布：draft 且無 blocking issue 才可執行（發布前必須先解決阻擋項目）
const canPublish = computed(() => {
  if (state.value !== 'draft') return false
  if (plan.value) return plan.value.issues.blocking.length === 0
  return (status.value?.blocking_count ?? 0) === 0
})
// 作廢草稿：draft（放棄未完成草稿）或 published（等同取消已發布的確認）皆可操作；
// none（無草稿可作廢）與 applied（已套用，不可逆）不顯示此按鈕。
const canCancelPlan = computed(() => state.value === 'draft' || state.value === 'published')

function onGenerateClick(): void {
  void generate()
}

// ── 409 version_conflict 統一處理：所有互動 mutation 共用同一份 composable 狀態，
// 任何一個失敗設定 versionConflict 後這裡統一跳出提示，避免每個呼叫端各自判斷。
watch(versionConflict, (conflict) => {
  if (!conflict) return
  ElMessageBox.alert(
    error.value ?? '此草稿已被其他操作異動，請重新載入後再試',
    '版本衝突',
    { type: 'warning', confirmButtonText: '重新載入' },
  )
    .then(() => load())
    .catch(() => {})
})

// ── 重新產生建議 dialog ──
const regenerateDialogVisible = ref(false)
const overwriteManual = ref(false)
const manualAdjustedCount = computed(
  () => plan.value?.students.filter(s => s.manually_adjusted).length ?? 0,
)

function onRegenerateClick(): void {
  overwriteManual.value = false
  regenerateDialogVisible.value = true
}

async function onRegenerateConfirm(): Promise<void> {
  const result = await regenerate(overwriteManual.value)
  if (result) {
    const summary = `已重新產生：新增 ${result.added}、移除 ${result.removed}、更新 ${result.updated}，保留手動調整 ${result.preserved_manual} 筆`
    const skipped = result.skipped_class_names ?? []
    if (skipped.length && !staleAfterWrite.value) {
      // 刪掉的系統班要重建時撞到現有同名班：後端略過不建，要讓使用者知道是哪幾班
      ElMessage.warning({
        message: `${summary}。下列班級跟現有班級同名，沒有重建：${skipped.join('、')}`,
        duration: 8000,
        showClose: true,
      })
    } else {
      notifySaved(summary)
    }
    regenerateDialogVisible.value = false
  }
}

// ── 發布 / 撤回發布 ──
const publishDialogVisible = ref(false)
const publishDialogRef = ref<InstanceType<typeof PlanPublishDialog> | null>(null)

function onPublishClick(): void {
  publishDialogVisible.value = true
}

async function onPublishConfirm(): Promise<void> {
  // 補救模式後端要求帶目標學年確認（dialog 已讓使用者輸入過學年）
  const result = await publish(appliesImmediately.value ? status.value?.target_school_year : undefined)
  if (result.ok) {
    notifySaved('已發布')
    publishDialogVisible.value = false
  } else if (result.blockingIssues) {
    ElMessage.warning('尚有阻擋問題，無法發布，已重新整理清單')
    await publishDialogRef.value?.reload()
  }
}

// 撤回發布的後果要講清楚：沒在套用日前重新發布就不會套用；留在畢業年級的留級生只有
// 「已發布」時才會被畢業排程豁免（P1-2）。人數用後端 retain_pending_count（published 也有值），
// 依今天與畢業日的距離分三段：畢業日前／畢業日起 7 天補跑期間（隨時可能被畢業）／補跑期過後。
const planMoves = computed(() =>
  plan.value ? countPlanMoves(plan.value.students, plan.value.classes) : { moved: 0, retained: 0 },
)

function retainUnpublishWarning(): string {
  const st = status.value
  const count = st?.retain_pending_count ?? 0
  if (!st || count <= 0) return ''
  const who = `${count} 位${graduationGrade.value ?? '畢業年級'}留級生`
  const graduation = st.graduation_date
  const phase = retainRiskPhase(today, graduation)
  if (phase === 'before' && graduation) {
    return `目前有 ${who}：撤回後如果沒在畢業日 ${formatPlanDate(graduation)} 前重新發布，他們會被系統自動畢業。`
  }
  if (phase === 'catchup' && graduation) {
    const until = formatPlanDate(addDaysISO(graduation, GRADUATION_CATCHUP_DAYS))
    return `目前有 ${who}：已過畢業日，但系統到 ${until} 前仍會補跑自動畢業，撤回期間他們可能被畢業，請改完立刻重新發布。`
  }
  if (phase === 'after') {
    return `目前有 ${who}：已過畢業日的補跑期間，撤回後他們不會再被自動畢業，但要在套用前重新發布，留級才會生效。`
  }
  // 沒有畢業日（理論上不會）：保守提醒
  return `目前有 ${who}：撤回期間他們可能被系統自動畢業，請改完立刻重新發布。`
}

function unpublishMessage(): string {
  const parts = ['撤回後草稿恢復為可編輯。']
  if (!schedulerEnabled.value) {
    parts.push('自動套用未啟用：改完重新發布後，仍要請系統管理員開啟才會套用。')
  } else if (appliesImmediately.value) {
    parts.push('改完要重新發布，才會套用到現行班級。')
  } else {
    const date = formatPlanDate(status.value?.apply_date)
    parts.push(date
      ? `請在 ${date} 前重新發布，否則新學年不會自動套用。`
      : '請在新學年開學前重新發布，否則不會自動套用。')
  }
  const retain = retainUnpublishWarning()
  if (retain) parts.push(retain)
  return parts.join('')
}

async function onUnpublishClick(): Promise<boolean> {
  try {
    await ElMessageBox.confirm(
      unpublishMessage(),
      '撤回發布',
      { type: 'warning', confirmButtonText: '確定撤回', cancelButtonText: '取消' },
    )
  } catch {
    return false // 使用者取消
  }
  const ok = await unpublish()
  if (ok) notifySaved('已撤回發布')
  return ok
}

// 已發布但有阻擋：撤回（同一個確認框，留級生警告照樣出現）→ 打開重新產生建議
async function onUnpublishAndRegenerate(): Promise<void> {
  if (await onUnpublishClick()) onRegenerateClick()
}

// 有已報到、尚未開學的新生：他們不在草稿（草稿只收在籍生），開學後要另外分班
const showPendingNewNote = computed(() =>
  (state.value === 'draft' || state.value === 'published') && (status.value?.pending_new_student_count ?? 0) > 0,
)

// ── 匯出 Excel（讀取權限即可、任何狀態）：檔名由後端 Content-Disposition 給 ──
async function onExportClick(): Promise<void> {
  const planId = plan.value?.id
  if (planId == null) return
  try {
    const res = await exportClassroomYearPlan(planId)
    saveBlobResponse(res, `${plan.value?.target_school_year ?? ''}學年預編班.xlsx`)
  } catch (e) {
    const err = e as { displayMessage?: string | null }
    ElMessage.error(err?.displayMessage || '匯出失敗，請稍後再試')
  }
}

// ── 作廢：確認鈕一律 danger。已發布的計畫作廢＝同時取消發布、無法復原，多一道
// 「輸入作廢」確認；草稿則單純告知草稿將移除、可重新產生。作廢後 plan 從系統消失，
// cancelPlan() 內建 reload() 會讓 state 回到 none，本層不需要額外處理空狀態渲染。
const CANCEL_CONFIRM_WORD = '作廢'

async function onCancelPlanClick(): Promise<void> {
  const lost = '所有手動調整（搬班、留級、排除）與老師指派都會一起消失'
  // 準備期內排程會補產生草稿（約每小時檢查一次）；排程未啟用或還沒到準備期就不會
  const regen = schedulerEnabled.value && inPrepPeriod.value
    ? '目前在準備期內，作廢後系統約一小時內會自動重新產生一份新草稿。'
    : ''
  try {
    if (state.value === 'published') {
      await ElMessageBox.prompt(
        `此計畫已發布，作廢會同時取消發布。這份新學年草稿會被移除，${lost}；之後可重新產生，但要從頭調整。${regen}此操作無法復原，請輸入「${CANCEL_CONFIRM_WORD}」確認。`,
        '作廢已發布的計畫',
        {
          type: 'warning',
          confirmButtonText: '確定作廢',
          cancelButtonText: '取消',
          confirmButtonClass: 'el-button--danger',
          inputPlaceholder: '請輸入確認文字',
          inputValidator: (value: string) =>
            (value || '').trim() === CANCEL_CONFIRM_WORD || `請輸入「${CANCEL_CONFIRM_WORD}」`,
        },
      )
    } else {
      await ElMessageBox.confirm(
        `作廢後這份新學年草稿會被移除，${lost}；之後可重新產生，但要從頭調整。${regen}確定要作廢嗎？`,
        '作廢草稿',
        {
          type: 'warning',
          confirmButtonText: '確定作廢',
          cancelButtonText: '取消',
          confirmButtonClass: 'el-button--danger',
        },
      )
    }
  } catch {
    return // 使用者取消
  }
  const ok = await cancelPlan()
  if (ok) notifySaved('已作廢，草稿已移除')
}

// 「更多」：匯出、作廢；窄幕時另收「新增班級」「重新產生建議」。
function onMoreCommand(command: string): void {
  if (command === 'export') void onExportClick()
  else if (command === 'cancel-plan') void onCancelPlanClick()
  else if (command === 'add-class') onAddClassClick()
  else if (command === 'regenerate') onRegenerateClick()
}

// ── 班級編輯（新增／編輯／刪除）──
const classEditDialogVisible = ref(false)
const classEditMode = ref<'create' | 'edit'>('create')
const classEditTarget = ref<PlanClassOut | null>(null)

function onAddClassClick(): void {
  classEditMode.value = 'create'
  classEditTarget.value = null
  classEditDialogVisible.value = true
}

function onClassEdit(planClassId: number): void {
  classEditMode.value = 'edit'
  classEditTarget.value = plan.value?.classes.find(c => c.id === planClassId) ?? null
  classEditDialogVisible.value = true
}

async function onClassCreate(payload: ClassCreatePayload): Promise<void> {
  const ok = await createClass(payload)
  if (ok) {
    notifySaved('已新增班級')
    classEditDialogVisible.value = false
  }
}

async function onClassUpdate(classId: number, payload: ClassUpdatePayload): Promise<void> {
  const ok = await updateClass(classId, payload)
  if (ok) {
    notifySaved('已更新班級')
    classEditDialogVisible.value = false
  }
}

async function onClassDelete(classId: number): Promise<void> {
  const ok = await deleteClass(classId)
  if (ok) {
    notifySaved('已刪除班級')
    classEditDialogVisible.value = false
  }
}

// ── 三師指派：格內直接改（PATCH 單一欄位）＋沿用原班老師（只填空格）──
const teacherOptions = ref<TeacherOptionLike[]>([])
let teacherOptionsRequested = false

async function loadTeacherOptions(): Promise<void> {
  if (teacherOptionsRequested) return
  teacherOptionsRequested = true
  try {
    const res = await getTeacherOptions()
    teacherOptions.value = (res.data ?? []) as TeacherOptionLike[]
  } catch {
    teacherOptionsRequested = false // 下次進入可編輯狀態再試；格子仍可顯示現值
  }
}

watch(
  () => editable.value && canWrite.value,
  (canEditPlan) => {
    if (canEditPlan) void loadTeacherOptions()
  },
  { immediate: true },
)

async function onTeacherChange(planClassId: number, field: TeacherField, teacherId: number | null): Promise<void> {
  const ok = await updateClass(planClassId, { [field]: teacherId } as ClassUpdatePayload)
  if (ok) notifySaved(teacherId == null ? '已清除老師' : '已更新老師')
}

const carryOverSlots = computed(() => (plan.value ? countCarryOverSlots(plan.value.classes) : 0))

const emptyTeacherSlots = computed(() => {
  const classes = plan.value?.classes ?? []
  const empty = (field: TeacherField) => classes.filter(c => c[field] == null).length
  return {
    head: empty(TEACHER_FIELD_BY_ROLE.head),
    assistant: empty(TEACHER_FIELD_BY_ROLE.assistant),
    art: empty(TEACHER_FIELD_BY_ROLE.art),
  }
})

async function onCarryOverClick(): Promise<void> {
  try {
    await ElMessageBox.confirm(
      `將依原班老師帶入 ${carryOverSlots.value} 個空著的老師欄位（班導、副班導、美語老師）。已指派的不會被覆蓋；已停用、或已在其他班擔任班導／副班導的老師會略過。`,
      '沿用原班老師',
      { type: 'info', confirmButtonText: '帶入', cancelButtonText: '取消' },
    )
  } catch {
    return // 使用者取消
  }
  const result = await carryOverTeachers()
  if (!result || staleAfterWrite.value) return
  const skipped: string[] = []
  if (result.skipped_inactive) skipped.push(`${result.skipped_inactive} 位已停用`)
  if (result.skipped_conflict) skipped.push(`${result.skipped_conflict} 位已在其他班帶班`)
  const skippedText = skipped.length ? `；略過 ${skipped.join('、')}` : ''
  if (result.filled > 0) ElMessage.success(`已帶入 ${result.filled} 位老師${skippedText}`)
  else ElMessage.info(`沒有可帶入的老師${skippedText}`)
}

// ── 待分班：進度列「查看」→ 捲到側欄第一位待分班學生（窄幕先開抽屜）──
const unassignedStudents = computed(() =>
  (plan.value?.students ?? []).filter(
    s => (s.disposition === 'promote' || s.disposition === 'retain') && s.plan_class_id == null,
  ),
)
const unassignedCount = computed(() => unassignedStudents.value.length)

async function onShowUnassigned(): Promise<void> {
  const first = unassignedStudents.value[0]
  if (!first) return
  await revealSidePanel()
  await sidePanelRef.value?.locateStudent(first.id)
}

/** 要在側欄定位前：窄幕打開抽屜、寬幕把收合的 rail 展開。 */
async function revealSidePanel(): Promise<void> {
  if (isNarrow.value) {
    if (!drawerVisible.value) {
      drawerVisible.value = true
      await nextTick()
    }
  } else if (sideCollapsed.value) {
    setSideCollapsed(false)
    await nextTick()
  }
}

// ── 學生批次操作：selection 單一事實來源（表格 + 側欄待分班共用；批次工具列據此
// 派發）。selectedSet 用 ref<Set<number>> 而非 ref<number[]>——Vue 會把 Set 深度
// reactive 化，故 .add()/.delete()/.clear() 就地變更即可觸發子元件 computed
// （props.selectedIds.has()）更新，不需要整包重新指派新 Set。──
const selectedSet = ref<Set<number>>(new Set())
const selectedStudentIds = computed(() => Array.from(selectedSet.value))

function onSetSelected(ids: number[], checked: boolean): void {
  for (const id of ids) {
    if (checked) selectedSet.value.add(id)
    else selectedSet.value.delete(id)
  }
}

function clearSelection(): void {
  selectedSet.value.clear()
}

// 草稿被異動（regenerate/發布/批次調整）後 version 遞增；新 plan 不殘留舊勾選
watch(() => plan.value?.version, clearSelection)

const rosterRef = ref<InstanceType<typeof PlanRosterTable> | null>(null)
type SidePanelInstance = InstanceType<typeof PlanSidePanel>
const sidePanelRef = ref<SidePanelInstance | null>(null)
function setSidePanelRef(el: unknown): void {
  if (el) sidePanelRef.value = el as SidePanelInstance
}

const planClassOptions = computed(() =>
  (plan.value?.classes ?? []).map(c => ({
    id: c.id,
    label: `${c.grade_name ?? ''} ${c.target_name}`.trim(),
    gradeName: c.grade_name ?? null,
  })),
)

// 批次列依所選學生（含畢業／排除名單勾選）判斷可用的操作
const selectedStudents = computed(() =>
  (plan.value?.students ?? []).filter(s => selectedSet.value.has(s.id)),
)

async function onBulkOp(payload: {
  op: BulkOp
  planClassId?: number | null
  excludeReason?: string | null
}): Promise<void> {
  if (!selectedStudentIds.value.length) return
  if (payload.op === 'assign' || payload.op === 'retain') {
    if (await moveWithUndo(payload.op, selectedStudentIds.value, payload.planClassId ?? null)) clearSelection()
    return
  }
  const ok = await bulkUpdateStudents(
    payload.op,
    selectedStudentIds.value,
    payload.planClassId ?? null,
    payload.excludeReason ?? null,
  )
  if (ok) {
    notifySaved('已更新學生分派')
    clearSelection()
  }
}

// ── 搬班回饋與復原（P2-7）：批次移至班級／標記留級／拖曳成功後，被搬的學生閃一下，
// 並跳附「復原」鈕的通知。復原＝依搬動前快照逐批送回原處（另一次 mutation），成功
// 只跳一般訊息，不再產生可復原通知（避免無限鏈）。原本待分班的人後端沒有「放回待
// 分班」的操作，不提供復原並在通知說明。──
let moveNotice: MoveNoticeHandle | null = null

async function moveWithUndo(op: 'assign' | 'retain', studentIds: number[], planClassId: number | null): Promise<boolean> {
  const idSet = new Set(studentIds)
  const before = (plan.value?.students ?? []).filter(s => idSet.has(s.id)).map(s => ({ ...s }))
  const target = plan.value?.classes.find(c => c.id === planClassId)
  const ok = await bulkUpdateStudents(op, studentIds, planClassId, null)
  if (!ok) return false
  // 寫入成功但畫面沒更新：composable 已提醒重新載入，這時版本落後，復原必撞版本衝突
  if (staleAfterWrite.value) return true
  await nextTick()
  rosterRef.value?.flashStudents(studentIds)

  const { groups, restorableIds, unassignedCount: wasUnassigned } = buildUndoGroups(before)
  const where = target ? `${target.target_name}（${target.grade_name ?? '未分年級'}）` : '新的班級'
  let message = op === 'retain'
    ? `已將 ${studentIds.length} 位學生標記留級，放進 ${where}`
    : `已將 ${studentIds.length} 位學生移到 ${where}`
  if (groups.length === 0) message += '。他們原本在待分班，這次不提供復原'
  else if (wasUnassigned > 0) message += `。其中 ${wasUnassigned} 位原本在待分班，復原時不會放回待分班`
  moveNotice?.close()
  moveNotice = showMoveNotice({
    message,
    onUndo: groups.length ? () => { void undoMove(groups, restorableIds) } : undefined,
  })
  return true
}

function waitUntilIdle(): Promise<void> {
  if (!loading.value) return Promise.resolve()
  return new Promise((resolve) => {
    const stop = watch(loading, (busy) => {
      if (busy) return
      stop()
      resolve()
    })
  })
}

async function undoMove(groups: UndoGroup[], studentIds: number[]): Promise<void> {
  // 另一個動作還在送：等它結束再復原（直接送會被 in-flight 防護擋掉）
  await waitUntilIdle()
  if (!editable.value) {
    ElMessage.info('這份計畫已不是草稿，無法復原')
    return
  }
  let done = 0
  for (const group of groups) {
    const ok = await bulkUpdateStudents(group.op, group.studentIds, group.planClassId, group.excludeReason)
    if (!ok) break
    done += 1
  }
  if (done === groups.length) {
    notifySaved('已復原')
    await nextTick()
    rosterRef.value?.flashStudents(studentIds)
  } else if (done > 0) {
    ElMessage.warning('只復原了一部分，請看一下表格再手動調整')
  }
}

// 側欄待分班列就地「分到…」（一般生 assign、留級生 retain，由側欄依 disposition 決定）
async function onAssignStudent(payload: { studentId: number; op: BulkOp; planClassId: number }): Promise<void> {
  const ok = await bulkUpdateStudents(payload.op, [payload.studentId], payload.planClassId)
  if (!ok) return
  const target = plan.value?.classes.find(c => c.id === payload.planClassId)
  notifySaved(target ? `已分到 ${target.target_name}` : '已更新學生分派')
  if (viewMode.value === 'students') {
    await nextTick()
    rosterRef.value?.flashStudents([payload.studentId])
  }
}

// 老師相關問題在「老師指派」檢視才看得到老師格
const TEACHER_ISSUE_CODES = new Set([
  'head_teacher_missing',
  'assistant_teacher_missing',
  'art_teacher_missing',
  'teacher_duplicate',
  'teacher_invalid',
  'teacher_resigning',
])

async function onLocateIssue(issue: Schema<'IssueOut'>): Promise<void> {
  if (issue.student_id != null) {
    // 已分班 → 表格定位（老師指派檢視沒有學生列，先切回學生名單）；否則 fallback
    // 側欄待分班清單。窄幕抽屜模式下表格在抽屜後方，命中 roster 分支才需先關抽屜
    // 露出表格；sidePanel 分支目標就在抽屜內，不關。
    const studentId = issue.student_id
    const inTable = rosterEntries.value.some(entry => entry.student.id === studentId)
    if (inTable && viewMode.value !== 'students') {
      viewMode.value = 'students'
      await nextTick()
    }
    if (rosterRef.value?.locateStudent(issue.student_id)) {
      if (isNarrow.value) drawerVisible.value = false
      return
    }
    // 待分班、畢業／排除名單（側欄會先展開名單）；都不在＝學生不在草稿裡
    const found = await sidePanelRef.value?.locateStudent(issue.student_id)
    if (!found) {
      ElMessage.info(editable.value
        ? '這位學生不在草稿裡：按「重新產生建議」才會加進草稿'
        : '這位學生不在這份計畫裡')
    }
    return
  }
  if (issue.plan_class_id != null) {
    // 班級一律是表格目標，窄幕同理先關抽屜
    if (isNarrow.value) drawerVisible.value = false
    if (TEACHER_ISSUE_CODES.has(issue.code) && viewMode.value !== 'teachers') {
      viewMode.value = 'teachers'
      await nextTick()
    }
    rosterRef.value?.locateClass(issue.plan_class_id)
  }
}

// <1280px 側欄改抽屜（admin 桌機為主，僅作基本自適應；測試環境 happy-dom 有真
// matchMedia 實作但預設 innerWidth=1024，測試檔 beforeAll 已 stub 回桌機寬幕）
const isNarrow = ref(false)
const drawerVisible = ref(false)
let narrowMq: MediaQueryList | null = null
const onNarrowChange = (e: MediaQueryListEvent | MediaQueryList): void => {
  isNarrow.value = e.matches
}

onMounted(() => {
  if (typeof window.matchMedia !== 'function') return
  narrowMq = window.matchMedia('(max-width: 1279px)')
  onNarrowChange(narrowMq)
  narrowMq.addEventListener('change', onNarrowChange)
})

onUnmounted(() => {
  narrowMq?.removeEventListener('change', onNarrowChange)
})

const totalIssueCount = computed(
  () => (plan.value?.issues.blocking.length ?? 0) + (plan.value?.issues.warnings.length ?? 0),
)

// student-move：編班表拖曳搬班（留級生由 PlanRosterTable 送 op=retain），與批次列共用
// bulkUpdateStudents 派發路徑。
async function onStudentMove(payload: {
  studentIds: number[]
  op: BulkOp
  planClassId?: number | null
  excludeReason?: string | null
}): Promise<void> {
  if (!payload.studentIds.length) return
  if (payload.op === 'assign' || payload.op === 'retain') {
    await moveWithUndo(payload.op, payload.studentIds, payload.planClassId ?? null)
    return
  }
  const ok = await bulkUpdateStudents(
    payload.op,
    payload.studentIds,
    payload.planClassId ?? null,
    payload.excludeReason ?? null,
  )
  if (ok) notifySaved('已更新學生分派')
}

// ── 編班表檢視（P2-10）：學生名單／老師指派。切換時清掉勾選（另一個檢視看不到學生列）──
const VIEW_OPTIONS: Array<{ label: string; value: RosterViewMode }> = [
  { label: '學生名單', value: 'students' },
  { label: '老師指派', value: 'teachers' },
]
const viewMode = ref<RosterViewMode>('students')
watch(viewMode, clearSelection)

// ── 搜尋與篩選（P2-11）：只標示、不改資料。符合者依表格欄序排，Enter 下一位、
// Shift+Enter 上一位，到底繞回。──
const ROSTER_CHIPS: Array<{ key: RosterChip; label: string; mark: string; markClass: string; title: string }> = [
  { key: 'moved', label: '換班', mark: '原', markClass: 'legend-moved', title: '從別班換進來的學生（表格中「原」＝原班）' },
  { key: 'retain', label: '留級', mark: '留', markClass: 'legend-retain', title: '留級生（表格中標「留」）' },
  { key: 'manual', label: '手動調整', mark: '', markClass: '', title: '手動調整過的學生（表格中姓名旁的圓點），重新產生建議時會保留' },
]
const searchQuery = ref('')
const activeChips = ref<Set<RosterChip>>(new Set())
const currentMatchIndex = ref(0)

const rosterEntries = computed(() =>
  plan.value ? orderedRosterEntries(plan.value.students, plan.value.classes) : [],
)
const matchList = computed(() => filterRosterMatches(rosterEntries.value, searchQuery.value, activeChips.value))
const matchIdSet = computed(() => (matchList.value ? new Set(matchList.value) : null))
const currentMatchId = computed(() => {
  const list = matchList.value
  if (!list || list.length === 0) return null
  return list[Math.min(currentMatchIndex.value, list.length - 1)]
})
const searchCountText = computed(() => {
  const list = matchList.value ?? []
  if (list.length === 0) return '0/0'
  return `${Math.min(currentMatchIndex.value, list.length - 1) + 1}/${list.length}`
})

function toggleChip(chip: RosterChip): void {
  if (activeChips.value.has(chip)) activeChips.value.delete(chip)
  else activeChips.value.add(chip)
}

// 條件變了 → 回到第一位並捲過去（reload 造成的名單變動不捲，避免畫面亂跳）
watch(
  () => [searchQuery.value, [...activeChips.value].join(',')],
  async () => {
    currentMatchIndex.value = 0
    const first = currentMatchId.value
    if (first == null) return
    await nextTick()
    rosterRef.value?.scrollToStudent(first)
  },
)

function onSearchKeydown(event: Event | KeyboardEvent): void {
  if (!('key' in event) || event.key !== 'Enter') return
  event.preventDefault()
  const total = matchList.value?.length ?? 0
  if (total === 0) return
  const step = event.shiftKey ? -1 : 1
  currentMatchIndex.value = (Math.min(currentMatchIndex.value, total - 1) + step + total) % total
  const id = currentMatchId.value
  if (id != null) rosterRef.value?.scrollToStudent(id)
}

// ── 側欄收合 rail：每位使用者自己的版面偏好，存 tenantStorage；讀寫失敗（無痕、
// 封鎖儲存）一律當成展開，不影響操作 ──
const SIDE_COLLAPSED_KEY = 'yearPlan.sidePanelCollapsed'

function readSideCollapsed(): boolean {
  try {
    return tenantGetItem(SIDE_COLLAPSED_KEY) === '1'
  } catch {
    return false
  }
}

const sideCollapsed = ref(readSideCollapsed())

function setSideCollapsed(collapsed: boolean): void {
  sideCollapsed.value = collapsed
  try {
    tenantSetItem(SIDE_COLLAPSED_KEY, collapsed ? '1' : '0')
  } catch {
    /* 偏好寫不進去不影響操作 */
  }
}

// ── 表格上方的東西（橫幅、批次列、進度列、側欄寬度）變了，表格頂端就會移動：
// 請編班表重算捲動區高度（它自己只管掛載、視窗縮放與檢視切換）──
watch(
  () => [
    staleAfterWrite.value,
    showRemedialBanner.value,
    state.value,
    plan.value?.version,
    selectedStudentIds.value.length > 0,
    isNarrow.value,
    sideCollapsed.value,
  ],
  async () => {
    await nextTick()
    rosterRef.value?.remeasure()
  },
)
</script>

<style scoped>
.term-range {
  color: var(--text-secondary);
  font-size: var(--text-sm);
}

.status-badge {
  display: inline-flex;
  align-items: center;
  padding: 2px 10px;
  border-radius: var(--radius-full, 9999px);
  font-size: var(--text-xs);
  font-weight: 700;
  background: var(--color-neutral-100);
  color: var(--neutral-700);
}

/* 草稿是正常工作狀態，不用警示色（還差什麼交給進度列）；文字取深一階確保 AA 對比 */
.status-badge.status-draft {
  background: var(--color-info-soft);
  color: var(--color-info-darker);
}

.status-badge.status-published {
  background: var(--color-primary-lighter);
  color: var(--el-color-primary-dark-2);
}

.status-badge.status-applied {
  background: var(--color-success-soft);
  color: var(--color-success-darker);
}

.actions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
}

.dropdown-item-danger {
  color: var(--color-danger);
}

.remedial-banner,
.stale-banner,
.published-blocking-alert {
  margin-bottom: var(--space-4);
}

.pending-new-note {
  margin: calc(-1 * var(--space-2)) 0 var(--space-3);
  font-size: var(--text-sm);
  color: var(--text-secondary);
}

.stale-body {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-3);
}

.loading-skeleton {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.skeleton-row {
  height: 32px;
  border-radius: var(--radius-md);
  background: linear-gradient(90deg, var(--color-neutral-100) 25%, var(--color-neutral-200) 37%, var(--color-neutral-100) 63%);
  background-size: 400% 100%;
  animation: skeleton-loading 1.4s ease infinite;
}

@keyframes skeleton-loading {
  0% { background-position: 100% 50%; }
  100% { background-position: 0 50%; }
}

.workspace-error {
  padding: var(--space-4);
  border-radius: var(--radius-md);
  background: var(--color-danger-soft);
  color: var(--color-danger-hover);
}

.btn-reload {
  margin-top: var(--space-2);
}

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-3);
  padding: var(--space-12) 0;
  color: var(--text-secondary);
}

.workspace-body {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 320px;
  gap: var(--space-5);
  align-items: start;
}

@media (max-width: 1279px) {
  .workspace-body {
    grid-template-columns: minmax(0, 1fr);
  }
}

.main-column {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}

.workspace-body.is-side-collapsed {
  grid-template-columns: minmax(0, 1fr) auto;
}

.side-column {
  position: sticky;
  top: var(--space-3);
  max-height: calc(100vh - 140px);
  overflow-y: auto;
}

.side-toolbar {
  display: flex;
  justify-content: flex-end;
  margin-bottom: var(--space-1);
}

.btn-side-collapse {
  display: inline-flex;
  align-items: center;
  gap: var(--space-1);
  padding: var(--space-1) var(--space-2);
  border: none;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--text-secondary);
  font-size: var(--text-xs);
  cursor: pointer;
}

.btn-side-collapse:hover {
  background: var(--color-neutral-100);
  color: var(--text-primary);
}

/* 收合後的窄 rail：只剩阻擋數，點了展開 */
.side-rail {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-2);
  width: 2.75rem;
  padding: var(--space-3) 0;
  border: 1px solid var(--color-neutral-200);
  border-radius: var(--radius-md);
  background: var(--surface-color);
  color: var(--text-secondary);
  cursor: pointer;
}

.side-rail:hover {
  border-color: var(--color-neutral-300);
  color: var(--text-primary);
}

.rail-count {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 1.5rem;
  padding: 0 var(--space-1);
  border-radius: var(--radius-full);
  font-size: var(--text-xs);
  font-weight: var(--font-weight-bold);
  color: var(--color-danger-hover);
  background: var(--color-danger-soft);
}

.rail-count.is-zero {
  color: var(--color-success-darker);
  background: var(--color-success-soft);
}

.rail-label {
  writing-mode: vertical-rl;
  font-size: var(--text-xs);
}

.batch-slot {
  position: sticky;
  top: 0;
  z-index: var(--z-sticky);
  display: flex;
  align-items: center;
  min-height: 44px;
  border: 1px solid var(--color-neutral-200);
  border-radius: var(--radius-md);
  padding: var(--space-1) var(--space-3);
  background: var(--surface-color);
}

.batch-toolbar {
  flex: 1 1 auto;
  padding: 0;
}

.batch-idle {
  display: flex;
  flex: 1 1 auto;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-2) var(--space-3);
}

.roster-search {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
}

.roster-search-input {
  width: 11rem;
}

.search-count {
  min-width: 2.5rem;
  font-size: var(--text-xs);
  color: var(--text-secondary);
  font-variant-numeric: tabular-nums;
}

.roster-chips {
  display: inline-flex;
  flex-wrap: wrap;
  gap: var(--space-2);
}

.filter-chip {
  display: inline-flex;
  align-items: center;
  gap: var(--space-1);
  padding: var(--space-1) var(--space-2);
  border: 1px solid var(--color-neutral-200);
  border-radius: var(--radius-full);
  background: var(--surface-color);
  color: var(--text-primary);
  font-size: var(--text-sm);
  cursor: pointer;
}

.filter-chip:hover {
  border-color: var(--color-neutral-300);
}

.filter-chip.is-active {
  border-color: var(--color-warning);
  background: var(--color-warning-soft);
}

.batch-help {
  color: var(--text-secondary);
  cursor: help;
}

/* 與 PlanRosterTable 的 .manual-mark／.student-moved／.disposition-tag-retain 同樣子 */
.legend-dot {
  display: inline-block;
  width: 6px;
  height: 6px;
  border-radius: var(--radius-full);
  background: var(--color-info);
}

.legend-moved {
  font-size: var(--text-xs);
  color: var(--color-info-hover);
}

.legend-retain {
  padding: 0 var(--space-1);
  border-radius: var(--radius-sm);
  font-size: var(--text-xs);
  color: var(--color-warning-hover);
  background: var(--color-warning-soft);
}

@media (pointer: coarse) {
  .filter-chip,
  .btn-side-collapse {
    min-height: 32px;
  }
}

.batch-hint {
  margin: 0;
  font-size: var(--text-sm);
  color: var(--text-secondary);
}

.empty-title {
  margin: 0;
  font-size: var(--text-lg);
  font-weight: var(--font-weight-semibold);
  color: var(--text-primary);
}

.empty-desc {
  max-width: 60ch;
  margin: 0;
  line-height: 1.7;
  text-align: center;
}

.zero-class-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-10) var(--space-4);
  border: 1px dashed var(--color-neutral-300);
  border-radius: var(--radius-md);
  color: var(--text-secondary);
}

.regenerate-body {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  line-height: 1.7;
}

.regenerate-body p {
  margin: 0;
}

.regenerate-rules {
  margin: 0;
  padding-left: var(--space-5);
}
</style>
