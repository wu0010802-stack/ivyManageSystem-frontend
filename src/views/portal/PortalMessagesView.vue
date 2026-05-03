<script setup>
import { onMounted, ref, computed } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { usePortalMessagesStore } from '@/stores/portalMessages'
import { getMyStudents } from '@/api/portal'

const store = usePortalMessagesStore()
const router = useRouter()

const showNewDialog = ref(false)
const classrooms = ref([])
const selectedClassroomId = ref(null)
const selectedStudentId = ref(null)
const newBody = ref('')
const sending = ref(false)

const studentsInSelected = computed(() => {
  const c = classrooms.value.find((cr) => cr.classroom_id === selectedClassroomId.value)
  return c?.students || []
})

const selectedStudent = computed(() =>
  studentsInSelected.value.find((s) => s.id === selectedStudentId.value),
)

const candidateGuardians = computed(() => {
  // /portal/my-students 不含 guardians 詳情；先讓使用者填 parent_user_id
  return []
})

const parentUserIdInput = ref('')

onMounted(async () => {
  await store.fetchThreads()
})

async function openNew() {
  showNewDialog.value = true
  if (classrooms.value.length === 0) {
    try {
      const res = await getMyStudents()
      classrooms.value = res.data?.classrooms || []
    } catch (e) {
      ElMessage.error('讀取班級學生失敗')
    }
  }
}

async function submitNew() {
  if (!selectedStudentId.value || !parentUserIdInput.value || !newBody.value.trim()) {
    ElMessage.warning('請完整填寫')
    return
  }
  sending.value = true
  try {
    const data = await store.startThread({
      studentId: Number(selectedStudentId.value),
      parentUserId: Number(parentUserIdInput.value),
      body: newBody.value.trim(),
    })
    showNewDialog.value = false
    newBody.value = ''
    selectedStudentId.value = null
    parentUserIdInput.value = ''
    router.push(`/portal/messages/${data.thread.id}`)
  } catch (e) {
    ElMessage.error(e?.response?.data?.detail || '發送失敗')
  } finally {
    sending.value = false
  }
}

function gotoThread(t) {
  router.push(`/portal/messages/${t.id}`)
}

function fmtTime(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}
</script>

<template>
  <div class="portal-messages">
    <div class="page-header">
      <h2>家長訊息</h2>
      <el-button type="primary" @click="openNew">+ 新訊息</el-button>
    </div>

    <div class="thread-list pt-stagger">
      <p v-if="!store.threadsLoaded" class="empty">讀取中…</p>
      <p v-else-if="store.threads.length === 0" class="empty">
        尚無對話。點選右上「+ 新訊息」主動聯繫家長。
      </p>
      <button
        v-for="t in store.threads"
        :key="t.id"
        class="thread-row pt-card press-scale"
        @click="gotoThread(t)"
      >
        <div class="row-top">
          <strong>{{ t.student_name || '學生' }}</strong>
          <span v-if="t.unread_count > 0" class="unread-dot">{{ t.unread_count }}</span>
        </div>
        <div class="row-mid">
          <span class="parent">家長：{{ t.parent_name || '—' }}</span>
        </div>
        <div class="row-bot">
          <span class="preview">{{ t.last_message_preview || '（尚無訊息）' }}</span>
          <span class="time">{{ fmtTime(t.last_message_at) }}</span>
        </div>
      </button>
    </div>

    <el-dialog v-model="showNewDialog" title="主動發起訊息" width="500px">
      <el-form label-width="80px">
        <el-form-item label="班級">
          <el-select v-model="selectedClassroomId" placeholder="選擇班級" style="width: 100%">
            <el-option
              v-for="c in classrooms"
              :key="c.classroom_id"
              :label="c.classroom_name"
              :value="c.classroom_id"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="學生">
          <el-select
            v-model="selectedStudentId"
            placeholder="選擇學生"
            style="width: 100%"
            :disabled="!selectedClassroomId"
          >
            <el-option
              v-for="s in studentsInSelected"
              :key="s.id"
              :label="`${s.name}（${s.parent_name || '—'}）`"
              :value="s.id"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="家長帳號 ID">
          <el-input
            v-model="parentUserIdInput"
            placeholder="請填家長 user_id（後續可改用挑選器）"
          />
          <p class="hint">提示：可由「班級學生」頁進入學生個案，從監護人列表複製 user_id。</p>
        </el-form-item>
        <el-form-item label="訊息內容">
          <el-input
            v-model="newBody"
            type="textarea"
            :rows="4"
            placeholder="輸入給家長的第一則訊息…"
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showNewDialog = false">取消</el-button>
        <el-button type="primary" :loading="sending" @click="submitNew">送出</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.portal-messages { max-width: 800px; margin: 0 auto; }
.page-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: var(--space-4);
}

.thread-list { display: flex; flex-direction: column; gap: var(--space-2); }
.thread-row {
  display: flex;
  flex-direction: column;
  gap: 4px;
  text-align: left;
  padding: var(--space-3);
  cursor: pointer;
  width: 100%;
  border: var(--pt-hairline);
}
.row-top { display: flex; justify-content: space-between; align-items: center; }
.row-mid { font-size: var(--text-sm); color: var(--pt-text-muted); }
.row-bot {
  display: flex;
  justify-content: space-between;
  font-size: var(--text-sm);
  color: var(--pt-text-soft);
  gap: var(--space-2);
}
.preview {
  flex: 1;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.time { color: var(--pt-text-faint); flex-shrink: 0; }

.unread-dot {
  background: var(--color-danger);
  color: white;
  padding: 0 var(--space-2);
  border-radius: 999px;
  font-size: var(--text-xs);
  min-width: 20px;
  text-align: center;
}

.empty {
  text-align: center;
  color: var(--pt-text-muted);
  padding: var(--space-6);
}

.hint {
  font-size: var(--text-xs);
  color: var(--pt-text-muted);
  margin: 4px 0 0;
}
</style>
