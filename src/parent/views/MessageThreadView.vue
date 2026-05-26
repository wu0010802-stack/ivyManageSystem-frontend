<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import { useMessagesStore } from '../stores/messages'
import { getMessageThread } from '../api/messages'
import MessageBubble from '../components/MessageBubble.vue'
import MessageComposer from '../components/MessageComposer.vue'
import ConfirmDialog from '../components/ConfirmDialog.vue'
import { toast } from '../utils/toast'
import { enqueueParent, flushParentQueue } from '@/parent/utils/parentOfflineQueue'
import { OP_KINDS } from '@/utils/offlineQueue'

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

const DRAFT_KEY = computed(() => `parent-msg-draft-${threadId.value}`)

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
  const hasAttachment = (attachments?.length ?? 0) > 0

  if (navigator.onLine) {
    try {
      await messagesStore.send(threadId.value, body, attachments)
      sessionStorage.removeItem(DRAFT_KEY.value)
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
    sessionStorage.setItem(DRAFT_KEY.value, body)
    toast.warn('需連線才能上傳附件，文字已暫存草稿，下次進此對話可恢復')
    done(false)
    return
  }

  try {
    await enqueueParent({
      kind: OP_KINDS.PARENT_MESSAGE,
      payload: { thread_id: threadId.value, body },
      meta: { thread_id: threadId.value, content_preview: body.slice(0, 20) },
    })
    sessionStorage.removeItem(DRAFT_KEY.value)
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
  // prefill sessionStorage 草稿（離線時有附件被阻擋後暫存的文字）
  // MessageComposer 的 input ref 由元件內部管理，透過 store 預填需額外機制；
  // 此處暫存供 MessageComposer 以 v-model 或 prop 取用（view 目前無直接 input ref，
  // 需 MessageComposer 自行從 sessionStorage 讀 DRAFT_KEY — 未來可擴充）
  void DRAFT_KEY.value // reactive 觸發

  await init()
  flushParentQueue(OP_KINDS.PARENT_MESSAGE).catch(() => {})
})
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
