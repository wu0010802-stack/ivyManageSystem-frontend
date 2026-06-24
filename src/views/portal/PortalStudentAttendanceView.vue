<script setup lang="ts">
import { ref, watch, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'

import {
  getMyStudents,
  getMyClassAttendance,
  batchSaveClassAttendance,
  getMyClassAttendanceMonthly,
} from '@/api/portal'
import type { ApiBody } from '@/api/_generated/typed'
import { downloadFile } from '@/utils/download'
import { apiError } from '@/utils/error'
import {
  enqueueOp,
  countPending,
  listOps,
  listOtherUsersPendingOps,
  removeOp,
  OP_KINDS,
  OP_STATUS,
} from '@/utils/offlineQueue'
import { flushClassAttendanceQueue } from '@/utils/attendanceSync'
import { useOnlineStatus, isNetworkError } from '@/composables/useOnlineStatus'
import { todayISO, thisMonthISO } from '@/utils/format'
import { getUserInfo } from '@/utils/auth'

import StudentAttendanceTabs from './components/studentAttendance/StudentAttendanceTabs.vue'
import StudentRollcallTable from './components/studentAttendance/StudentRollcallTable.vue'
import StudentMonthlyStats from './components/studentAttendance/StudentMonthlyStats.vue'
import StudentOfflinePanel from './components/studentAttendance/StudentOfflinePanel.vue'

interface ClassroomEntry { classroom_id?: number; classroom_name?: string; [key: string]: unknown }
interface AttendanceRecord { student_id?: number; status?: string; remark?: string; [key: string]: unknown }

const classrooms = ref<ClassroomEntry[]>([])
const activeTab = ref('daily')
const classroomId = ref<number | null>(null)
const dailyDate = ref(todayISO())
const dailyRecords = ref<AttendanceRecord[]>([])
const dailyLoading = ref(false)
const saveLoading = ref(false)
const monthPicker = ref(thisMonthISO())
const monthlyData = ref<Record<string, unknown> | null>(null)
const monthlyLoading = ref(false)
const pendingCount = ref(0)
const reviewOps = ref<Record<string, unknown>[]>([])
const otherUserOpsCount = ref(0)
const syncing = ref(false)

const currentUserId = (): string | number | null => (getUserInfo()?.id as string | number | undefined) ?? null

const refreshPendingCount = async () => {
  const uid = currentUserId()
  if (uid == null) {
    pendingCount.value = 0
    reviewOps.value = []
    otherUserOpsCount.value = 0
    return
  }
  pendingCount.value = await countPending(OP_KINDS.CLASS_ATTENDANCE, uid)
  reviewOps.value = await listOps({
    kind: OP_KINDS.CLASS_ATTENDANCE,
    status: OP_STATUS.NEEDS_REVIEW,
    userId: uid,
  })
  const others = await listOtherUsersPendingOps(uid, OP_KINDS.CLASS_ATTENDANCE)
  otherUserOpsCount.value = others.length
}

const syncQueue = async ({ silent = false } = {}) => {
  if (syncing.value) return
  const uid = currentUserId()
  if (uid == null) return
  if (pendingCount.value === 0) {
    await refreshPendingCount()
    if (pendingCount.value === 0) return
  }
  syncing.value = true
  try {
    const result = await flushClassAttendanceQueue(
      // 佇列以 unknown payload 回呼，依後端 BatchSaveRequestPortal 契約送出。
      (payload) =>
        batchSaveClassAttendance(payload as ApiBody<'/portal/class-attendance/batch', 'post'>),
      { userId: uid },
    )
    await refreshPendingCount()
    if (result.auth_failed) {
      ElMessage.warning('登入已過期，佇列已保留，請重新登入後自動同步')
    } else if (!silent) {
      if (result.succeeded > 0) {
        ElMessage.success(`已同步 ${result.succeeded} 筆離線點名`)
      }
      if (result.needs_review > 0) {
        ElMessage.warning(`${result.needs_review} 筆需人工確認（學生可能已轉班）`)
      }
    }
  } finally {
    syncing.value = false
  }
}

const { isOnline } = useOnlineStatus(() => syncQueue({ silent: false }))

const onSyncNow = () => syncQueue({ silent: false })

const dismissReviewOp = async (id: number | string) => {
  await ElMessageBox.confirm('確定要丟棄這筆離線點名？（無法復原）', '丟棄暫存', {
    type: 'warning',
  }).catch(() => null).then(async (ok) => {
    if (!ok) return
    await removeOp(String(id))
    await refreshPendingCount()
    ElMessage.success('已丟棄')
  })
}

const fetchClassrooms = async () => {
  try {
    const res = await getMyStudents()
    classrooms.value = res.data.classrooms || []
    if (classrooms.value.length > 0) classroomId.value = classrooms.value[0].classroom_id ?? null
  } catch {
    ElMessage.error('載入班級資料失敗')
  }
}

const fetchDailyAttendance = async () => {
  if (!classroomId.value || !dailyDate.value) return
  dailyLoading.value = true
  try {
    const res = await getMyClassAttendance({
      date: dailyDate.value,
      classroom_id: classroomId.value,
    })
    // 後端缺 response_model，res.data 為 unknown，narrow 取 records。
    const records = (res.data as { records?: AttendanceRecord[] }).records ?? []
    dailyRecords.value = records.map((record) => ({
      ...record,
      status: record.status || '出席',
      remark: record.remark || '',
    }))
  } catch (error) {
    ElMessage.error(apiError(error, '載入點名資料失敗'))
  } finally {
    dailyLoading.value = false
  }
}

// onUpdateStatus：mutate 本機狀態，儲存由「儲存點名」按鈕觸發（批次）
const onUpdateStatus = ({ student_id, status, remark }: { student_id: number | undefined; status: string; remark: string }) => {
  const record = dailyRecords.value.find((r) => r.student_id === student_id)
  if (record) {
    record.status = status
    record.remark = remark
  }
}

const onQuickSetAll = (status: string) => {
  dailyRecords.value.forEach((record) => {
    record.status = status
  })
}

const saveDailyAttendance = async () => {
  if (!classroomId.value || dailyRecords.value.length === 0) return
  const payload = {
    date: dailyDate.value,
    classroom_id: classroomId.value,
    entries: dailyRecords.value.map((record) => ({
      student_id: record.student_id,
      status: record.status,
      remark: record.remark || null,
    })),
  }

  const uid = currentUserId()
  if (uid == null) { ElMessage.error('無法取得使用者身分，請重新登入'); return }
  const classroomName = classrooms.value.find((c) => c.classroom_id === classroomId.value)?.classroom_name || ''
  const meta = { date: dailyDate.value, classroom_name: classroomName, count: payload.entries.length }

  saveLoading.value = true
  try {
    // 離線：直接進佇列，不嘗試網路請求
    if (!isOnline.value) {
      await enqueueOp({ kind: OP_KINDS.CLASS_ATTENDANCE, payload, userId: uid, meta })
      await refreshPendingCount()
      ElMessage.success(`離線中，已暫存 ${payload.entries.length} 筆，連線後自動同步`)
      return
    }
    // entries 來自伺服器點名清單，student_id/status 必有值；依後端契約送出。
    await batchSaveClassAttendance(payload as ApiBody<'/portal/class-attendance/batch', 'post'>)
    ElMessage.success('點名儲存成功')
    if (pendingCount.value > 0) syncQueue({ silent: true })
  } catch (error) {
    // navigator.onLine 可能說謊：實際網路失敗也要 fallback 到佇列
    if (isNetworkError(error)) {
      await enqueueOp({ kind: OP_KINDS.CLASS_ATTENDANCE, payload, userId: uid, meta })
      await refreshPendingCount()
      ElMessage.warning(`網路異常，已暫存 ${payload.entries.length} 筆，稍後自動重送`)
      return
    }
    ElMessage.error(apiError(error, '儲存失敗'))
  } finally {
    saveLoading.value = false
  }
}

const fetchMonthly = async () => {
  if (!classroomId.value || !monthPicker.value) return
  const [year, month] = monthPicker.value.split('-')
  monthlyLoading.value = true
  try {
    const res = await getMyClassAttendanceMonthly({
      classroom_id: classroomId.value,
      year: Number(year),
      month: Number(month),
    })
    // 後端缺 response_model，res.data 為 unknown，narrow 成月度物件。
    monthlyData.value = res.data as Record<string, unknown> | null
  } catch (error) {
    ElMessage.error(apiError(error, '載入月統計失敗'))
  } finally {
    monthlyLoading.value = false
  }
}

const exportMonthly = () => {
  if (!classroomId.value || !monthPicker.value) return
  const [year, month] = monthPicker.value.split('-')
  downloadFile(
    `/portal/my-class-attendance/export?classroom_id=${classroomId.value}&year=${year}&month=${month}`,
    `${year}年${month}月_出席月報.xlsx`,
  )
}

watch([classroomId, dailyDate], () => {
  if (activeTab.value === 'daily') fetchDailyAttendance()
})

watch([classroomId, monthPicker], () => {
  if (activeTab.value === 'monthly') fetchMonthly()
})

watch(activeTab, (tab) => {
  if (tab === 'daily') fetchDailyAttendance()
  if (tab === 'monthly') fetchMonthly()
})

onMounted(async () => {
  await refreshPendingCount()
  // 進頁時若已連線且有佇列，立即靜默同步
  if (isOnline.value && pendingCount.value > 0) {
    syncQueue({ silent: false })
  }
  await fetchClassrooms()
  fetchDailyAttendance()
})
</script>

<template>
  <div>
    <div class="page-header">
      <h3>學生點名</h3>
    </div>

    <StudentOfflinePanel
      :is-online="isOnline"
      :pending-count="pendingCount"
      :syncing="syncing"
      @sync-now="onSyncNow"
    />

    <el-alert
      v-if="otherUserOpsCount > 0"
      type="warning"
      :closable="false"
      style="margin-bottom: 12px"
      show-icon
    >
      <template #title>
        偵測到其他使用者在此裝置留下 {{ otherUserOpsCount }} 筆未同步點名，請該老師登入處理（本帳號的同步不受影響）
      </template>
    </el-alert>

    <el-alert
      v-if="reviewOps.length > 0"
      type="error"
      :closable="false"
      style="margin-bottom: 12px"
    >
      <template #title>有 {{ reviewOps.length }} 筆離線點名無法自動同步，請人工處理：</template>
      <ul class="review-list">
        <li v-for="op in reviewOps" :key="op.id as number">
          {{ (op.meta as Record<string, unknown>)?.date }} · {{ (op.meta as Record<string, unknown>)?.classroom_name || '未知班級' }} · {{ (op.meta as Record<string, unknown>)?.count }} 筆
          ｜原因：{{ op.last_error || '未知' }}
          <el-button link type="danger" size="small" @click="dismissReviewOp(op.id as number)">丟棄</el-button>
        </li>
      </ul>
    </el-alert>

    <StudentAttendanceTabs
      v-model:active-tab="activeTab"
      v-model:classroom-id="classroomId"
      :classrooms="classrooms"
    >
      <template #daily>
        <div class="daily-filters">
          <div class="filter-label">日期</div>
          <el-date-picker
            v-model="dailyDate"
            type="date"
            placeholder="選擇日期"
            value-format="YYYY-MM-DD"
            style="width: 200px"
          />
        </div>

        <StudentRollcallTable
          :students="dailyRecords"
          :loading="dailyLoading"
          @update-status="onUpdateStatus"
          @quick-set-all="onQuickSetAll"
        />

        <div v-if="dailyRecords.length > 0" class="save-row">
          <el-button type="primary" :loading="saveLoading" @click="saveDailyAttendance">
            儲存點名（{{ dailyRecords.length }} 人）
          </el-button>
        </div>
      </template>

      <template #monthly>
        <StudentMonthlyStats
          v-model:month-picker="monthPicker"
          :data="monthlyData ?? undefined"
          :loading="monthlyLoading"
          @export-csv="exportMonthly"
        />
      </template>
    </StudentAttendanceTabs>
  </div>
</template>

<style scoped>
.page-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
}

.page-header h3 {
  margin: 0;
  font-size: 1.2rem;
  font-weight: 600;
}

.review-list {
  margin: 6px 0 0 0;
  padding-left: 18px;
  font-size: 13px;
  line-height: 1.7;
}

.filter-label {
  font-size: 12px;
  color: var(--text-tertiary);
}

.daily-filters {
  display: flex;
  gap: 8px;
  align-items: center;
  flex-wrap: wrap;
  margin-bottom: 12px;
}

.save-row {
  margin-top: 16px;
  text-align: right;
}
</style>
