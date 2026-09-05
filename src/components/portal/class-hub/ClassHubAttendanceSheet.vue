<template>
  <el-drawer
    :model-value="show"
    direction="btt"
    size="80%"
    title="快速點名"
    @update:model-value="$emit('update:show', $event)"
    @open="onOpen"
  >
    <div v-loading="loading" class="attn-sheet">
      <!-- 「全班已點名」與「今日還沒有名單」是兩件事：後者說成前者會讓老師
           以為點過了（P1-01 的一環）。以 totalRecords 分辨。 -->
      <EmptyState
        v-if="!loading && pendingRecords.length === 0"
        variant="inline"
        :title="totalRecords > 0
          ? `本班 ${totalRecords} 位學生今日皆已點名`
          : '今日尚未產生點名名單'"
        :description="totalRecords > 0 ? '' : '可能是今天沒有排課，或名單尚未建立。'"
      />
      <!-- 多數日子全班都到，逐一點 27 次是白工（P2-15）。與點名頁的
           「全部出席」對齊，例外再逐一改。 -->
      <div v-if="pendingRecords.length > 1" class="attn-bulk">
        <span class="attn-bulk__count">{{ pendingRecords.length }} 位待點名</span>
        <el-button
          type="success"
          plain
          :loading="bulkSaving"
          @click="markAllPresent"
        >
          全部出席
        </el-button>
      </div>
      <div
        v-for="rec in pendingRecords"
        :key="rec.student_id"
        class="attn-row"
      >
        <span class="attn-row__name">{{ rec.name }}</span>
        <el-radio-group
          v-model="picks[rec.student_id]"
          class="attn-row__picks"
          :aria-label="`${rec.name} 出勤狀態`"
          @change="onPick(rec.student_id)"
        >
          <el-radio-button label="出席" />
          <el-radio-button label="缺席" />
          <el-radio-button label="遲到" />
          <el-radio-button label="病假" />
          <el-radio-button label="事假" />
        </el-radio-group>
      </div>
      <p v-if="error" class="attn-error">{{ error }}</p>
    </div>
  </el-drawer>
</template>

<script setup lang="ts">
import { ref, reactive } from 'vue'
import { ElMessage } from 'element-plus'
import {
  getMyClassAttendance,
  batchSaveClassAttendance,
} from '@/api/portal'
import EmptyState from '@/components/common/EmptyState.vue'

interface AttendanceRecord { student_id: number | string; name?: string; status?: string | null }

withDefaults(defineProps<{
  show?: boolean
}>(), {
  show: false,
})
const emit = defineEmits<{
  'update:show': [value: boolean]
  'done': []
}>()

const loading = ref(false)
const error = ref('')
const pendingRecords = ref<AttendanceRecord[]>([]) // students with status==null
const totalRecords = ref(0) // 全班應點名人數（用於分辨「已點完」與「沒有名單」）
const bulkSaving = ref(false)
const picks = reactive<Record<string | number, string>>({}) // student_id -> selected status (optimistic UI)
let cachedClassroomId: number | null = null
let cachedDate: string | null = null

function todayIso() {
  const d = new Date()
  const yyyy = d.getFullYear()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}

async function fetchClassroom() {
  // Caller (PortalClassHubView) doesn't pass classroom_id; we resolve via the
  // attendance endpoint's behaviour: it auto-uses the teacher's classroom when
  // classroom_id is the teacher's only one. To find it, we hit the lighter
  // class-hub endpoint to get classroom_id then call attendance with it.
  const { getTodayHub } = await import('@/api/portalClassHub')
  const hub = await getTodayHub()
  if (!hub.classroom_id) {
    throw new Error('找不到您的班級')
  }
  // getTodayHub 為自解包鬆散型別，classroom_id 統一收斂成 number。
  return Number(hub.classroom_id)
}

async function load() {
  loading.value = true
  error.value = ''
  try {
    cachedClassroomId = await fetchClassroom()
    cachedDate = todayIso()
    const res = await getMyClassAttendance({
      date: cachedDate,
      classroom_id: cachedClassroomId,
    })
    const allRecords = res.data.records ?? []
    totalRecords.value = allRecords.length
    const records: AttendanceRecord[] = allRecords.filter((r) => !r.status)
    pendingRecords.value = records
    // Reset picks for students newly loaded
    for (const r of records) {
      if (!(r.student_id in picks)) picks[r.student_id] = ''
    }
  } catch (e: unknown) {
    totalRecords.value = 0
    error.value = (e instanceof Error ? e.message : null) || '載入失敗'
  } finally {
    loading.value = false
  }
}

async function onPick(studentId: number | string) {
  const status = picks[studentId]
  if (!status) return
  // 尚未載入完成（無班級/日期）不可送出，後端 batch body 要求 date/classroom_id 必填。
  if (cachedDate == null || cachedClassroomId == null) return
  // Save this single entry (batch endpoint accepts arrays — send one)
  try {
    await batchSaveClassAttendance({
      date: cachedDate,
      classroom_id: cachedClassroomId,
      entries: [{ student_id: Number(studentId), status }],
    })
    // Remove from pending list (optimistic)
    pendingRecords.value = pendingRecords.value.filter(
      (r) => r.student_id !== studentId,
    )
    delete picks[studentId]
    emit('done')
    ElMessage.success(`已標記為「${status}」`)
  } catch (e) {
    error.value = '儲存失敗'
    // Revert pick on failure
    picks[studentId] = ''
  }
}

async function markAllPresent() {
  if (cachedDate == null || cachedClassroomId == null) return
  const targets = pendingRecords.value.slice()
  if (targets.length === 0) return
  bulkSaving.value = true
  try {
    await batchSaveClassAttendance({
      date: cachedDate,
      classroom_id: cachedClassroomId,
      entries: targets.map((r) => ({ student_id: Number(r.student_id), status: '出席' })),
    })
    pendingRecords.value = []
    for (const r of targets) delete picks[r.student_id]
    // 每位學生各扣一次 count，與逐筆送出的行為一致
    for (let i = 0; i < targets.length; i += 1) emit('done')
    ElMessage.success(`已將 ${targets.length} 位標記為出席`)
  } catch (e) {
    error.value = '批次儲存失敗，請改為逐一點名'
  } finally {
    bulkSaving.value = false
  }
}

function onOpen() {
  load()
}
</script>

<style scoped>
.attn-sheet {
  padding: 0 16px 24px;
}
.attn-bulk {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3, 12px);
  padding: 12px 0;
  border-bottom: 1px solid var(--el-border-color-lighter);
}
.attn-bulk__count {
  color: var(--el-text-color-secondary);
  font-size: var(--text-sm, 13px);
}
.attn-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  padding: 12px 0;
  border-bottom: 1px solid var(--el-border-color-lighter);
}
.attn-row:last-child {
  border-bottom: none;
}
.attn-row__name {
  font-weight: 500;
  flex-shrink: 0;
}
/* 觸控目標：radio 按鈕 ≥44px（點名是每日高頻主行動，size small 24px 太小） */
.attn-row__picks :deep(.el-radio-button__inner) {
  min-height: var(--touch-target-min, 44px);
  display: inline-flex;
  align-items: center;
}
/* 窄幕：姓名上、5 等寬 radio 佔滿下方一列（避免擠壓截斷） */
@media (max-width: 600px) {
  .attn-row {
    flex-direction: column;
    align-items: stretch;
    gap: 8px;
  }
  .attn-row__picks {
    display: grid;
    grid-template-columns: repeat(5, 1fr);
  }
  .attn-row__picks :deep(.el-radio-button) {
    display: block;
  }
  .attn-row__picks :deep(.el-radio-button__inner) {
    width: 100%;
    justify-content: center;
    padding-left: 0;
    padding-right: 0;
  }
}
.attn-error {
  color: var(--el-color-danger);
  text-align: center;
  margin-top: 12px;
}
</style>
