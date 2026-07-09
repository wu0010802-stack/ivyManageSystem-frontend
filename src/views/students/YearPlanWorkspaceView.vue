<template>
  <div class="year-plan-workspace">
    <div class="page-header">
      <div class="header-main">
        <h2>新學年預編班</h2>
        <template v-if="status">
          <span class="term-range">
            {{ status.source_school_year }} 學年下學期 → {{ status.target_school_year }} 學年上學期
          </span>
          <span class="status-badge" :class="`status-${state}`">{{ stateLabel }}</span>
        </template>
      </div>
      <!-- mutation in-flight（loading=true）期間鎖住所有互動觸發點：雙擊會以同一
           base_version 送第二發、撞 409 誤導使用者「有別人在動草稿」 -->
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
    </div>

    <div v-if="loading && !plan" class="loading-skeleton">
      <div class="skeleton-row" v-for="i in 4" :key="i"></div>
    </div>

    <div v-else-if="error" class="workspace-error">
      <p>{{ error }}</p>
      <el-button class="btn-reload" @click="load">重新載入</el-button>
    </div>

    <div v-else-if="state === 'none'" class="empty-state">
      <p>尚未產生新學年編班草稿</p>
      <el-button v-if="canWrite" type="primary" class="btn-generate" @click="onGenerateClick">產生草稿</el-button>
    </div>

    <div v-else-if="plan" class="workspace-body">
      <div class="main-column">
        <PlanBatchToolbar
          v-if="editable && canWrite && selectedStudentIds.length > 0"
          class="batch-toolbar"
          :selected-count="selectedStudentIds.length"
          :plan-classes="planClassOptions"
          :disabled="loading"
          @bulk-op="onBulkOp"
          @clear-selection="clearSelection"
        />
        <PlanRosterTable
          ref="rosterRef"
          :plan="plan"
          :editable="editable && canWrite"
          :selected-ids="selectedSet"
          @set-selected="onSetSelected"
          @class-edit="onClassEdit"
          @student-move="onStudentMove"
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

    <el-dialog v-model="regenerateDialogVisible" title="重新產生建議" width="440px">
      <p>將保留 {{ manualAdjustedCount }} 筆手動調整。</p>
      <el-checkbox v-model="overwriteManual">放棄我的手動調整（依系統規則全部重新分派）</el-checkbox>
      <template #footer>
        <el-button :disabled="loading" @click="regenerateDialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="loading" @click="onRegenerateConfirm">執行</el-button>
      </template>
    </el-dialog>

    <PlanPublishDialog
      ref="publishDialogRef"
      v-model="publishDialogVisible"
      :plan-id="plan?.id ?? null"
      :submitting="loading"
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
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
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
import type { Schema } from '@/api/_generated/typed'

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
  const message = state.value === 'published'
    ? '此計畫已發布，作廢將同時取消先前的發布確認，這份新學年草稿會被移除，之後可重新產生。此操作無法復原，確定要作廢嗎？'
    : '作廢後這份新學年草稿將被移除，之後可重新產生。確定要作廢嗎？'
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
  })),
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
    // 已分班 → 表格定位；否則 fallback 側欄待分班清單
    if (rosterRef.value?.locateStudent(issue.student_id)) return
    await sidePanelRef.value?.locateStudent(issue.student_id)
    return
  }
  if (issue.plan_class_id != null) {
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
.page-header {
  margin-bottom: var(--space-5);
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: var(--space-3);
}

.header-main {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  flex-wrap: wrap;
}

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
  background: var(--neutral-100);
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

.loading-skeleton {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.skeleton-row {
  height: 32px;
  border-radius: var(--radius-md);
  background: linear-gradient(90deg, var(--neutral-100) 25%, var(--neutral-200) 37%, var(--neutral-100) 63%);
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

.batch-toolbar {
  position: sticky;
  top: 0;
  z-index: 5;
  border: 1px solid var(--neutral-200);
  border-radius: var(--radius-md);
  padding: var(--space-2) var(--space-3);
  background: var(--surface-color);
  box-shadow: var(--shadow-sm, 0 1px 3px rgba(0, 0, 0, 0.08));
}
</style>
