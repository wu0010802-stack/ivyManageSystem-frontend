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
      <div v-if="status" class="actions">
        <button
          type="button"
          class="btn-regenerate"
          :disabled="!canRegenerate"
          @click="onRegenerateClick"
        >重新產生建議</button>
        <button
          type="button"
          class="btn-publish"
          :disabled="!canPublish"
          @click="onPublishClick"
        >發布</button>
        <button
          type="button"
          class="btn-unpublish"
          :disabled="!canUnpublish"
          @click="onUnpublishClick"
        >撤回發布</button>
      </div>
    </div>

    <div v-if="loading && !plan" class="loading-skeleton">
      <div class="skeleton-row" v-for="i in 4" :key="i"></div>
    </div>

    <div v-else-if="error" class="workspace-error">
      <p>{{ error }}</p>
      <button type="button" class="btn-reload" @click="load">重新載入</button>
    </div>

    <div v-else-if="state === 'none'" class="empty-state">
      <p>尚未產生新學年編班草稿</p>
      <button type="button" class="btn-generate" @click="onGenerateClick">產生草稿</button>
    </div>

    <div v-else-if="plan" class="workspace-body">
      <PlanIssuesPanel :issues="plan.issues" @locate-issue="onLocateIssue" />
      <PlanRosterTable
        :plan="plan"
        :editable="plan.status === 'draft'"
        @select-students="onSelectStudents"
        @class-edit="onClassEdit"
        @student-move="onStudentMove"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import { useYearPlanWorkspace } from '@/composables/useYearPlanWorkspace'
import PlanRosterTable from '@/components/enrollment/planning/PlanRosterTable.vue'
import PlanIssuesPanel from '@/components/enrollment/planning/PlanIssuesPanel.vue'
import type { Schema } from '@/api/_generated/typed'

// 新學年預編班工作台（Task 11：唯讀渲染層 + 骨架）。
// 互動編輯（regenerate/發布/撤回/逐班調整/學生批次操作）行為留給 Task 12 接線；
// 本頁先把狀態渲染與按鈕 disabled 邏輯做完整。

const { status, plan, loading, error, state, load, generate } = useYearPlanWorkspace()

onMounted(load)

const STATE_LABELS: Record<string, string> = {
  none: '無草稿',
  draft: '草稿中',
  published: '已發布',
  applied: '已套用',
}
const stateLabel = computed(() => STATE_LABELS[state.value] ?? state.value)

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

// 以下三個動作鈕行為留 Task 12 接線；本 task 先給出可感知的回饋避免死按鈕。
function onRegenerateClick(): void {
  ElMessage.info('重新產生建議功能將於下一步驟提供')
}
function onPublishClick(): void {
  ElMessage.info('發布功能將於下一步驟提供')
}
function onUnpublishClick(): void {
  ElMessage.info('撤回發布功能將於下一步驟提供')
}

function onLocateIssue(issue: Schema<'IssueOut'>): void {
  // Task 12：捲動/高亮對應班級或學生列；本 task 先接住事件避免未處理警告。
  void issue
}
function onSelectStudents(ids: number[]): void {
  void ids
}
function onClassEdit(planClassId: number): void {
  void planClassId
}
function onStudentMove(payload: { studentId: number; fromPlanClassId: number | null; toPlanClassId: number | null }): void {
  void payload
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

.actions button {
  border: 1px solid var(--neutral-300);
  background: var(--neutral-0);
  border-radius: var(--radius-md);
  padding: 6px 14px;
  cursor: pointer;
  font-weight: 600;
}

.actions button:disabled {
  cursor: not-allowed;
  opacity: 0.5;
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
  border: 1px solid var(--color-danger-hover);
  background: var(--neutral-0);
  color: var(--color-danger-hover);
  border-radius: var(--radius-md);
  padding: 4px 12px;
  cursor: pointer;
}

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-3);
  padding: var(--space-12) 0;
  color: var(--text-secondary);
}

.btn-generate {
  border: none;
  background: var(--color-info);
  color: var(--neutral-0);
  border-radius: var(--radius-md);
  padding: 8px 20px;
  font-weight: 700;
  cursor: pointer;
}

.workspace-body {
  display: flex;
  flex-direction: column;
  gap: var(--space-5);
}
</style>
