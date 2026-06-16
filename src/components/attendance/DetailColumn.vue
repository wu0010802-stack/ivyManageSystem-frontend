<template>
  <div class="detail-column">
    <!-- resolve mode -->
    <template v-if="mode === 'resolve'">
      <div class="detail-column__toolbar">
        <el-button size="small" @click="emit('switchMode', 'month')">看整月</el-button>
      </div>
      <template v-if="anomaly !== null">
        <ResolveCard
          :item="anomaly"
          :index="anomalyIndex"
          :total="anomalyTotal"
          :context="context"
          @resolve="onResolve"
          @navigate="(d: number) => emit('navigate', d)"
        />
      </template>
      <div v-else class="detail-column__empty">
        <span>異常已清空</span>
      </div>
    </template>

    <!-- month mode -->
    <template v-else>
      <div class="detail-column__toolbar">
        <el-button size="small" @click="emit('switchMode', 'resolve')">回佇列</el-button>
      </div>
      <EmployeeMonthPanel
        :employee-id="employeeId"
        :year="year"
        :month="month"
        @updated="emit('resolved')"
      />
    </template>
  </div>
</template>

<script setup lang="ts">
import { ElMessage } from 'element-plus'
import ResolveCard from './ResolveCard.vue'
import EmployeeMonthPanel from './EmployeeMonthPanel.vue'
import { upsertRecord, batchConfirmAnomalies } from '@/api/attendance'
import { useErrorNotify } from '@/composables/useErrorNotify'
import type { AnomalyItem } from '@/composables/useAttendanceWorkspace'

// ── props & emits ──────────────────────────────────────────────────────────────
const props = defineProps<{
  mode: 'resolve' | 'month'
  anomaly: AnomalyItem | null
  anomalyIndex: number
  anomalyTotal: number
  context: {
    punch_in: string | null
    punch_out: string | null
    has_leave: boolean
    estimated_deduction: number
  }
  employeeId: number | null
  year: number
  month: number
}>()

const emit = defineEmits<{
  (e: 'resolved'): void
  (e: 'navigate', delta: number): void
  (e: 'switchMode', mode: 'resolve' | 'month'): void
}>()

// ── error notify ───────────────────────────────────────────────────────────────
const { notify } = useErrorNotify()

// ── action handler ─────────────────────────────────────────────────────────────
async function onResolve(payload: {
  action: 'punch' | 'admin_accept' | 'admin_waive'
  punch_in?: string
  punch_out?: string
}): Promise<void> {
  try {
    if (payload.action === 'punch') {
      await upsertRecord({
        employee_id: props.employeeId!,
        date: props.anomaly!.date,
        ...(payload.punch_in !== undefined ? { punch_in: payload.punch_in } : {}),
        ...(payload.punch_out !== undefined ? { punch_out: payload.punch_out } : {}),
      })
    } else {
      await batchConfirmAnomalies({
        attendance_ids: [props.anomaly!.id],
        action: payload.action,
      })
    }
    ElMessage.success('已處理')
    emit('resolved')
    emit('navigate', 1)
  } catch (err) {
    notify(err, 'DetailColumn.resolve', null, { prefix: '處理失敗' })
  }
}
</script>

<style scoped>
.detail-column {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  height: 100%;
}

.detail-column__toolbar {
  display: flex;
  justify-content: flex-end;
  padding: var(--space-2) var(--space-4);
  border-bottom: 1px solid var(--border-color-light, #f1f5f9);
}

.detail-column__empty {
  display: flex;
  align-items: center;
  justify-content: center;
  flex: 1;
  color: var(--text-tertiary, #94a3b8);
  font-size: var(--text-sm, 0.875rem);
  padding: var(--space-8);
}
</style>
