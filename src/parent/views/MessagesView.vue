<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useMessagesStore } from '../stores/messages'
import { toast } from '../utils/toast'
import SkeletonBlock from '../components/SkeletonBlock.vue'
import PullToRefresh from '../components/PullToRefresh.vue'
import EmptyState from '@/components/common/EmptyState.vue'
import KawaiiStar from '@/components/brand/KawaiiStar.vue'
import { fmtTimeOrDate } from '../utils/datetime'
import MessagesSearchBar from '../components/messages/MessagesSearchBar.vue'

interface Thread {
  id: number | string
  teacher_name?: string
  student_name?: string
  last_message_at?: string
  last_message_preview?: string
  unread_count: number
}

const router = useRouter()
const messagesStore = useMessagesStore()

const threads = computed(() => (messagesStore.threads || []) as unknown as Thread[])

async function init() {
  try {
    await messagesStore.fetchThreads(true)
  } catch (err) {
    const e = err as Record<string, unknown>
    toast.error(String(e?.displayMessage || '載入失敗'))
  }
}

function openThread(t: Thread) {
  router.push({ path: `/messages/${t.id}` })
}

async function pullRefresh() {
  await messagesStore.fetchThreads(true)
}

const totalUnread = computed(() =>
  threads.value.reduce((acc: number, t: Thread) => acc + (t.unread_count || 0), 0),
)

onMounted(init)
</script>

<template>
  <PullToRefresh :on-refresh="pullRefresh" class="messages-view">
    <MessagesSearchBar />

    <header class="pt-page-hero">
      <p class="pt-page-hero-eyebrow">家校訊息</p>
      <h1 class="pt-page-hero-title">老師與您的對話</h1>
      <p v-if="totalUnread > 0" class="pt-page-hero-note">
        有 <strong>{{ totalUnread }}</strong> 則尚未閱讀
      </p>
      <p v-else-if="threads.length > 0" class="pt-page-hero-note">
        所有訊息都看完了
      </p>
    </header>

    <template v-if="!messagesStore.threadsLoaded">
      <div class="skeleton-wrap">
        <SkeletonBlock variant="row" :count="4" />
      </div>
    </template>

    <EmptyState
      v-else-if="threads.length === 0"
      variant="mobile"
      :icon="KawaiiStar"
      title="目前沒有訊息"
      description="老師有訊息時會出現在這裡"
    />

    <div v-else class="thread-list pt-list-group">
      <button
        v-for="t in threads"
        :key="t.id"
        type="button"
        class="thread-row pt-list-row"
        :class="{ unread: t.unread_count > 0 }"
        @click="openThread(t)"
      >
        <div class="avatar" aria-hidden="true">{{ (t.teacher_name || '老師').slice(0, 1) }}</div>
        <div class="pt-list-row-body">
          <div class="row1">
            <strong>{{ t.teacher_name || '老師' }}</strong>
            <span class="time">{{ fmtTimeOrDate(t.last_message_at) }}</span>
          </div>
          <div class="row2">
            <span class="student">{{ t.student_name }}</span>
            <span class="preview">{{ t.last_message_preview || '尚無訊息' }}</span>
          </div>
        </div>
        <span v-if="t.unread_count > 0" class="badge" :aria-label="`${t.unread_count} 則未讀`">
          {{ t.unread_count }}
        </span>
      </button>
    </div>
  </PullToRefresh>
</template>

<style scoped>
.messages-view :deep(.ptr-content) {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.skeleton-wrap { padding: 0 16px; display: flex; flex-direction: column; gap: 8px; }

.thread-list {
  display: flex;
  flex-direction: column;
}
.thread-row {
  background: transparent;
  border: none;
  width: 100%;
  cursor: pointer;
  text-align: left;
  font-family: inherit;
  font-size: inherit;
}
.thread-row.unread {
  background: linear-gradient(90deg, var(--cream, #fffcf2) 0%, var(--pt-surface-card, #fff) 70%);
}
.avatar {
  width: 44px; height: 44px;
  border-radius: 16px;
  background: var(--leaf-100, #dcf4e6);
  color: var(--brand-primary, #0d9053);
  display: flex; align-items: center; justify-content: center;
  font-weight: 800; font-size: 17px;
  flex-shrink: 0;
}
.row1 { display: flex; justify-content: space-between; align-items: baseline; gap: 8px; }
.row1 strong {
  color: var(--pt-text-strong);
  font-size: 15px;
  font-weight: 700;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.thread-row.unread .row1 strong { font-weight: 800; }
.time {
  color: var(--pt-text-faint);
  font-size: 12px;
  flex-shrink: 0;
}
.row2 {
  display: flex;
  gap: 6px;
  align-items: center;
  margin-top: 2px;
  font-size: 13px;
}
.student {
  display: inline-flex;
  padding: 1px 7px;
  background: var(--sun-100, #fff4c9);
  color: var(--sun-700, #c99500);
  border-radius: 999px;
  font-size: 11px;
  font-weight: 600;
  flex-shrink: 0;
}
.preview {
  color: var(--pt-text-muted);
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.thread-row.unread .preview { color: var(--pt-text-strong); font-weight: 500; }

.badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 22px;
  height: 22px;
  padding: 0 7px;
  background: var(--coral-500, #ff8b8b);
  color: #fff;
  font-size: 11px;
  font-weight: 700;
  border-radius: 11px;
  flex-shrink: 0;
}
</style>
