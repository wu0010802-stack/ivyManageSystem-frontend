<script setup lang="ts">
import { computed } from 'vue'
import { MoreFilled } from '@element-plus/icons-vue'
import { hasPermission } from '@/utils/auth'
import { STAGE_LABEL, GRADE_TAG, gradeLabel } from '@/constants/appraisalYearEnd'

interface Summary { id: number; employee_name?: string; status?: string; total_score?: number; grade?: string; bonus_amount?: number; [key: string]: unknown }

const props = defineProps<{
  summary: Summary
  selected?: boolean
  showMenu?: boolean
}>()
const emit = defineEmits<{
  'update:selected': [value: boolean]
  'action': [payload: { action: string; summary: Summary }]
}>()

function onCheckboxChange(v: string | number | boolean) { emit('update:selected', Boolean(v)) }
function onMenuClick(action: string) { emit('action', { action, summary: props.summary }) }

// P0-A：依 APPRAISAL_* permission bit 個別守衛 dropdown 動作。
// 簽核 / 退簽：任一 sign 權限即顯示（後端會依當前 stage 二次驗）。
const hasAnySignPerm = computed(
  () => hasPermission('APPRAISAL_REVIEW')
    || hasPermission('APPRAISAL_ACCOUNTING')
    || hasPermission('APPRAISAL_FINALIZE'),
)
// P1-8：FINALIZED 已是終態，沒有下一個 stage，「簽核」option 必須隱藏
// 否則點下去 CycleDetailPanel.onKanbanAction stage map 取不到值 silent
// no-op，使用者以為系統壞了。退簽 (REJECT) 仍允許（FINALIZED → ACCOUNTING_SIGNED）。
const canSign = computed(
  () => hasAnySignPerm.value && props.summary?.status !== 'FINALIZED',
)
const canReject = hasAnySignPerm

// Task 8：卡尾「當前一步」主按鈕——依 summary.status 與 per-stage 權限判斷
// 顯示哪一步；沿用既有單一 action 事件契約（{ action: 'sign', summary }），
// stage 推導交回 CycleDetailPanel.onKanbanAction（依 status 映射），不新造事件名。
const canSignSupervisor = computed(() => hasPermission('APPRAISAL_REVIEW'))
const canSignAccounting = computed(() => hasPermission('APPRAISAL_ACCOUNTING'))
const canFinalizeStage = computed(() => hasPermission('APPRAISAL_FINALIZE'))
const primaryAction = computed(() => {
  const s = props.summary?.status
  if (s === 'DRAFT' && canSignSupervisor.value) return { label: STAGE_LABEL.SUPERVISOR }
  if (s === 'SUPERVISOR_SIGNED' && canSignAccounting.value) return { label: STAGE_LABEL.ACCOUNTING }
  if (s === 'ACCOUNTING_SIGNED' && canFinalizeStage.value) return { label: STAGE_LABEL.FINALIZE }
  return null
})
function onPrimaryAction() {
  emit('action', { action: 'sign', summary: props.summary })
}
</script>

<template>
  <div class="summary-card" :class="{ selected }">
    <div class="card-header">
      <el-checkbox :model-value="selected" @update:model-value="onCheckboxChange"
                   :data-test="`card-checkbox-${summary.id}`" />
      <span class="employee-name">{{ summary.employee_name }}</span>
      <el-dropdown v-if="showMenu" trigger="click" @command="onMenuClick">
        <el-icon class="menu-icon"><MoreFilled /></el-icon>
        <template #dropdown>
          <el-dropdown-menu>
            <el-dropdown-item
              v-if="canSign"
              command="sign"
              data-test="dropdown-item-sign"
            >簽核</el-dropdown-item>
            <el-dropdown-item
              v-if="canReject"
              command="reject"
              data-test="dropdown-item-reject"
            >退簽</el-dropdown-item>
            <el-dropdown-item command="comment">留言</el-dropdown-item>
            <el-dropdown-item command="log">看 log</el-dropdown-item>
          </el-dropdown-menu>
        </template>
      </el-dropdown>
    </div>
    <div class="card-body">
      <div>總分：<strong>{{ Number(summary.total_score).toFixed(2) }}</strong></div>
      <div>
        等第：
        <el-tag size="small" :type="GRADE_TAG[summary.grade as string]" data-test="grade-tag">
          {{ gradeLabel(summary.grade as string ?? '') }}
        </el-tag>
      </div>
      <div>獎金：{{ Number(summary.bonus_amount).toLocaleString() }}</div>
    </div>
    <div v-if="primaryAction" class="card-footer">
      <el-button
        size="small"
        type="primary"
        class="summary-card__primary"
        data-test="summary-primary-action"
        @click.stop="onPrimaryAction"
      >{{ primaryAction.label }}</el-button>
    </div>
  </div>
</template>

<style scoped>
.summary-card {
  border: 1px solid var(--el-border-color); border-radius: 6px;
  padding: var(--space-2) 10px; display: flex; flex-direction: column; gap: 6px;
  background: var(--el-bg-color);
}
.summary-card.selected { border-color: var(--el-color-primary); background: var(--el-color-primary-light-9); }
.card-header { display: flex; align-items: center; gap: var(--space-2); }
.employee-name { flex: 1; font-weight: 600; }
.menu-icon { cursor: pointer; padding: var(--space-1); }
.card-body { font-size: 12px; display: flex; flex-direction: column; gap: 2px; color: var(--el-text-color-regular); }
.card-footer { display: flex; justify-content: flex-end; }
</style>
