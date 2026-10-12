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
      <div v-if="status" class="actions">
        <el-badge v-if="isNarrow && plan" :value="totalIssueCount" :hidden="totalIssueCount === 0" class="drawer-badge">
          <el-button class="btn-side-drawer" @click="drawerVisible = true">問題與名單</el-button>
        </el-badge>
        <template v-if="canWrite && state === 'draft'">
          <el-button class="btn-add-class" :disabled="loading" @click="onAddClassClick">新增班級</el-button>
          <el-button class="btn-regenerate" :disabled="loading" @click="onRegenerateClick">重新產生建議</el-button>
          <el-button type="primary" class="btn-publish" :disabled="!canPublish || loading" @click="onPublishClick">發布</el-button>
        </template>
        <el-button
          v-if="canWrite && state === 'published'"
          class="btn-unpublish"
          :disabled="loading"
          @click="onUnpublishClick"
        >撤回發布</el-button>
        <el-dropdown v-if="canWrite && canCancelPlan" trigger="click" @command="onMoreCommand">
          <el-button class="btn-more" :disabled="loading">
            更多<el-icon class="el-icon--right"><ArrowDown /></el-icon>
          </el-button>
          <template #dropdown>
            <el-dropdown-menu>
              <el-dropdown-item command="cancel-plan" class="dropdown-item-danger">作廢草稿</el-dropdown-item>
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

    <div v-if="loading && !plan" class="loading-skeleton">
      <div class="skeleton-row" v-for="i in 4" :key="i"></div>
    </div>

    <!-- 只有「還沒有 plan 可顯示」的載入失敗才換成錯誤畫面；寫入失敗已由 composable
         toast，工作台必須留著讓使用者修正後重試 -->
    <div v-else-if="error && !plan" class="workspace-error">
      <p>{{ error }}</p>
      <el-button class="btn-reload" @click="load">重新載入</el-button>
    </div>

    <div v-else-if="state === 'none'" class="empty-state">
      <p class="empty-title">還沒有 {{ status?.target_school_year }} 學年的編班草稿</p>
      <p class="empty-desc">{{ noneDescription }}</p>
      <el-button v-if="canWrite" type="primary" class="btn-generate" @click="onGenerateClick">產生草稿</el-button>
    </div>

    <template v-else-if="plan">
    <PlanNextSteps
      v-if="state === 'draft'"
      :unassigned-count="unassignedCount"
      :empty-teacher-slots="emptyTeacherSlots"
      :carry-over-slots="carryOverSlots"
      :blocking-count="plan.issues.blocking.length"
      :can-edit="editable && canWrite"
      :apply-date="status?.apply_date ?? null"
      :applies-immediately="appliesImmediately"
      :busy="loading"
      @show-unassigned="onShowUnassigned"
      @carry-over="onCarryOverClick"
    />
    <div class="workspace-body">
      <div class="main-column">
        <!-- 固定高度的批次列位置：未勾選時是操作提示，勾選後換成批次列，表格不會被往下推 -->
        <div v-if="editable && canWrite && plan.classes.length" class="batch-slot">
          <PlanBatchToolbar
            v-if="selectedStudentIds.length > 0"
            class="batch-toolbar"
            :selected-count="selectedStudentIds.length"
            :plan-classes="planClassOptions"
            :selected-students="selectedStudents"
            :disabled="loading"
            @bulk-op="onBulkOp"
            @clear-selection="clearSelection"
          />
          <p v-else class="batch-hint">
            勾選學生（或勾班名旁的方框選整班）後，可以批次移班、標記留級或排除；也可以直接把學生拖到其他班。
          </p>
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
          @set-selected="onSetSelected"
          @class-edit="onClassEdit"
          @student-move="onStudentMove"
          @teacher-change="onTeacherChange"
        />
      </div>
      <PlanSidePanel
        v-if="!isNarrow"
        :ref="setSidePanelRef"
        class="side-panel"
        :plan="plan"
        :editable="editable && canWrite"
        :selected-ids="selectedSet"
        @set-selected="onSetSelected"
        @locate-issue="onLocateIssue"
      />
    </div>
    </template>

    <el-drawer v-model="drawerVisible" size="360px" :with-header="false">
      <PlanSidePanel
        v-if="isNarrow && plan"
        :ref="setSidePanelRef"
        :plan="plan"
        :editable="editable && canWrite"
        :selected-ids="selectedSet"
        @set-selected="onSetSelected"
        @locate-issue="onLocateIssue"
      />
    </el-drawer>

    <el-dialog v-model="regenerateDialogVisible" title="重新產生建議" :width="FORM_DIALOG_WIDTH.compact">
      <div class="regenerate-body">
        <p>依最新的在籍資料重算分班建議：新入園的學生會加入、已離園的會移除、換過班的會更新。班級與老師指派不受影響。</p>
        <p>目前有 {{ manualAdjustedCount }} 位學生手動調整過（表格中姓名旁有圓點），預設會保留。</p>
        <el-checkbox v-model="overwriteManual" class="regenerate-overwrite">
          連手動調整也放棄，全部依系統規則重新分派
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
import { ArrowDown } from '@element-plus/icons-vue'
import { hasPermission } from '@/utils/auth'
import { useYearPlanWorkspace } from '@/composables/useYearPlanWorkspace'
import type { BulkOp } from '@/composables/useYearPlanWorkspace'
import PlanRosterTable from '@/components/enrollment/planning/PlanRosterTable.vue'
import PlanSidePanel from '@/components/enrollment/planning/PlanSidePanel.vue'
import PlanBatchToolbar from '@/components/enrollment/planning/PlanBatchToolbar.vue'
import PlanClassEditDialog from '@/components/enrollment/planning/PlanClassEditDialog.vue'
import PlanPublishDialog from '@/components/enrollment/planning/PlanPublishDialog.vue'
import PlanNextSteps from '@/components/enrollment/planning/PlanNextSteps.vue'
import {
  TEACHER_FIELD_BY_ROLE,
  countCarryOverSlots,
  type TeacherField,
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

onMounted(load)

const STATE_LABELS: Record<PlanState, string> = {
  none: '無草稿',
  draft: '草稿中',
  published: '已發布',
  applied: '已套用',
}
const stateLabel = computed(() => STATE_LABELS[state.value])

// 尚無草稿：講清楚系統何時會自動產生、現在產生會依據什麼
const noneDescription = computed(() => {
  const st = status.value
  if (!st) return ''
  if (appliesImmediately.value) {
    return `現在已是 ${st.target_school_year} 學年上學期：現在產生的草稿一經發布，約一小時內就會套用到現行班級。`
  }
  const prep = formatPlanDate(st.prep_start_date)
  return `系統會在 ${prep} 自動產生草稿；也可以現在先產生，依 ${st.source_school_year} 學年下學期的班級與在籍學生建立分班建議。`
})

// ── 補救模式（status.applies_immediately）：上學期才產生／發布的計畫，排程下一輪就套用
const appliesImmediately = computed(() => status.value?.applies_immediately === true)
const showRemedialBanner = computed(() => appliesImmediately.value && state.value !== 'applied')
const remedialTitle = computed(() => {
  const year = status.value?.target_school_year
  return state.value === 'published'
    ? `已發布，${year} 學年上學期已開始：排程會在約一小時內套用到現行班級`
    : `現在已是 ${year} 學年上學期：這份計畫發布後約一小時內就會套用到現行班級`
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
    ElMessage.success(
      `已重新產生：新增 ${result.added}、移除 ${result.removed}、更新 ${result.updated}，保留手動調整 ${result.preserved_manual} 筆`,
    )
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
  const result = await publish()
  if (result.ok) {
    ElMessage.success('已發布')
    publishDialogVisible.value = false
  } else if (result.blockingIssues) {
    ElMessage.warning('尚有阻擋問題，無法發布，已重新整理清單')
    await publishDialogRef.value?.reload()
  }
}

async function onUnpublishClick(): Promise<void> {
  try {
    await ElMessageBox.confirm(
      '確定要撤回發布嗎？撤回後草稿將恢復為可編輯狀態。',
      '撤回發布',
      { type: 'warning', confirmButtonText: '確定撤回', cancelButtonText: '取消' },
    )
  } catch {
    return // 使用者取消
  }
  const ok = await unpublish()
  if (ok) ElMessage.success('已撤回發布')
}

// ── 作廢草稿：published 狀態語氣加重（等同取消已發布的確認），draft 則單純告知
// 草稿將移除、可重新產生。作廢後 plan 從系統消失，cancelPlan() 內建 reload() 會讓
// state 回到 none，本層不需要額外處理空狀態渲染。
async function onCancelPlanClick(): Promise<void> {
  const lost = '所有手動調整（搬班、留級、排除）與老師指派都會一起消失'
  const message = state.value === 'published'
    ? `此計畫已發布，作廢會同時取消發布。這份新學年草稿會被移除，${lost}；之後可重新產生，但要從頭調整。此操作無法復原，確定要作廢嗎？`
    : `作廢後這份新學年草稿會被移除，${lost}；之後可重新產生，但要從頭調整。確定要作廢嗎？`
  try {
    await ElMessageBox.confirm(message, '作廢草稿', {
      type: 'warning',
      confirmButtonText: '確定作廢',
      cancelButtonText: '取消',
    })
  } catch {
    return // 使用者取消
  }
  const ok = await cancelPlan()
  if (ok) ElMessage.success('已作廢，草稿已移除')
}

// 「更多」下拉目前僅一個作廢項目，command 用字串比對保留未來擴充空間。
function onMoreCommand(command: string): void {
  if (command === 'cancel-plan') void onCancelPlanClick()
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
    ElMessage.success('已新增班級')
    classEditDialogVisible.value = false
  }
}

async function onClassUpdate(classId: number, payload: ClassUpdatePayload): Promise<void> {
  const ok = await updateClass(classId, payload)
  if (ok) {
    ElMessage.success('已更新班級')
    classEditDialogVisible.value = false
  }
}

async function onClassDelete(classId: number): Promise<void> {
  const ok = await deleteClass(classId)
  if (ok) {
    ElMessage.success('已刪除班級')
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
  if (ok) ElMessage.success(teacherId == null ? '已清除老師' : '已更新老師')
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
  if (!result) return
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
  if (isNarrow.value) {
    drawerVisible.value = true
    await nextTick()
  }
  await sidePanelRef.value?.locateStudent(first.id)
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
  const ok = await bulkUpdateStudents(
    payload.op,
    selectedStudentIds.value,
    payload.planClassId ?? null,
    payload.excludeReason ?? null,
  )
  if (ok) {
    ElMessage.success('已更新學生分派')
    clearSelection()
  }
}

async function onLocateIssue(issue: Schema<'IssueOut'>): Promise<void> {
  if (issue.student_id != null) {
    // 已分班 → 表格定位；否則 fallback 側欄待分班清單。窄幕抽屜模式下表格在抽屜
    // 後方，命中 roster 分支才需先關抽屜露出表格；sidePanel 分支目標就在抽屜內，
    // 不關。
    if (rosterRef.value?.locateStudent(issue.student_id)) {
      if (isNarrow.value) drawerVisible.value = false
      return
    }
    await sidePanelRef.value?.locateStudent(issue.student_id)
    return
  }
  if (issue.plan_class_id != null) {
    // 班級一律是表格目標，窄幕同理先關抽屜
    if (isNarrow.value) drawerVisible.value = false
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

// student-move：拖曳搬班尚未接線（brief：checkbox 批次優先），保留與 PlanBatchToolbar
// 相同的派發路徑供未來串接。
async function onStudentMove(payload: {
  studentIds: number[]
  op: BulkOp
  planClassId?: number | null
  excludeReason?: string | null
}): Promise<void> {
  if (!payload.studentIds.length) return
  const ok = await bulkUpdateStudents(
    payload.op,
    payload.studentIds,
    payload.planClassId ?? null,
    payload.excludeReason ?? null,
  )
  if (ok) ElMessage.success('已更新學生分派')
}
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

.status-badge.status-draft {
  background: var(--color-warning-soft);
  color: var(--color-warning-hover);
}

.status-badge.status-published {
  background: var(--color-info-soft);
  color: var(--color-info-hover);
}

.status-badge.status-applied {
  background: var(--color-success-soft);
  color: var(--color-success-hover);
}

.actions {
  display: flex;
  gap: var(--space-2);
}

.dropdown-item-danger {
  color: var(--color-danger);
}

.remedial-banner {
  margin-bottom: var(--space-4);
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

.side-panel {
  position: sticky;
  top: var(--space-3);
  max-height: calc(100vh - 140px);
  overflow-y: auto;
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
</style>
