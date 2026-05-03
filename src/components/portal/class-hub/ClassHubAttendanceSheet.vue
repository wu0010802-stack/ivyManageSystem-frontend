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
      <div v-if="!loading && pendingRecords.length === 0" class="attn-empty">
        <el-empty description="本班學生今日皆已點名" />
      </div>
      <div
        v-for="rec in pendingRecords"
        :key="rec.student_id"
        class="attn-row"
      >
        <span class="attn-row__name">{{ rec.name }}</span>
        <el-radio-group
          v-model="picks[rec.student_id]"
          size="small"
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

<script setup>
import { ref, reactive } from 'vue'
import { ElMessage } from 'element-plus'
import {
  getMyClassAttendance,
  batchSaveClassAttendance,
} from '@/api/portal'

const props = defineProps({
  show: { type: Boolean, default: false },
})
const emit = defineEmits(['update:show', 'done'])

const loading = ref(false)
const error = ref('')
const pendingRecords = ref([]) // students with status==null
const picks = reactive({}) // student_id -> selected status (optimistic UI)
let cachedClassroomId = null
let cachedDate = null

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
  return hub.classroom_id
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
    const records = (res.data?.records ?? res.records ?? []).filter(
      (r) => !r.status,
    )
    pendingRecords.value = records
    // Reset picks for students newly loaded
    for (const r of records) {
      if (!(r.student_id in picks)) picks[r.student_id] = ''
    }
  } catch (e) {
    error.value = e?.message || '載入失敗'
  } finally {
    loading.value = false
  }
}

async function onPick(studentId) {
  const status = picks[studentId]
  if (!status) return
  // Save this single entry (batch endpoint accepts arrays — send one)
  try {
    await batchSaveClassAttendance({
      date: cachedDate,
      classroom_id: cachedClassroomId,
      entries: [{ student_id: studentId, status }],
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

function onOpen() {
  load()
}
</script>

<style scoped>
.attn-sheet {
  padding: 0 16px 24px;
}
.attn-empty {
  padding: 40px 0;
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
.attn-error {
  color: var(--el-color-danger);
  text-align: center;
  margin-top: 12px;
}
</style>
