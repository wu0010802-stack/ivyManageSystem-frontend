<script setup lang="ts">
/**
 * 到園點名（2026-09-14 UI/UX 審查改版）。
 *
 * 改版前這頁把後端回的 `status=null` 在載入時預選成「出席」，用一個看不見的
 * `pendingStudentIds` 集合記住「其實還沒點」。畫面上 27 列全部亮著同一種藍，
 * 老師分不出誰還沒點；什麼都不碰按儲存就送出全班 27 筆、全部記成出席，該發的
 * 缺席通知不會發，而首頁徽章仍顯示「到園點名 27」。
 *
 * 現在未點名是真實狀態（`status` 為空），畫面直接照著畫，儲存**只送已點的**
 * （業主裁定 B，與才藝課程點名一致）：未點名的列不寫任何紀錄，後端
 * `count_attendance_pending` 因此持續把它算成待辦，兩處口徑一致。
 * 那個隱藏集合連同它的 baseline 一起消失，狀態少一份就少一種矛盾。
 */
import { computed, ref, watch, onMounted } from 'vue'
import { onBeforeRouteLeave, useRoute } from 'vue-router'
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
import { pickClassroomIdFromQuery } from '@/utils/portalQuery'
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
import { useUnsavedChangesGuard } from '@/composables/useUnsavedChangesGuard'
import {
  summarizeRollcall,
  filterRollcall,
  buildSaveEntries,
  formatLastRecorded,
  isUnmarked,
  type RollcallFilter,
  type RollcallRecord,
} from '@/utils/studentRollcall'

import StudentAttendanceTabs from './components/studentAttendance/StudentAttendanceTabs.vue'
import StudentRollcallTable from './components/studentAttendance/StudentRollcallTable.vue'
import StudentRollcallFilterBar from './components/studentAttendance/StudentRollcallFilterBar.vue'
import StudentMonthlyStats from './components/studentAttendance/StudentMonthlyStats.vue'
import StudentOfflinePanel from './components/studentAttendance/StudentOfflinePanel.vue'
import PortalPageHeader from '@/components/portal/PortalPageHeader.vue'

interface ClassroomEntry { classroom_id?: number; classroom_name?: string; [key: string]: unknown }
type AttendanceRecord = RollcallRecord

const route = useRoute()
const classrooms = ref<ClassroomEntry[]>([])
const activeTab = ref('daily')
const classroomId = ref<number | null>(null)
const dailyDate = ref(todayISO())
const dailyRecords = ref<AttendanceRecord[]>([])
const dailyLoading = ref(false)
const saveLoading = ref(false)
const lastRecordedAt = ref<string | null>(null)
const lastRecordedBy = ref<string | null>(null)
const monthPicker = ref(thisMonthISO())
const monthlyData = ref<Record<string, unknown> | null>(null)
const monthlyLoading = ref(false)
const pendingCount = ref(0)
const reviewOps = ref<Record<string, unknown>[]>([])
const otherUserOpsCount = ref(0)
const syncing = ref(false)

const activeFilter = ref<RollcallFilter | 'all'>('all')
const search = ref('')

const baseline = ref(new Map<number | undefined, string>())
const switching = ref(false)
const bulkUndo = ref<AttendanceRecord[] | null>(null)
const recordValue = (record: AttendanceRecord) =>
  JSON.stringify([record.status || '', record.remark || ''])
const unsavedCount = computed(() => dailyRecords.value.filter(
  (record) => baseline.value.get(record.student_id) !== recordValue(record),
).length)
const editingBlocked = computed(() => dailyLoading.value || saveLoading.value || switching.value)

/** 統計一律以**全班**為準：篩選中也要看得到全班還剩幾人沒點。 */
const summary = computed(() => summarizeRollcall(dailyRecords.value))
const unmarkedCount = computed(() => summary.value.unmarked)

const visibleRecords = computed(() => {
  const byStatus = filterRollcall(dailyRecords.value, activeFilter.value as RollcallFilter)
  const keyword = search.value.trim()
  if (!keyword) return byStatus
  return byStatus.filter((record) => (record.name ?? '').includes(keyword))
})

const isFiltering = computed(() => activeFilter.value !== 'all' || search.value.trim() !== '')
const emptyHint = computed(() =>
  isFiltering.value ? '沒有符合目前篩選的學生' : '尚無學生',
)

const currentClassroomName = computed(
  () => classrooms.value.find((c) => c.classroom_id === classroomId.value)?.classroom_name || '',
)

/** 頁首副標：班級・人數・上次儲存。上次儲存還沒有時整段不出現（不畫空殼）。 */
const headerSubtitle = computed(() => {
  const parts: string[] = []
  if (currentClassroomName.value) parts.push(String(currentClassroomName.value))
  if (dailyRecords.value.length) parts.push(`${dailyRecords.value.length} 人`)
  const last = formatLastRecorded(lastRecordedAt.value, lastRecordedBy.value)
  if (last) parts.push(last)
  return parts.join('・')
})

/** 儲存列的狀態句：未點名優先，其次未儲存筆數，都沒有才是「已全部點完」。 */
const saveStatusText = computed(() => {
  if (saveLoading.value) return '儲存中，請稍候'
  if (unmarkedCount.value > 0) return `還有 ${unmarkedCount.value} 位未點名`
  if (unsavedCount.value > 0) return `有 ${unsavedCount.value} 筆未儲存`
  return '今天已全部點完'
})

function acceptSnapshot() {
  baseline.value = new Map(dailyRecords.value.map(record => [record.student_id, recordValue(record)]))
  bulkUndo.value = null
}

// 儲存期間禁止導覽；尚未送出的修改沿用全站離頁／關閉分頁提醒。
onBeforeRouteLeave(() => !saveLoading.value && !switching.value)
const { confirmDiscard } = useUnsavedChangesGuard(() => unsavedCount.value > 0 || saveLoading.value)

function resetView() {
  // 換班／換日的新名冊如果沿用舊篩選，很可能一進去就是空的（老師會以為壞掉）。
  activeFilter.value = 'all'
  search.value = ''
}

async function switchContext(change: () => void) {
  if (saveLoading.value || switching.value) return
  switching.value = true
  try {
    if (!(await confirmDiscard())) return
    // 已確認捨棄，切換後由原本的 request-sequence guard 載入正確名冊。
    ++dailyRequestSeq
    dailyLoading.value = false
    dailyRecords.value = []
    resetView()
    acceptSnapshot()
    change()
  } finally {
    switching.value = false
  }
}
function changeClassroom(value: number | null) {
  if (value && value !== classroomId.value) return switchContext(() => { classroomId.value = value })
}
function changeDate(value: string | null) {
  if (value && value !== dailyDate.value) return switchContext(() => { dailyDate.value = value })
}
function changeTab(value: string) {
  if (value !== activeTab.value) return switchContext(() => { activeTab.value = value })
}

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
    // 首頁班級卡會帶 ?classroom_id=；先前無條件覆寫成第一班，多班老師因此會點錯班的名
    if (classrooms.value.length > 0 && !classroomId.value) {
      classroomId.value = pickClassroomIdFromQuery(
        route.query,
        classrooms.value,
        classrooms.value[0].classroom_id ?? null,
      )
    }
  } catch {
    ElMessage.error('載入班級資料失敗')
  }
}

// request-sequence guard：快速切班/切日時，較舊的慢回應不得覆寫最新名冊
let dailyRequestSeq = 0

const fetchDailyAttendance = async () => {
  if (!classroomId.value || !dailyDate.value) return
  const seq = ++dailyRequestSeq
  dailyLoading.value = true
  dailyRecords.value = []
  bulkUndo.value = null
  try {
    const res = await getMyClassAttendance({
      date: dailyDate.value,
      classroom_id: classroomId.value,
    })
    if (seq !== dailyRequestSeq) return
    const body = res.data as {
      records?: AttendanceRecord[]
      last_recorded_at?: string | null
      last_recorded_by?: string | null
    }
    // status 原樣保留：null／空字串＝未點名，畫面直接照著畫。
    dailyRecords.value = (body.records ?? []).map((record) => ({
      ...record,
      status: record.status ?? null,
      remark: record.remark ?? '',
    }))
    lastRecordedAt.value = body.last_recorded_at ?? null
    lastRecordedBy.value = body.last_recorded_by ?? null
    acceptSnapshot()
  } catch (error) {
    if (seq !== dailyRequestSeq) return
    ElMessage.error(apiError(error, '載入點名資料失敗'))
  } finally {
    if (seq === dailyRequestSeq) dailyLoading.value = false
  }
}

// onUpdateStatus：mutate 本機狀態，儲存由「儲存點名」按鈕觸發（批次）
const onUpdateStatus = ({ student_id, status, remark }: { student_id: number | undefined; status: string; remark: string }) => {
  if (editingBlocked.value) return
  const record = dailyRecords.value.find((r) => r.student_id === student_id)
  if (record) {
    record.status = status
    record.remark = remark
    bulkUndo.value = null
  }
}

const onQuickSetAll = (status: string) => {
  if (editingBlocked.value || unmarkedCount.value === 0) return
  bulkUndo.value = dailyRecords.value.map(record => ({ ...record }))
  dailyRecords.value.forEach((record) => {
    if (isUnmarked(record)) record.status = status
  })
}

function undoBulk() {
  if (editingBlocked.value || !bulkUndo.value) return
  dailyRecords.value = bulkUndo.value
  bulkUndo.value = null
}

const saveDailyAttendance = async () => {
  if (editingBlocked.value || !classroomId.value || dailyRecords.value.length === 0) return

  // 只送已點名的：未點名的列不寫任何紀錄，維持未點名（業主裁定 B）。
  const entries = buildSaveEntries(dailyRecords.value)
  if (entries.length === 0) {
    ElMessage.info('還沒有點任何一位學生')
    return
  }
  const payload = { date: dailyDate.value, classroom_id: classroomId.value, entries }

  const uid = currentUserId()
  if (uid == null) { ElMessage.error('無法取得使用者身分，請重新登入'); return }
  const meta = {
    date: dailyDate.value,
    classroom_name: currentClassroomName.value,
    count: entries.length,
  }

  saveLoading.value = true
  try {
    // 離線：直接進佇列，不嘗試網路請求
    if (!isOnline.value) {
      await enqueueOp({ kind: OP_KINDS.CLASS_ATTENDANCE, payload, userId: uid, meta })
      acceptSnapshot()
      await refreshPendingCount()
      ElMessage.success(`離線中，已暫存 ${entries.length} 筆，連線後自動同步`)
      return
    }
    // entries 來自伺服器點名清單，student_id/status 必有值；依後端契約送出。
    await batchSaveClassAttendance(payload as ApiBody<'/portal/class-attendance/batch', 'post'>)
    acceptSnapshot()
    ElMessage.success(
      unmarkedCount.value > 0
        ? `已儲存 ${entries.length} 筆，還有 ${unmarkedCount.value} 位未點名`
        : '點名儲存成功',
    )
    if (pendingCount.value > 0) syncQueue({ silent: true })
  } catch (error) {
    // navigator.onLine 可能說謊：實際網路失敗也要 fallback 到佇列
    if (isNetworkError(error)) {
      try {
        await enqueueOp({ kind: OP_KINDS.CLASS_ATTENDANCE, payload, userId: uid, meta })
      } catch {
        ElMessage.error('無法暫存點名，請保留此頁並重新儲存')
        return
      }
      acceptSnapshot()
      await refreshPendingCount()
      ElMessage.warning(`網路異常，已暫存 ${entries.length} 筆，稍後自動重送`)
      return
    }
    ElMessage.error(apiError(error, '儲存失敗'))
  } finally {
    saveLoading.value = false
  }
}

// request-sequence guard：快速切班/切月時，較舊的慢回應不得覆寫最新月度統計
let monthlyRequestSeq = 0

const fetchMonthly = async () => {
  if (!classroomId.value || !monthPicker.value) return
  const [year, month] = monthPicker.value.split('-')
  const seq = ++monthlyRequestSeq
  monthlyLoading.value = true
  try {
    const res = await getMyClassAttendanceMonthly({
      classroom_id: classroomId.value,
      year: Number(year),
      month: Number(month),
    })
    if (seq !== monthlyRequestSeq) return
    monthlyData.value = res.data as Record<string, unknown> | null
  } catch (error) {
    if (seq !== monthlyRequestSeq) return
    ElMessage.error(apiError(error, '載入月統計失敗'))
  } finally {
    if (seq === monthlyRequestSeq) monthlyLoading.value = false
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
})
</script>

<template>
  <div>
    <PortalPageHeader title="學生點名" :subtitle="headerSubtitle" />

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
      :active-tab="activeTab"
      :classroom-id="classroomId"
      :disabled="saveLoading || switching"
      @update:active-tab="changeTab"
      @update:classroom-id="changeClassroom"
      :classrooms="classrooms"
    >
      <template #daily>
        <div class="daily-filters">
          <div class="filter-label">日期</div>
          <el-date-picker
            :model-value="dailyDate"
            :clearable="false"
            :disabled="saveLoading || switching"
            @update:model-value="changeDate"
            type="date"
            placeholder="選擇日期"
            value-format="YYYY-MM-DD"
            style="width: 200px"
          />
        </div>

        <StudentRollcallFilterBar
          v-if="dailyRecords.length > 0"
          class="rollcall-filters"
          :summary="summary"
          :model-value="activeFilter"
          :search="search"
          :disabled="editingBlocked"
          @update:model-value="activeFilter = $event"
          @update:search="search = $event"
        />

        <StudentRollcallTable
          :students="visibleRecords"
          :loading="dailyLoading"
          :disabled="editingBlocked"
          :pending-count="unmarkedCount"
          :empty-hint="emptyHint"
          @update-status="onUpdateStatus"
          @quick-set-all="onQuickSetAll"
        />

        <div v-if="dailyRecords.length > 0" class="save-row">
          <div class="save-row__status">
            <span role="status" aria-live="polite">{{ saveStatusText }}</span>
            <small v-if="unmarkedCount > 0">儲存後仍維持未點名，不會記為出席或缺席</small>
          </div>
          <el-button v-if="bulkUndo" :disabled="editingBlocked" @click="undoBulk">復原</el-button>
          <el-button type="primary" :loading="saveLoading" :disabled="dailyLoading || switching" @click="saveDailyAttendance">
            儲存點名
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

.rollcall-filters {
  margin-bottom: var(--space-3);
}

.save-row {
  position: sticky;
  bottom: var(--space-2);
  z-index: var(--z-sticky);
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: var(--space-3);
  flex-wrap: wrap;
  margin-top: var(--space-4);
  padding: var(--space-3);
  background: var(--el-bg-color);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-md);
}
.save-row__status {
  margin-right: auto;
  display: flex;
  flex-direction: column;
  gap: 2px;
  color: var(--el-text-color-primary);
}
.save-row__status small {
  font-size: var(--text-xs);
  color: var(--el-text-color-secondary);
}
.save-row :deep(.el-button) {
  min-height: var(--touch-target-min);
}
@media (--to-sm) {
  .save-row {
    /* 與 PortalLayout 的底部導覽列高度對齊，避免遮住儲存動作。 */
    bottom: calc(60px + env(safe-area-inset-bottom) + var(--space-2));
  }
}
</style>
