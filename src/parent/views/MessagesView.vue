<script setup>
import { onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useMessagesStore } from '../stores/messages'
import { toast } from '../utils/toast'

const router = useRouter()
const messagesStore = useMessagesStore()

async function init() {
  try {
    await messagesStore.fetchThreads(true)
  } catch (err) {
    toast.error(err?.displayMessage || '載入失敗')
  }
}

function openThread(t) {
  router.push({ path: `/messages/${t.id}` })
}

function fmtTime(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  const today = new Date()
  if (
    d.getFullYear() === today.getFullYear() &&
    d.getMonth() === today.getMonth() &&
    d.getDate() === today.getDate()
  ) {
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
  }
  return `${d.getMonth() + 1}/${d.getDate()}`
}

onMounted(init)
</script>

<template>
  <div class="messages-view">
    <div v-if="!messagesStore.threadsLoaded" class="hint">載入中…</div>
    <div v-else-if="messagesStore.threads.length === 0" class="empty">
      <div class="empty-icon">💬</div>
      <div class="empty-text">目前沒有訊息</div>
      <div class="empty-hint">老師有訊息時會出現在這裡</div>
    </div>
    <div v-else class="thread-list">
      <div
        v-for="t in messagesStore.threads"
        :key="t.id"
        class="thread-row"
        :class="{ unread: t.unread_count > 0 }"
        @click="openThread(t)"
      >
        <div class="avatar">{{ (t.teacher_name || '老師').slice(0, 1) }}</div>
        <div class="content">
          <div class="row1">
            <strong>{{ t.teacher_name || '老師' }}</strong>
            <span class="time">{{ fmtTime(t.last_message_at) }}</span>
          </div>
          <div class="row2">
            <span class="student">[{{ t.student_name }}]</span>
            <span class="preview">{{ t.last_message_preview || '尚無訊息' }}</span>
            <span v-if="t.unread_count > 0" class="badge">{{ t.unread_count }}</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.messages-view { padding: 0; }
.hint, .empty { text-align: center; padding: 40px 16px; color: #888; }
.empty-icon { font-size: 48px; margin-bottom: 12px; }
.empty-text { font-size: 16px; color: #555; }
.empty-hint { font-size: 13px; color: #aaa; margin-top: 4px; }
.thread-list { background: #fff; }
.thread-row {
  display: flex; gap: 12px; padding: 12px 16px;
  border-bottom: 1px solid #f0f2f5; cursor: pointer;
}
.thread-row.unread { background: #f8fbf9; }
.avatar {
  width: 44px; height: 44px; border-radius: 22px;
  background: #3f7d48; color: #fff;
  display: flex; align-items: center; justify-content: center;
  font-weight: 600; font-size: 16px; flex-shrink: 0;
}
.content { flex: 1; min-width: 0; }
.row1 { display: flex; justify-content: space-between; align-items: baseline; }
.row1 strong { color: #2c3e50; font-size: 15px; }
.time { color: #888; font-size: 12px; }
.row2 { display: flex; gap: 4px; align-items: center; margin-top: 2px; font-size: 13px; }
.student { color: #3f7d48; flex-shrink: 0; }
.preview { color: #666; flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.badge {
  background: #c0392b; color: #fff; font-size: 11px;
  padding: 2px 7px; border-radius: 10px; flex-shrink: 0;
}
</style>
