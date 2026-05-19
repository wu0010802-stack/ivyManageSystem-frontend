<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import { useMessagesStore } from '../stores/messages'
import { getMessageThread } from '../api/messages'
import MessageBubble from '../components/MessageBubble.vue'
import MessageComposer from '../components/MessageComposer.vue'
import ConfirmDialog from '../components/ConfirmDialog.vue'
import { toast } from '../utils/toast'

interface ThreadInfo {
  teacher_name?: string
  student_name?: string
}

interface MessageItem {
  id: number | string
  [key: string]: unknown
}

const route = useRoute()
const messagesStore = useMessagesStore()

const threadId = computed(() => Number(route.params.threadId))
const thread = ref<ThreadInfo | null>(null)
const loadingMore = ref(false)
const recallTarget = ref<number | string | null>(null) // 待撤回的 messageId 或 null

const messages = computed<MessageItem[]>(() => {
  const bucket = messagesStore.messagesByThread[threadId.value]
  // store 是新→舊；UI 顯示舊→新
  return ([...(bucket?.items || [])].reverse()) as MessageItem[]
})
const hasMore = computed(() => {
  const bucket = messagesStore.messagesByThread[threadId.value]
  return !!bucket?.hasMore
})

async function init() {
  try {
    const { data } = await getMessageThread(threadId.value)
    thread.value = data as ThreadInfo
    await messagesStore.fetchMessages(threadId.value, { reset: true })
    // 進入即標已讀
    await messagesStore.markRead(threadId.value)
  } catch (err) {
    const e = err as Record<string, unknown>
    toast.error(String(e?.displayMessage || '載入失敗'))
  }
}

async function loadMore() {
  if (!hasMore.value || loadingMore.value) return
  loadingMore.value = true
  try {
    await messagesStore.fetchMessages(threadId.value)
  } finally {
    loadingMore.value = false
  }
}

async function onSend({ body, attachments, done }: { body: string; attachments?: File[]; done: (ok: boolean) => void }) {
  try {
    await messagesStore.send(threadId.value, body, attachments)
    done(true)
  } catch (err) {
    const e = err as Record<string, unknown>
    toast.error(String(e?.displayMessage || '送出失敗'))
    done(false)
  }
}

function askRecall(messageId: number | string) {
  recallTarget.value = messageId
}

const recallOpen = computed({
  get: () => recallTarget.value !== null,
  set: (v: boolean) => {
    if (!v) recallTarget.value = null
  },
})

async function doRecall() {
  const id = recallTarget.value
  recallTarget.value = null
  if (!id) return
  try {
    await messagesStore.recall(Number(id))
  } catch (err) {
    const e = err as Record<string, unknown>
    toast.error(String(e?.displayMessage || '撤回失敗'))
  }
}

onMounted(init)
</script>

<template>
  <div class="thread-view">
    <!-- M3TopAppBar 由 ParentLayout 提供（依 route.meta.showBack 顯示返回鍵）；這裡只顯示對話對方的副標題（學生名）。 -->
    <div v-if="thread" class="thread-subtitle">
      <strong>{{ thread.teacher_name || '老師' }}</strong>
      <span class="sub">{{ thread.student_name }}</span>
    </div>

    <div class="messages">
      <button
        v-if="hasMore"
        type="button"
        class="pt-ghost-btn load-more"
        :disabled="loadingMore"
        @click="loadMore"
      >
        {{ loadingMore ? '載入中…' : '載入更早訊息' }}
      </button>
      <MessageBubble
        v-for="m in messages"
        :key="m.id"
        :message="m"
        :can-recall="true"
        @recall="askRecall"
      />
    </div>

    <MessageComposer @send="onSend" />

    <ConfirmDialog
      v-model:open="recallOpen"
      title="確定撤回此訊息？"
      message="對方仍可看到「此訊息已撤回」。"
      confirm-label="撤回"
      destructive
      @confirm="doRecall"
    />
  </div>
</template>

<style scoped>
.thread-view {
  display: flex;
  flex-direction: column;
  height: calc(100dvh - 64px);
  margin: -16px;
  background: var(--m3-surface, var(--pt-surface-thread-bg));
}

.thread-subtitle {
  display: flex;
  flex-direction: column;
  padding: var(--space-2, 8px) var(--space-4, 16px);
  background: var(--neutral-0, var(--neutral-0));
  border-bottom: 1px solid var(--pt-border-light, #ecf5f9);
}

.thread-subtitle strong {
  font-size: var(--text-base, 15px);
  color: var(--m3-on-surface, var(--pt-text-strong));
}

.thread-subtitle .sub {
  font-size: var(--text-xs, 12px);
  color: var(--pt-text-placeholder);
  margin-top: 2px;
}

.messages {
  flex: 1;
  overflow-y: auto;
  padding: var(--space-3, 12px);
}

.load-more {
  display: block;
  margin: 0 auto 12px;
  min-height: var(--touch-target-min, 44px);
}
.load-more:disabled { opacity: 0.5; cursor: not-allowed; }
</style>
