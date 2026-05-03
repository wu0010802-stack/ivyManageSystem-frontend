<script setup>
import { onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useMessagesStore } from '../stores/messages'
import { toast } from '../utils/toast'
import ParentIcon from '../components/ParentIcon.vue'
import SkeletonBlock from '../components/SkeletonBlock.vue'
import PullToRefresh from '../components/PullToRefresh.vue'
import { fmtTimeOrDate } from '../utils/datetime'

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

async function pullRefresh() {
  await messagesStore.fetchThreads(true)
}

onMounted(init)
</script>

<template>
  <PullToRefresh :on-refresh="pullRefresh" class="messages-view">
    <template v-if="!messagesStore.threadsLoaded">
      <SkeletonBlock variant="row" :count="4" />
    </template>
    <div v-else-if="messagesStore.threads.length === 0" class="empty">
      <div class="empty-icon" aria-hidden="true">
        <ParentIcon name="chat" size="lg" />
      </div>
      <div class="empty-text">目前沒有訊息</div>
      <div class="empty-hint">老師有訊息時會出現在這裡</div>
    </div>
    <div v-else class="thread-list">
      <div
        v-for="t in messagesStore.threads"
        :key="t.id"
        class="thread-row press-scale"
        :class="{ unread: t.unread_count > 0 }"
        @click="openThread(t)"
      >
        <div class="avatar">{{ (t.teacher_name || '老師').slice(0, 1) }}</div>
        <div class="content">
          <div class="row1">
            <strong>{{ t.teacher_name || '老師' }}</strong>
            <span class="time">{{ fmtTimeOrDate(t.last_message_at) }}</span>
          </div>
          <div class="row2">
            <span class="student">[{{ t.student_name }}]</span>
            <span class="preview">{{ t.last_message_preview || '尚無訊息' }}</span>
            <span v-if="t.unread_count > 0" class="badge">{{ t.unread_count }}</span>
          </div>
        </div>
      </div>
    </div>
  </PullToRefresh>
</template>

<style scoped>
.messages-view { padding: 0; }
.hint, .empty { text-align: center; padding: 40px 16px; color: var(--pt-text-placeholder); }
.empty-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 12px;
  color: var(--neutral-400, var(--pt-text-disabled));
}
.empty-text { font-size: 16px; color: var(--pt-text-muted); }
.empty-hint { font-size: 13px; color: var(--pt-text-disabled); margin-top: 4px; }
.thread-list { background: var(--neutral-0); }
.thread-row {
  display: flex; gap: 12px; padding: 12px 16px;
  border-bottom: 1px solid var(--pt-surface-mute); cursor: pointer;
}
.thread-row.unread { background: var(--pt-surface-brand-tint); }
.avatar {
  width: 44px; height: 44px; border-radius: 22px;
  background: var(--brand-primary); color: var(--neutral-0);
  display: flex; align-items: center; justify-content: center;
  font-weight: 600; font-size: 16px; flex-shrink: 0;
}
.content { flex: 1; min-width: 0; }
.row1 { display: flex; justify-content: space-between; align-items: baseline; }
.row1 strong { color: var(--pt-text-strong); font-size: 15px; }
.time { color: var(--pt-text-placeholder); font-size: 12px; }
.row2 { display: flex; gap: 4px; align-items: center; margin-top: 2px; font-size: 13px; }
.student { color: var(--brand-primary); flex-shrink: 0; }
.preview { color: var(--pt-text-soft); flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.badge {
  background: var(--color-danger); color: var(--neutral-0); font-size: 11px;
  padding: 2px 7px; border-radius: 10px; flex-shrink: 0;
}
</style>
