<template>
  <div class="detail-column">
    <!-- resolve mode -->
    <template v-if="mode === 'resolve'">
      <div class="detail-column__toolbar">
        <el-button size="small" @click="emit('switchMode', 'month')">看整月</el-button>
      </div>
      <template v-if="anomaly !== null">
        <!-- 班表核對的判定和這裡不同時並列寫出：疑似換班的日子在這裡只會看到「遲到」，接受下去就扣錯了 -->
        <div v-if="gridVerdict && gridVerdict.status === 'possible_shift_change'" class="detail-column__grid-note" role="note" data-test="detail-grid-shift-change">
          <p>班表核對判定這天是「{{ gridVerdict.label }}」：若是換了班，先到班表核對確認當日班別，遲到早退會照新班別重算；不要在這裡接受扣款。</p>
          <el-button link type="primary" data-test="detail-open-grid" @click="emit('openGrid', employeeId!, anomaly.date)">到班表核對處理</el-button>
        </div>
        <p v-else-if="gridVerdict && isRecordsBlind(gridVerdict.status)" class="detail-column__grid-verdict" data-test="detail-grid-verdict">班表核對：{{ gridVerdict.label }}</p>
        <ResolveCard
          :item="anomaly"
          :index="anomalyIndex"
          :total="anomalyTotal"
          :context="context"
          :busy="resolving"
          :accept-warning="gridVerdict?.acceptWarning ?? null"
          @resolve="onResolve"
          @navigate="(d: number) => emit('navigate', d)"
          @retry="emit('retryRecords')"
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
import { computed } from 'vue'
import { hasPermission } from '@/utils/auth'
import { isRecordsBlind, useGridVerdict } from '@/composables/useGridVerdict'
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
    records?: 'loading' | 'loaded' | 'failed'
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
  /** 打卡紀錄載入失敗，使用者按重試 */
  (e: 'retryRecords'): void
  /** 到班表核對開這個人這天的抽屜（疑似換班要在那裡確認當日班別） */
  (e: 'openGrid', employeeId: number, date: string): void
}>()

const verdictOf = useGridVerdict()
/** 這張卡那天在班表核對的判定（頁面整月格子提供；月份不同或還沒載到＝null） */
const gridVerdict = computed(() => (props.anomaly && props.employeeId != null ? verdictOf.value(props.employeeId, props.anomaly.date) : null))

// ── 處理動作（與排班與出勤抽屜共用 useResolveAnomaly）──────────────────────────
// 成功後不在此 emit navigate：容器 refresh 後依 attendance id 停在剛處理的那筆（清單保留已處理的日卡、
// 重抓順序可能改變，不能靠索引）；navigate 只保留給 ResolveCard 的 ◀▶
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
  border-bottom: 1px solid var(--border-color-light);
}

.detail-column__grid-note { display: grid; gap: var(--space-1); margin: 0 var(--space-4); padding: var(--space-2) var(--space-3); border: 1px solid var(--el-color-warning-light-5); border-radius: var(--radius-md); background: var(--el-color-warning-light-9); font-size: var(--text-sm); }
.detail-column__grid-note p { margin: 0; color: var(--color-warning-darker); }
.detail-column__grid-note .el-button { justify-self: start; }
.detail-column__grid-verdict { margin: 0 var(--space-4); color: var(--el-text-color-secondary); font-size: var(--text-sm); }

.detail-column__empty {
  flex-direction: column;
  display: flex;
  align-items: center;
  justify-content: center;
  flex: 1;
  color: var(--text-tertiary);
  font-size: var(--text-sm);
  padding: var(--space-8);
}
</style>
