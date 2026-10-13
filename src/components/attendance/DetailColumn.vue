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
          :busy="resolving"
          @resolve="onResolve"
          @navigate="(d: number) => emit('navigate', d)"
        />
      </template>
      <div v-else class="detail-column__empty">
        <p>目前沒有選取的異常紀錄；不代表整月打卡資料已齊全。</p>
        <el-button v-if="hasPermission('ATTENDANCE_WRITE')" @click="emit('import')">匯入打卡紀錄</el-button>
      </div>
    </template>

    <!-- month mode -->
    <template v-else>
      <div class="detail-column__toolbar">
        <el-button size="small" @click="emit('anomalies')">開啟異常清單</el-button>
      </div>
      <EmployeeMonthPanel
        :employee-id="employeeId"
        :employee-name="employeeName"
        :year="year"
        :month="month"
        :focus-date="focusDate"
        :revision="revision"
        @updated="emit('resolved')"
      />
    </template>
  </div>
</template>

<script setup lang="ts">
import { hasPermission } from '@/utils/auth'
import ResolveCard from './ResolveCard.vue'
import EmployeeMonthPanel from './EmployeeMonthPanel.vue'
import { useResolveAnomaly, type ResolvePayload } from '@/composables/useResolveAnomaly'
import type { AnomalyDayCard } from '@/composables/useAttendanceWorkspace'

// ── props & emits ──────────────────────────────────────────────────────────────
const props = defineProps<{
  mode: 'resolve' | 'month'
  anomaly: AnomalyDayCard | null
  anomalyIndex: number
  anomalyTotal: number
  context: {
    punch_in: string | null
    punch_out: string | null
    has_leave: boolean
    estimated_deduction: number
  }
  employeeId: number | null
  employeeName?: string
  year: number
  month: number
  focusDate?: string | null
  /** 匯入／補卡等寫入後遞增，供整月明細重新載入（同員工同月時三個 key 都沒變） */
  revision?: number
}>()

const emit = defineEmits<{
  (e: 'anomalies'): void
  (e: 'import'): void
  (e: 'resolved'): void
  (e: 'navigate', delta: number): void
  (e: 'switchMode', mode: 'resolve' | 'month'): void
}>()

// ── 處理動作（與排班與出勤抽屜共用 useResolveAnomaly）──────────────────────────
// 成功後不在此 emit navigate：容器 refresh 後同 index 自然顯示下一筆；navigate 只保留給 ResolveCard 的 ◀▶
const { resolving, resolve } = useResolveAnomaly(() => emit('resolved'), 'DetailColumn.resolve')

function onResolve(payload: ResolvePayload): void {
  if (!props.anomaly) return
  void resolve({ employeeId: props.employeeId, date: props.anomaly.date, attendanceId: props.anomaly.id }, payload)
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
  flex-direction: column;
  display: flex;
  align-items: center;
  justify-content: center;
  flex: 1;
  color: var(--text-tertiary, #94a3b8);
  font-size: var(--text-sm, 0.875rem);
  padding: var(--space-8);
}
</style>
