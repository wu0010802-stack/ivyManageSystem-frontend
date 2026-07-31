<script setup lang="ts">
import { computed, onMounted, ref, watch, nextTick } from 'vue'
import { useRoute } from 'vue-router'
import { useMessagesStore } from '../stores/messages'
import { getMessageThread } from '../api/messages'
import MessageBubble from '../components/MessageBubble.vue'
import MessageComposer from '../components/MessageComposer.vue'
import ConfirmDialog from '../components/ConfirmDialog.vue'
import SkeletonBlock from '../components/SkeletonBlock.vue'
import MobileErrorRetry from '@/components/common/MobileErrorRetry.vue'
import { toast } from '../utils/toast'
import { enqueueParent, flushParentQueue } from '@/parent/utils/parentOfflineQueue'
import { OP_KINDS } from '@/utils/offlineQueue'
import { useKeyboardInset } from '../composables/useKeyboardInset'

interface ThreadInfo {
  teacher_name?: string
  student_name?: string
}

interface MessageItem {
  id: number | string
  [key: string]: unknown
}

const { keyboardInset } = useKeyboardInset()

const route = useRoute()
const messagesStore = useMessagesStore()

const threadId = computed(() => Number(route.params.threadId))
const thread = ref<ThreadInfo | null>(null)
const loading = ref(false)
const loadError = ref(false)
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
  loading.value = true
  loadError.value = false
  try {
    const { data } = await getMessageThread(threadId.value)
    thread.value = data as ThreadInfo
    await messagesStore.fetchMessages(threadId.value, { reset: true })
    // 進入即標已讀
    await messagesStore.markRead(threadId.value)
  } catch (err) {
    const e = err as Record<string, unknown>
    toast.error(String(e?.displayMessage || '載入失敗'))
    // 三態：原本只丟一個會自動消失的 toast，畫面留白，使用者分不清「這串
    // 本來就沒訊息」還是「載入失敗」；改顯示可重試的錯誤態。
    loadError.value = true
  } finally {
    loading.value = false
  }
}

async function retryInit() {
  await init()
  scrollToBottom()
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
  const hasAttachment = (attachments?.length ?? 0) > 0

  if (navigator.onLine) {
    try {
      await messagesStore.send(threadId.value, body, attachments)
      done(true)
    } catch (err) {
      const e = err as Record<string, unknown>
      toast.error(String(e?.displayMessage || '送出失敗'))
      done(false)
    }
    return
  }

  // 離線分流
  if (hasAttachment) {
    toast.warn('需連線才能上傳附件，請連線後再試')
    done(false)
    return
  }

  try {
    await enqueueParent({
      kind: OP_KINDS.PARENT_MESSAGE,
      payload: { thread_id: threadId.value, body },
      meta: { thread_id: threadId.value, content_preview: body.slice(0, 20) },
    })
    toast.success('已暫存，連線後自動送出')
    done(true)
    flushParentQueue(OP_KINDS.PARENT_MESSAGE).catch(() => {})
  } catch (err) {
    const e = err as Record<string, unknown>
    toast.error(String(e?.displayMessage || '暫存失敗'))
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

// 訊息列表容器 ref，供自動捲底使用
const messagesEl = ref<HTMLElement | null>(null)

function scrollToBottom() {
  nextTick(() => {
    const el = messagesEl.value
    if (el) el.scrollTop = el.scrollHeight
  })
}

// 新訊息到達（length 增加且非「載入更早」）→ 捲到底；loadMore 時 loadingMore=true，保留閱讀位置
watch(
  () => messages.value.length,
  (newLen, oldLen) => { if (newLen > oldLen && !loadingMore.value) scrollToBottom() },
)

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

onMounted(async () => {
  await init()
  scrollToBottom()
  flushParentQueue(OP_KINDS.PARENT_MESSAGE).catch(() => {})
})
</script>

<template>
  <div class="thread-view" :style="{ paddingBottom: keyboardInset ? keyboardInset + 'px' : undefined }">
    <!-- M3TopAppBar 由 ParentLayout 提供（依 route.meta.showBack 顯示返回鍵）；這裡只顯示對話對方的副標題（學生名）。 -->
    <div v-if="thread" class="thread-subtitle">
      <strong>{{ thread.teacher_name || '老師' }}</strong>
      <span class="sub">{{ thread.student_name }}</span>
    </div>

    <div v-if="loading && messages.length === 0" class="skeleton-wrap">
      <SkeletonBlock variant="card" :count="3" />
    </div>

    <MobileErrorRetry
      v-else-if="loadError && messages.length === 0"
      @retry="retryInit"
    />

    <template v-else>
      <div class="messages" ref="messagesEl">
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
    </template>

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
  flex: 1;
  min-height: 0;
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

.skeleton-wrap {
  flex: 1;
  padding: var(--space-3, 12px);
  display: flex;
  flex-direction: column;
  gap: var(--space-3, 12px);
}

.load-more {
  display: block;
  margin: 0 auto 12px;
  min-height: var(--touch-target-min, 44px);
}
.load-more:disabled { opacity: 0.5; cursor: not-allowed; }
</style>
