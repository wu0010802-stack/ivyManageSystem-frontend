<template>
  <div v-if="employeeId === null" class="emp-month-panel__no-employee">
    請選擇員工
  </div>
  <div v-else v-loading="loading" class="emp-month-panel">
    <template v-if="!loading && records.length === 0">
      <EmptyState title="本月無考勤記錄" />
    </template>
    <template v-else>
      <div
        v-for="(rec, idx) in records"
        :key="rec.id"
        class="month-record-row"
        :class="{ 'month-record-row--anomaly': isAnomaly(rec) }"
      >
        <span class="month-record-row__date">{{ rec.date }}</span>
        <span class="month-record-row__weekday">{{ rec.weekday }}</span>
        <span class="month-record-row__punch-in">
          <template v-if="rec.punch_in">{{ rec.punch_in }}</template>
          <el-time-picker
            v-else
            v-model="editPunchIn[idx]"
            format="HH:mm"
            value-format="HH:mm"
            placeholder="補上班"
            class="month-record-row__picker"
          />
        </span>
        <span class="month-record-row__punch-out">
          <template v-if="rec.punch_out">{{ rec.punch_out }}</template>
          <el-time-picker
            v-else
            v-model="editPunchOut[idx]"
            format="HH:mm"
            value-format="HH:mm"
            placeholder="補下班"
            class="month-record-row__picker"
          />
        </span>
        <span class="month-record-row__status">{{ rec.status }}</span>
        <el-button
          v-if="isAnomaly(rec)"
          size="small"
          :loading="saving[idx]"
          @click="handleUpsert(rec, idx)"
        >補打卡</el-button>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { getRecords, upsertRecord } from '@/api/attendance'
import { useErrorNotify } from '@/composables/useErrorNotify'
import EmptyState from '@/components/common/EmptyState.vue'

// ── props & emits ──────────────────────────────────────────────────────────────
const props = defineProps<{
  employeeId: number | null
  year: number
  month: number
}>()

const emit = defineEmits<{
  (e: 'updated'): void
}>()

// ── error notify ───────────────────────────────────────────────────────────────
const { notify } = useErrorNotify()

// ── state ──────────────────────────────────────────────────────────────────────
interface AttendanceRecord {
  id: number
  employee_id: number
  employee_name: string
  employee_number: string
  date: string
  weekday: string
  punch_in: string | null
  punch_out: string | null
  status: string
  is_late: boolean
  is_early_leave: boolean
  is_missing_punch_in: boolean
  is_missing_punch_out: boolean
  late_minutes: number
  early_leave_minutes: number
  remark: string
}

const records = ref<AttendanceRecord[]>([])
const loading = ref(false)
const editPunchIn = ref<(string | null)[]>([])
const editPunchOut = ref<(string | null)[]>([])
const saving = ref<boolean[]>([])

// ── helpers ────────────────────────────────────────────────────────────────────
function isAnomaly(rec: AttendanceRecord): boolean {
  return rec.is_late || rec.is_early_leave || rec.is_missing_punch_in || rec.is_missing_punch_out
}

// ── load ───────────────────────────────────────────────────────────────────────
async function load(): Promise<void> {
  if (props.employeeId === null) return
  loading.value = true
  try {
    const res = await getRecords({ employee_id: props.employeeId, year: props.year, month: props.month })
    // OpenAPI 契約列 → 本地 view model（nullable 欄位正規化為預設值）
    const list: AttendanceRecord[] = (res.data ?? []).map((r) => ({
      id: r.id,
      employee_id: r.employee_id,
      employee_name: r.employee_name,
      employee_number: r.employee_number,
      date: r.date,
      weekday: r.weekday ?? '',
      punch_in: r.punch_in ?? null,
      punch_out: r.punch_out ?? null,
      status: r.status ?? '',
      is_late: r.is_late ?? false,
      is_early_leave: r.is_early_leave ?? false,
      is_missing_punch_in: r.is_missing_punch_in ?? false,
      is_missing_punch_out: r.is_missing_punch_out ?? false,
      late_minutes: r.late_minutes ?? 0,
      early_leave_minutes: r.early_leave_minutes ?? 0,
      remark: r.remark ?? '',
    }))
    records.value = list
    editPunchIn.value = list.map((r) => r.punch_in)
    editPunchOut.value = list.map((r) => r.punch_out)
    saving.value = list.map(() => false)
  } catch (err) {
    notify(err, 'EmployeeMonthPanel.load', null, { prefix: '載入失敗' })
  } finally {
    loading.value = false
  }
}

watch(
  [() => props.employeeId, () => props.year, () => props.month],
  load,
  { immediate: true },
)

// ── upsert ─────────────────────────────────────────────────────────────────────
async function handleUpsert(rec: AttendanceRecord, idx: number): Promise<void> {
  saving.value[idx] = true
  try {
    const payload: { employee_id: number; date: string; punch_in?: string; punch_out?: string } = {
      employee_id: props.employeeId!,
      date: rec.date,
    }
    const pi = editPunchIn.value[idx] ?? rec.punch_in
    const po = editPunchOut.value[idx] ?? rec.punch_out
    if (pi !== null) payload.punch_in = pi
    if (po !== null) payload.punch_out = po
    await upsertRecord(payload)
    ElMessage.success('補打卡成功')
    emit('updated')
    await load()
  } catch (err) {
    notify(err, 'EmployeeMonthPanel.upsert', null, { prefix: '補打卡失敗' })
  } finally {
    saving.value[idx] = false
  }
}
</script>

<style scoped>
.emp-month-panel {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  padding: var(--space-3);
}

.emp-month-panel__no-employee {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: var(--space-8);
  color: var(--text-tertiary, #94a3b8);
  font-size: var(--text-sm, 0.875rem);
}

.month-record-row {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  padding: var(--space-2) var(--space-3);
  border-radius: var(--radius-sm, 4px);
  font-size: var(--text-sm, 0.875rem);
  border: 1px solid var(--border-color-light, #f1f5f9);
  background: var(--fill-color-blank, #fff);
}

.month-record-row--anomaly {
  background: var(--danger-soft, #fef2f2);
  border-color: var(--danger-border, #fecaca);
  color: var(--danger, #ef4444);
}

.month-record-row__date {
  width: 90px;
  flex-shrink: 0;
  font-variant-numeric: tabular-nums;
}

.month-record-row__weekday {
  width: 24px;
  flex-shrink: 0;
  text-align: center;
  color: var(--text-secondary, #475569);
}

.month-record-row__punch-in,
.month-record-row__punch-out {
  width: 80px;
  flex-shrink: 0;
  font-variant-numeric: tabular-nums;
}

.month-record-row__status {
  flex: 1;
  color: var(--text-secondary, #475569);
}

.month-record-row__picker {
  width: 80px;
}
</style>
