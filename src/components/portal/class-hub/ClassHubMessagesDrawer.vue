<template>
  <el-drawer
    :model-value="modelValue"
    direction="rtl"
    :size="drawerSize"
    :title="drawerTitle"
    :show-close="currentView === 'list'"
    @update:model-value="$emit('update:modelValue', $event)"
    @open="onOpen"
  >
    <template v-if="currentView === 'thread'" #header>
      <div class="thread-drawer-header">
        <el-button text @click="emitBackToList">← 訊息列表</el-button>
        <div class="title">
          <strong>{{ activeThread?.student_name || '學生' }}</strong>
          <span class="parent">家長：{{ activeThread?.parent_name || '—' }}</span>
        </div>
      </div>
    </template>

    <!-- list view -->
    <div v-if="currentView === 'list'" class="msg-drawer">
      <div class="page-header">
        <el-button type="primary" size="small" @click="openNew">+ 新訊息</el-button>
      </div>

      <div class="thread-list">
        <p v-if="!store.threadsLoaded" class="empty">讀取中…</p>
        <p v-else-if="store.threads.length === 0" class="empty">
          尚無對話。點選「+ 新訊息」主動聯繫家長。
        </p>
        <button
          v-for="t in store.threads"
          :key="t.id"
          class="thread-row pt-card"
          @click="onThreadClick(t)"
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
    </div>

    <!-- thread view -->
    <div v-else-if="currentView === 'thread'" class="thread-view">
      <div class="messages">
        <button
          v-if="bucket.hasMore"
          class="load-more"
          @click="loadMore"
        >
          載入更早訊息
        </button>
        <p v-if="orderedMessages.length === 0" class="empty">尚無訊息</p>
        <MessageBubble
          v-for="m in orderedMessages"
          :key="m.id"
          :message="m"
          own-role="teacher"
          @recall="onRecall"
        />
      </div>
      <MessageComposer @send="onSend" />
    </div>

    <!-- 新對話 dialog（沿用既有實作） -->
    <el-dialog v-model="showNewDialog" title="主動發起訊息" width="500px" append-to-body>
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
  </el-drawer>
</template>

<script setup>
import { ref, computed, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { usePortalMessagesStore } from '@/stores/portalMessages'
import { broadcastDashboardInvalidate } from '@/composables/usePortalDashboard'
import { getMyStudents } from '@/api/portal'
import MessageBubble from '@/components/portal/messages/MessageBubble.vue'
import MessageComposer from '@/components/portal/messages/MessageComposer.vue'

const props = defineProps({
  modelValue: { type: Boolean, default: false },
  threadId: { type: Number, default: null },
})
const emit = defineEmits([
  'update:modelValue',
  'open-thread',
  'close-thread',
])

const store = usePortalMessagesStore()

const drawerSize = computed(() =>
  window.innerWidth < 768 ? '100%' : '480px',
)
const currentView = computed(() =>
  props.threadId ? 'thread' : 'list',
)
const drawerTitle = computed(() =>
  currentView.value === 'list' ? '家長訊息' : '',
)

const activeThread = computed(() =>
  store.threads.find((t) => t.id === props.threadId),
)
const bucket = computed(
  () => store.messagesByThread[props.threadId] || { items: [], hasMore: false },
)
const orderedMessages = computed(() => [...bucket.value.items].reverse())

// drawer 第一次開啟時 fetch threads；之後由 store 維持
async function onOpen() {
  await store.fetchThreads()
}

// threadId 變化時 → 載 thread 訊息 + markRead
watch(
  () => props.threadId,
  async (newId) => {
    if (!newId) return
    try {
      await store.fetchMessages(newId, { reset: true })
      await store.markRead(newId)
      broadcastDashboardInvalidate()
    } catch (e) {
      ElMessage.error('載入對話失敗')
    }
  },
  { immediate: true },
)

function onThreadClick(t) {
  emit('open-thread', t.id)
}

function emitBackToList() {
  emit('close-thread')
}

async function onSend({ body, attachments }) {
  try {
    await store.send(props.threadId, body, attachments)
  } catch (e) {
    ElMessage.error(e?.response?.data?.detail || '送出失敗')
  }
}

async function onRecall(messageId) {
  try {
    await store.recall(messageId)
    ElMessage.success('已撤回')
  } catch (e) {
    ElMessage.error(e?.response?.data?.detail || '撤回失敗')
  }
}

async function loadMore() {
  await store.fetchMessages(props.threadId)
}

function fmtTime(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

// 新對話 dialog state
const showNewDialog = ref(false)
const classrooms = ref([])
const selectedClassroomId = ref(null)
const selectedStudentId = ref(null)
const parentUserIdInput = ref('')
const newBody = ref('')
const sending = ref(false)

const studentsInSelected = computed(() => {
  const c = classrooms.value.find((cr) => cr.classroom_id === selectedClassroomId.value)
  return c?.students || []
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
    emit('open-thread', data.thread.id)
  } catch (e) {
    ElMessage.error(e?.response?.data?.detail || '發送失敗')
  } finally {
    sending.value = false
  }
}
</script>

<style scoped>
.msg-drawer { padding: 0 var(--space-2); }
.page-header { display: flex; justify-content: flex-end; margin-bottom: var(--space-3); }

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
  background: var(--pt-surface-card);
  border-radius: var(--radius-md);
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

/* thread view */
.thread-drawer-header {
  display: flex;
  align-items: center;
  gap: var(--space-3);
}
.thread-drawer-header .title {
  display: flex;
  flex-direction: column;
  gap: 2px;
  font-size: var(--text-base);
}
.thread-drawer-header .parent {
  font-size: var(--text-xs);
  color: var(--pt-text-muted);
  font-weight: normal;
}

.thread-view {
  display: flex;
  flex-direction: column;
  height: 100%;
}
.messages {
  flex: 1;
  padding: var(--space-3);
  overflow-y: auto;
  background: var(--pt-surface-mute);
}
.load-more {
  display: block;
  margin: 0 auto var(--space-3);
  padding: var(--space-1) var(--space-3);
  background: var(--pt-surface-card);
  border: var(--pt-hairline);
  border-radius: 999px;
  cursor: pointer;
  font-size: var(--text-xs);
  color: var(--pt-text-muted);
}
</style>
