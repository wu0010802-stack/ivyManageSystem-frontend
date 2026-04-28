<script setup>
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useMessagesStore } from '../stores/messages'
import { getMessageThread } from '../api/messages'
import MessageBubble from '../components/MessageBubble.vue'
import MessageComposer from '../components/MessageComposer.vue'
import { toast } from '../utils/toast'

const route = useRoute()
const router = useRouter()
const messagesStore = useMessagesStore()

const threadId = computed(() => Number(route.params.threadId))
const thread = ref(null)
const loadingMore = ref(false)

const messages = computed(() => {
  const bucket = messagesStore.messagesByThread[threadId.value]
  // store 是新→舊；UI 顯示舊→新
  return [...(bucket?.items || [])].reverse()
})
const hasMore = computed(() => {
  const bucket = messagesStore.messagesByThread[threadId.value]
  return !!bucket?.hasMore
})

async function init() {
  try {
    const { data } = await getMessageThread(threadId.value)
    thread.value = data
    await messagesStore.fetchMessages(threadId.value, { reset: true })
    // 進入即標已讀
    await messagesStore.markRead(threadId.value)
  } catch (err) {
    toast.error(err?.displayMessage || '載入失敗')
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

async function onSend({ body, attachments, done }) {
  try {
    await messagesStore.send(threadId.value, body, attachments)
  } catch (err) {
    toast.error(err?.displayMessage || '送出失敗')
  } finally {
    done()
  }
}

async function onRecall(messageId) {
  if (!confirm('確定撤回？對方仍可看到「此訊息已撤回」。')) return
  try {
    await messagesStore.recall(messageId)
  } catch (err) {
    toast.error(err?.displayMessage || '撤回失敗')
  }
}

onMounted(init)
</script>

<template>
  <div class="thread-view">
    <header class="header">
      <button class="back" @click="router.back()">←</button>
      <div class="title">
        <strong>{{ thread?.teacher_name || '老師' }}</strong>
        <span v-if="thread" class="sub">{{ thread.student_name }}</span>
      </div>
    </header>

    <div class="messages">
      <button v-if="hasMore" class="load-more" @click="loadMore" :disabled="loadingMore">
        {{ loadingMore ? '載入中…' : '載入更早訊息' }}
      </button>
      <MessageBubble
        v-for="m in messages"
        :key="m.id"
        :message="m"
        :can-recall="true"
        @recall="onRecall"
      />
    </div>

    <MessageComposer @send="onSend" />
  </div>
</template>

<style scoped>
.thread-view { display: flex; flex-direction: column; height: calc(100vh - 64px); margin: -16px; background: #f7f9f8; }
.header {
  display: flex; align-items: center; gap: 8px; padding: 10px 12px;
  background: #fff; border-bottom: 1px solid #e5e7eb;
}
.back { background: none; border: none; font-size: 22px; padding: 4px 8px; color: #2c7be5; }
.title { display: flex; flex-direction: column; }
.title strong { font-size: 15px; color: #2c3e50; }
.title .sub { font-size: 12px; color: #888; }
.messages { flex: 1; overflow-y: auto; padding: 12px; }
.load-more {
  display: block; margin: 0 auto 12px; padding: 6px 16px;
  background: #fff; border: 1px solid #ddd; border-radius: 14px; font-size: 12px;
}
.load-more:disabled { opacity: 0.5; }
</style>
