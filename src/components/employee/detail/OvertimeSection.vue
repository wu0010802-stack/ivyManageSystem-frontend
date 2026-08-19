<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import { friendlyError } from '@/utils/errorMessages'
import { getOvertimes, type OvertimeListItem } from '@/api/overtimes'
import { thisMonthISO, money } from '@/utils/format'
import { useIsMobile } from '@/composables/useIsMobile'
import AdminListCards from '@/components/common/AdminListCards.vue'
import type { ElTagType } from '@/utils/employeeDisplay'

const props = defineProps<{ employee: Record<string, unknown> }>()

// 唯讀區塊：編輯／審核一律走加班管理頁（/overtimes），此處不放任何寫入操作
const { isMobile } = useIsMobile()

const overtimeRecords = ref<OvertimeListItem[]>([])
const overtimeMonth = ref(thisMonthISO()) // YYYY-MM

const fetchOvertimes = async () => {
  if (!props.employee.id || !overtimeMonth.value) return
  const [year, month] = overtimeMonth.value.split('-')
  try {
    // getOvertimes 回 PagedResult（取 .items），與出勤的裸陣列 .data 契約不同
    const result = await getOvertimes({
      employee_id: props.employee.id as number,
      year: parseInt(year),
      month: parseInt(month)
    })
    overtimeRecords.value = result.items
  } catch (error) {
    ElMessage.error(friendlyError('載入加班紀錄失敗', error))
  }
}

const OVERTIME_STATUS_LABELS: Record<string, string> = {
  pending: '待審核',
  approved: '已核准',
  rejected: '已駁回',
}
const overtimeStatusLabel = (status: string): string => OVERTIME_STATUS_LABELS[status] ?? status
const overtimeStatusType = (status: string): ElTagType => {
  if (status === 'approved') return 'success'
  if (status === 'rejected') return 'danger'
  return 'warning'
}

const timeRange = (row: Record<string, unknown>): string =>
  row.start_time && row.end_time ? `${row.start_time}–${row.end_time}` : '—'

// 合計只計已核准：待審核／已駁回不會發錢，混入合計會誤導
const approvedSummary = computed(() => {
  if (!overtimeRecords.value.length) return null
  const approved = overtimeRecords.value.filter((r) => r.status === 'approved')
  const hours = approved.reduce((sum, r) => sum + (r.hours ?? 0), 0)
  const pay = approved.reduce((sum, r) => sum + (r.overtime_pay ?? 0), 0)
  return { hours: Math.round(hours * 100) / 100, pay }
})

const cardItems = computed(() => overtimeRecords.value as unknown as Record<string, unknown>[])
const overtimeCardColumns = [
  { label: '類型', prop: 'overtime_type_label' },
  { label: '時段', prop: 'time_range', formatter: (item: Record<string, unknown>) => timeRange(item) },
  { label: '時數', prop: 'hours', formatter: (item: Record<string, unknown>) => (item.hours as number | null) ?? '—' },
  { label: '加班費', prop: 'overtime_pay', formatter: (item: Record<string, unknown>) => money(item.overtime_pay) },
  { label: '狀態', prop: 'status' },
]

onMounted(fetchOvertimes)
</script>

<template>
  <div>
    <div class="overtime-filter">
      <el-date-picker
        v-model="overtimeMonth"
        type="month"
        placeholder="選擇月份"
        format="YYYY-MM"
        value-format="YYYY-MM"
        @change="fetchOvertimes"
      />
    </div>
    <el-table v-if="!isMobile" :data="overtimeRecords" height="400" style="width: 100%; margin-top: 10px;">
      <el-table-column prop="overtime_date" label="日期" width="110" />
      <el-table-column prop="overtime_type_label" label="類型" width="110" />
      <el-table-column label="時段" width="120">
        <template #default="scope">{{ timeRange(scope.row) }}</template>
      </el-table-column>
      <el-table-column prop="hours" label="時數" width="70" />
      <el-table-column label="加班費" width="100">
        <template #default="scope">{{ money(scope.row.overtime_pay) }}</template>
      </el-table-column>
      <el-table-column label="補休" width="70">
        <template #default="scope">{{ scope.row.use_comp_leave ? '是' : '—' }}</template>
      </el-table-column>
      <el-table-column label="狀態" width="90">
        <template #default="scope">
          <el-tag :type="overtimeStatusType(String(scope.row.status))" size="small">{{ overtimeStatusLabel(String(scope.row.status)) }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column prop="reason" label="事由" show-overflow-tooltip />
    </el-table>
    <AdminListCards
      v-else
      :items="cardItems"
      :columns="overtimeCardColumns"
      row-key="id"
      empty-text="本月尚無加班紀錄"
    >
      <template #title="{ item }">{{ item.overtime_date }}</template>
      <template #cell-status="{ item }">
        <el-tag :type="overtimeStatusType(String(item.status))" size="small">{{ overtimeStatusLabel(String(item.status)) }}</el-tag>
      </template>
    </AdminListCards>
    <div v-if="approvedSummary" class="overtime-summary">
      本月已核准合計：{{ approvedSummary.hours }} 小時・{{ money(approvedSummary.pay) }}
    </div>
  </div>
</template>

<style scoped>
.overtime-summary {
  margin-top: 10px;
  font-size: 13px;
  color: var(--el-text-color-secondary);
  text-align: right;
}
</style>
