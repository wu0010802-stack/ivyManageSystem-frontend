<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useFaq } from '@/parent/composables/useFaq'
import { searchFaq } from '@/parent/composables/useFaqSearch'
import AssistantBubble from '@/parent/components/assistant/AssistantBubble.vue'
import AssistantSearch from '@/parent/components/assistant/AssistantSearch.vue'
import CategoryChip from '@/parent/components/assistant/CategoryChip.vue'
import QuestionChip from '@/parent/components/assistant/QuestionChip.vue'
import FaqAnswer from '@/parent/components/assistant/FaqAnswer.vue'
import TypingIndicator from '@/parent/components/assistant/TypingIndicator.vue'

const router = useRouter()
const { faq, loading, load } = useFaq()
const query = ref('')
const messages = ref([])  // { id, role, kind, payload }
let nextId = 1

const items = computed(() => faq.value?.items || [])
const categories = computed(() => faq.value?.categories || [])
const searchResults = computed(() =>
  query.value.trim() ? searchFaq(items.value, query.value, 8) : []
)

function push(msg) {
  messages.value.push({ id: nextId++, ...msg })
}

function userBubble(text) {
  push({ role: 'user', kind: 'text', payload: text })
}

async function withTyping(thenFn) {
  const typingMsg = { role: 'assistant', kind: 'typing' }
  push(typingMsg)
  await new Promise(r => setTimeout(r, 400 + Math.random() * 200))
  // 移除 typing
  messages.value = messages.value.filter(m => m.kind !== 'typing')
  thenFn()
}

function chooseCategory(cat) {
  userBubble(cat.label)
  withTyping(() => {
    const inCat = items.value.filter(x => x.category === cat.id)
    push({
      role: 'assistant',
      kind: 'text',
      payload: `關於「${cat.label}」，這些是常見問題：`,
    })
    push({ role: 'assistant', kind: 'questions', payload: inCat })
  })
}

function chooseQuestion(item) {
  userBubble(item.question)
  withTyping(() => {
    push({ role: 'assistant', kind: 'answer', payload: item })
  })
}

function goContactTeacher() {
  router.push('/messages')
}

onMounted(async () => {
  await load()
  if (categories.value.length) {
    push({ role: 'assistant', kind: 'categories', payload: categories.value })
  }
})
</script>

<template>
  <div class="assistant-view">
    <header class="pt-page-hero">
      <p class="pt-page-hero-eyebrow">常春藤小幫手</p>
      <h1 class="pt-page-hero-title">想問什麼呢？</h1>
      <p class="pt-page-hero-note">先選分類或直接輸入問題</p>
    </header>

    <AssistantSearch v-model="query" />

    <!-- 搜尋結果 overlay -->
    <div v-if="query.trim()" class="search-results">
      <div v-if="loading && searchResults.length === 0" class="hint">載入中…</div>
      <div v-else-if="searchResults.length === 0" class="hint">沒有找到相關問題</div>
      <QuestionChip
        v-for="r in searchResults"
        :key="r.id"
        :item="r"
        @click="(item) => { query = ''; chooseQuestion(item); }"
      />
    </div>

    <!-- 聊天訊息 -->
    <div v-else class="messages">
      <AssistantBubble
        v-for="m in messages"
        :key="m.id"
        :role="m.role"
      >
        <template v-if="m.kind === 'text'">{{ m.payload }}</template>
        <template v-else-if="m.kind === 'typing'"><TypingIndicator /></template>
        <template v-else-if="m.kind === 'categories'">
          <div class="chip-grid">
            <CategoryChip
              v-for="c in m.payload"
              :key="c.id"
              :category="c"
              @click="chooseCategory"
            />
          </div>
        </template>
        <template v-else-if="m.kind === 'questions'">
          <div class="chip-stack">
            <QuestionChip
              v-for="q in m.payload"
              :key="q.id"
              :item="q"
              @click="chooseQuestion"
            />
          </div>
        </template>
        <template v-else-if="m.kind === 'answer'">
          <FaqAnswer :item="m.payload" />
        </template>
      </AssistantBubble>
    </div>

    <!-- 底部固定按鈕 -->
    <div class="bottom-bar">
      <button class="pt-action-btn contact-btn" @click="goContactTeacher">
        <span class="material-symbols-rounded">chat</span>
        找不到答案？聯絡老師
      </button>
    </div>
  </div>
</template>

<style scoped>
.assistant-view {
  min-height: 100vh;
  background: var(--pt-surface-mute-soft, #fefcf3);
  padding-bottom: 80px;
  display: flex;
  flex-direction: column;
}
.messages, .search-results { flex: 1; padding: 16px 14px; }
.search-results { display: flex; flex-direction: column; gap: 8px; }
.chip-grid { display: flex; flex-wrap: wrap; gap: 8px; }
.chip-stack { display: flex; flex-direction: column; gap: 8px; align-items: flex-start; }
.hint { color: var(--pt-text-faint, #6b7280); font-size: 14px; padding: 8px 4px; }
.bottom-bar {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  padding: 10px 16px calc(10px + env(safe-area-inset-bottom));
  background: var(--pt-surface-card, #fff);
  border-top: 1px solid var(--pt-border-light, #ecf5f9);
}
.contact-btn { width: 100%; }
</style>
