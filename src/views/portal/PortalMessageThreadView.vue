<script setup>
import { computed, onMounted, watch } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { usePortalMessagesStore } from '@/stores/portalMessages'
import { broadcastDashboardInvalidate } from '@/composables/usePortalDashboard'
import MessageBubble from '@/components/portal/messages/MessageBubble.vue'
import MessageComposer from '@/components/portal/messages/MessageComposer.vue'

const props = defineProps({
  threadId: { type: [String, Number], required: true },
})

const router = useRouter()
const store = usePortalMessagesStore()

const tid = computed(() => Number(props.threadId))

const thread = computed(() => store.threads.find((t) => t.id === tid.value))
const bucket = computed(() => store.messagesByThread[tid.value] || { items: [] })
// 後端按 desc 回傳；UI 反向顯示新→下方
const orderedMessages = computed(() => [...bucket.value.items].reverse())

async function loadInitial() {
  await store.fetchThreads()
  await store.fetchMessages(tid.value, { reset: true })
  await store.markRead(tid.value)
  broadcastDashboardInvalidate()
}

onMounted(loadInitial)
watch(tid, loadInitial)

async function onSend({ body, attachments }) {
  try {
    await store.send(tid.value, body, attachments)
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
  await store.fetchMessages(tid.value)
}

function back() {
  router.push('/portal/messages')
}
</script>

<template>
  <div class="thread-view">
    <header class="thread-header">
      <el-button text @click="back">← 返回</el-button>
      <div class="title">
        <strong>{{ thread?.student_name || '學生' }}</strong>
        <span class="parent">家長：{{ thread?.parent_name || '—' }}</span>
      </div>
    </header>

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
</template>

<style scoped>
.thread-view {
  display: flex;
  flex-direction: column;
  height: calc(100vh - 200px);
  max-width: 800px;
  margin: 0 auto;
  background: var(--pt-surface-app);
  border-radius: var(--radius-md);
  border: var(--pt-hairline);
  overflow: hidden;
}

.thread-header {
  padding: var(--space-3);
  background: var(--pt-surface-card);
  border-bottom: var(--pt-hairline);
  display: flex;
  align-items: center;
  gap: var(--space-3);
}
.title {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.parent {
  font-size: var(--text-xs);
  color: var(--pt-text-muted);
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

.empty {
  text-align: center;
  color: var(--pt-text-muted);
  padding: var(--space-6);
}
</style>
