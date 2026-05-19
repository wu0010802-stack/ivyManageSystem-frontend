<script setup lang="ts">
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
type Msg = { id: number; role: 'user' | 'assistant'; kind: string; payload?: unknown }
const messages = ref<Msg[]>([])
// Template helpers to safely cast payload for v-for iteration
function asCategoryList(p: unknown) { return p as FaqCategory[] }
function asQuestionList(p: unknown) { return p as FaqItem[] }
function asFaqItem(p: unknown) { return p as FaqItem }
function asQuestion(item: FaqItem): { question: string; [key: string]: unknown } {
  return item as unknown as { question: string; [key: string]: unknown }
}
let nextId = 1

type FaqItem = { id?: unknown; question?: string; answer?: string; keywords?: string[]; category?: unknown; [key: string]: unknown }
type FaqCategory = { id: number | string; label: string; icon: string; color: string }
const faqData = computed(() => faq.value as Record<string, unknown> | null)
const items = computed(() => (faqData.value?.items as FaqItem[]) || [])
const categories = computed(() => (faqData.value?.categories as FaqCategory[]) || [])
const searchResults = computed(() =>
  query.value.trim() ? searchFaq(items.value, query.value, 8) : []
)

function push(msg: Omit<Msg, 'id'>) {
  messages.value.push({ id: nextId++, ...msg })
}

function userBubble(text: string) {
  push({ role: 'user' as const, kind: 'text', payload: text })
}

async function withTyping(thenFn: () => void) {
  const typingMsg = { role: 'assistant' as const, kind: 'typing' }
  push(typingMsg)
  await new Promise(r => setTimeout(r, 400 + Math.random() * 200))
  // 移除 typing
  messages.value = messages.value.filter(m => m.kind !== 'typing')
  thenFn()
}

function chooseCategory(cat: FaqCategory | Record<string, unknown>) {
  userBubble(String((cat as FaqCategory).label || ''))
  withTyping(() => {
    const inCat = items.value.filter(x => x.category === cat.id)
    push({
      role: 'assistant' as const,
      kind: 'text',
      payload: `關於「${cat.label}」，這些是常見問題：`,
    })
    push({ role: 'assistant' as const, kind: 'questions', payload: inCat })
  })
}

function chooseQuestion(item: FaqItem | { question: string; [key: string]: unknown }) {
  userBubble((item as FaqItem).question || '')
  withTyping(() => {
    push({ role: 'assistant' as const, kind: 'answer', payload: item })
  })
}

function goContactTeacher() {
  router.push('/messages')
}

onMounted(async () => {
  await load()
  if (categories.value.length) {
    push({ role: 'assistant' as const, kind: 'categories', payload: categories.value })
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
        v-for="(r, idx) in searchResults"
        :key="idx"
        :item="asQuestion(r)"
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
              v-for="c in asCategoryList(m.payload)"
              :key="c.id"
              :category="c"
              @click="chooseCategory"
            />
          </div>
        </template>
        <template v-else-if="m.kind === 'questions'">
          <div class="chip-stack">
            <QuestionChip
              v-for="q in asQuestionList(m.payload)"
              :key="q.id as string"
              :item="asQuestion(q)"
              @click="chooseQuestion"
            />
          </div>
        </template>
        <template v-else-if="m.kind === 'answer'">
          <FaqAnswer :item="asFaqItem(m.payload)" />
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
