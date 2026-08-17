<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { friendlyError } from '@/utils/errorMessages'
import { getRecords as getAttendanceRecords, uploadCsv, deleteEmployeeDateRecord } from '@/api/attendance'
import { summarizeCsvImportResult } from '@/utils/attendanceImport'
import { thisMonthISO } from '@/utils/format'
import { hasPermission } from '@/utils/auth'
import { useIsMobile } from '@/composables/useIsMobile'
import AdminListCards from '@/components/common/AdminListCards.vue'
import type { ElTagType } from '@/utils/employeeDisplay'

const props = defineProps<{ employee: Record<string, unknown> }>()

// 出勤編輯/刪除後端守 ATTENDANCE_WRITE：無權限者隱藏操作欄（避免點下才被 API 拒絕）
const canWrite = computed(() => hasPermission('ATTENDANCE_WRITE'))

// 手機改卡片列表（桌機續用 el-table）：狀態 tag 由 cell slot 覆寫
const { isMobile } = useIsMobile()
const attendanceCardColumns = [
  { label: '星期', prop: 'weekday' },
  { label: '上班', prop: 'punch_in' },
  { label: '下班', prop: 'punch_out' },
  { label: '狀態', prop: 'status' },
]

const attendanceRecords = ref<Record<string, unknown>[]>([])
const attendanceMonth = ref(thisMonthISO()) // YYYY-MM

const fetchAttendance = async () => {
  if (!props.employee.id || !attendanceMonth.value) return
  const [year, month] = attendanceMonth.value.split('-')
  try {
    const response = await getAttendanceRecords({
      employee_id: props.employee.id as number,
      year: parseInt(year),
      month: parseInt(month)
    })
    attendanceRecords.value = response.data as Record<string, unknown>[]
  } catch (error) {
    ElMessage.error(friendlyError('載入出勤紀錄失敗', error))
  }
}

const getAttendanceStatusType = (status: string): ElTagType => {
  if (status === 'normal') return 'success'
  if (status.includes('late') || status.includes('early')) return 'warning'
  return 'danger'
}

// #10 出勤狀態中文化：後端 status 值域 normal/late/early_leave/late+early_leave（見
// api/attendance/_shared.py），原直接渲染英文 raw 讓一般使用者看不懂。單一來源對照表，
// 桌機表格與手機卡片兩渲染點共用；未知值 fallback 顯示原字串（不吞資料）。
const ATTENDANCE_STATUS_LABELS: Record<string, string> = {
  normal: '正常',
  late: '遲到',
  early_leave: '早退',
  'late+early_leave': '遲到+早退',
}
const attendanceStatusLabel = (status: string): string => ATTENDANCE_STATUS_LABELS[status] ?? status

const editAttendance = (row: Record<string, unknown>) => {
  ElMessageBox.prompt('請輸入新的上/下班時間 (格式: HH:MM,HH:MM)', '編輯出勤', {
    confirmButtonText: '確定',
    cancelButtonText: '取消',
    inputValue: `${row.punch_in || ''},${row.punch_out || ''}`,
    inputPattern: /^([0-1]?[0-9]|2[0-3]):[0-5][0-9],([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/,
    inputErrorMessage: '時間格式不正確'
  }).then(async (result) => {
     const value = (result as unknown as { value: string }).value
     const [inTime, outTime] = value.split(',')
     // Call API to save (using existing upload-csv endpoint logic w/ wrapper or new endpoint if we made one?)
     // Reusing the logic from app.js: wrap in upload payload
     const payload = {
        year: parseInt(attendanceMonth.value.split('-')[0]),
        month: parseInt(attendanceMonth.value.split('-')[1]),
        records: [{
           department: "Manual",
           employee_number: String(props.employee.employee_id ?? ''),
           name: String(props.employee.name ?? ''),
           date: (row.date as string).replace(/-/g, '/'),
           weekday: "",
           punch_in: inTime,
           punch_out: outTime
        }]
     }
     try {
        const res = await uploadCsv(payload)
        // upload-csv 對逐列失敗回 200（失敗原因在 body results），
        // 不可只看 HTTP 狀態就報「出勤已更新」（資料實際沒寫入）
        const summary = summarizeCsvImportResult(res.data)
        if (summary.ok) {
           ElMessage.success('出勤已更新')
        } else {
           ElMessage.warning(summary.text)
        }
        fetchAttendance()
     } catch (err) {
        ElMessage.error(friendlyError('更新出勤紀錄失敗', err))
     }
  }).catch(() => {})
}

const deleteAttendance = (row: Record<string, unknown>) => {
   ElMessageBox.confirm(`確定要刪除 ${row.date} 的出勤紀錄嗎？`, '警告', {
      type: 'warning'
   }).then(async () => {
      try {
         await deleteEmployeeDateRecord(props.employee.id as number, row.date as string)
         ElMessage.success('已刪除')
         fetchAttendance()
      } catch (err) {
         ElMessage.error(friendlyError('刪除出勤紀錄失敗', err))
      }
   })
}

onMounted(fetchAttendance)
</script>

<template>
  <div>
    <div class="attendance-filter">
      <el-date-picker
        v-model="attendanceMonth"
        type="month"
        placeholder="選擇月份"
        format="YYYY-MM"
        value-format="YYYY-MM"
        @change="fetchAttendance"
      />
    </div>
    <el-table v-if="!isMobile" :data="attendanceRecords" height="400" style="width: 100%; margin-top: 10px;">
      <el-table-column prop="date" label="日期" width="120" />
      <el-table-column prop="weekday" label="星期" width="80" />
      <el-table-column prop="punch_in" label="上班" />
      <el-table-column prop="punch_out" label="下班" />
      <el-table-column prop="status" label="狀態">
        <template #default="scope">
          <el-tag :type="getAttendanceStatusType(scope.row.status)">{{ attendanceStatusLabel(String(scope.row.status)) }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column v-if="canWrite" label="操作" width="150">
         <template #default="scope">
            <el-button link type="primary" @click="editAttendance(scope.row)">編輯</el-button>
            <el-button link type="danger" @click="deleteAttendance(scope.row)">刪除</el-button>
         </template>
      </el-table-column>
    </el-table>
    <AdminListCards
      v-else
      :items="attendanceRecords"
      :columns="attendanceCardColumns"
      row-key="date"
      empty-text="本月尚無出勤紀錄"
    >
      <template #title="{ item }">{{ item.date }}</template>
      <template #cell-status="{ item }">
        <el-tag :type="getAttendanceStatusType(String(item.status))">{{ attendanceStatusLabel(String(item.status)) }}</el-tag>
      </template>
      <template v-if="canWrite" #actions="{ item }">
        <el-button link type="primary" @click="editAttendance(item)">編輯</el-button>
        <el-button link type="danger" @click="deleteAttendance(item)">刪除</el-button>
      </template>
    </AdminListCards>
  </div>
</template>
