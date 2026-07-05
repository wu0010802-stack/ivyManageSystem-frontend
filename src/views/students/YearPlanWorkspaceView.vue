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
          <span v-if="plan" class="issue-chip issue-chip-blocking">阻擋 {{ plan.issues.blocking.length }}</span>
          <span v-if="plan" class="issue-chip issue-chip-warning">提醒 {{ plan.issues.warnings.length }}</span>
        </template>
      </div>
      <!-- mutation in-flight（loading=true）期間鎖住所有互動觸發點：雙擊會以同一
           base_version 送第二發、撞 409 誤導使用者「有別人在動草稿」 -->
      <div v-if="status" class="actions">
        <el-button v-if="editable" class="btn-add-class" :disabled="loading" @click="onAddClassClick">新增班級</el-button>
        <el-button class="btn-regenerate" :disabled="!canRegenerate || loading" @click="onRegenerateClick">重新產生建議</el-button>
        <el-button type="primary" class="btn-publish" :disabled="!canPublish || loading" @click="onPublishClick">發布</el-button>
        <el-button class="btn-unpublish" :disabled="!canUnpublish || loading" @click="onUnpublishClick">撤回發布</el-button>
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
      <el-button type="primary" class="btn-generate" @click="onGenerateClick">產生草稿</el-button>
    </div>

    <div v-else-if="plan" class="workspace-body">
      <PlanIssuesPanel :issues="plan.issues" @locate-issue="onLocateIssue" />
      <PlanBatchToolbar
        v-if="editable"
        class="batch-toolbar"
        :selected-count="selectedStudentIds.length"
        :plan-classes="planClassOptions"
        :disabled="loading"
        @bulk-op="onBulkOp"
      />
      <PlanRosterTable
        :plan="plan"
        :editable="editable"
        @select-students="onSelectStudents"
        @class-edit="onClassEdit"
        @student-move="onStudentMove"
      />
    </div>

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
import { computed, onMounted, ref, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { useYearPlanWorkspace } from '@/composables/useYearPlanWorkspace'
import type { BulkOp } from '@/composables/useYearPlanWorkspace'
import PlanRosterTable from '@/components/enrollment/planning/PlanRosterTable.vue'
import PlanIssuesPanel from '@/components/enrollment/planning/PlanIssuesPanel.vue'
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
} = useYearPlanWorkspace()

onMounted(load)

const STATE_LABELS: Record<PlanState, string> = {
  none: '無草稿',
  draft: '草稿中',
  published: '已發布',
  applied: '已套用',
}
const stateLabel = computed(() => STATE_LABELS[state.value])

// 唯讀鎖：僅 draft 狀態的草稿可編輯（published/applied 皆唯讀）。
const editable = computed(() => plan.value?.status === 'draft')

// 重新產生建議：僅 draft 狀態可操作（regenerate 端點也要求 status===draft）
const canRegenerate = computed(() => state.value === 'draft')
// 發布：draft 且無 blocking issue 才可執行（發布前必須先解決阻擋項目）
const canPublish = computed(() => {
  if (state.value !== 'draft') return false
  if (plan.value) return plan.value.issues.blocking.length === 0
  return (status.value?.blocking_count ?? 0) === 0
})
// 撤回發布：僅 published 狀態可操作
const canUnpublish = computed(() => state.value === 'published')

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

// ── 學生批次操作 ──
const selectedStudentIds = ref<number[]>([])

function onSelectStudents(ids: number[]): void {
  selectedStudentIds.value = ids
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
    selectedStudentIds.value = []
  }
}

function onLocateIssue(issue: Schema<'IssueOut'>): void {
  // Task 13（若有）：捲動/高亮對應班級或學生列；本 task 先接住事件避免未處理警告。
  void issue
}

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

.issue-chip {
  display: inline-flex;
  align-items: center;
  padding: 2px 8px;
  border-radius: var(--radius-full, 9999px);
  font-size: var(--text-xs);
  font-weight: 600;
}

.issue-chip-blocking {
  background: var(--color-danger-soft);
  color: var(--color-danger-hover);
}

.issue-chip-warning {
  background: var(--color-warning-soft);
  color: var(--color-warning-hover);
}

.actions {
  display: flex;
  gap: var(--space-2);
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
  display: flex;
  flex-direction: column;
  gap: var(--space-5);
}

.batch-toolbar {
  border: 1px solid var(--neutral-200);
  border-radius: var(--radius-md);
  padding: var(--space-2) var(--space-3);
  background: var(--neutral-50);
}
</style>
