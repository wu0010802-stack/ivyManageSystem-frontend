<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useFaq } from '@/parent/composables/useFaq'
import { searchFaq } from '@/parent/composables/useFaqSearch'
import AssistantSearch from '@/parent/components/assistant/AssistantSearch.vue'
import CategoryChip from '@/parent/components/assistant/CategoryChip.vue'
import FaqAnswer from '@/parent/components/assistant/FaqAnswer.vue'
import SkeletonBlock from '@/parent/components/SkeletonBlock.vue'
import EmptyState from '@/components/common/EmptyState.vue'
import MobileErrorRetry from '@/components/common/MobileErrorRetry.vue'

type FaqItem = { id?: unknown; question?: string; answer?: string; keywords?: string[]; category?: unknown; [key: string]: unknown }
type FaqCategory = { id: number | string; label: string; icon: string; color: string }

const router = useRouter()
// P1-2：原本只解構 faq/loading/load，丟掉 error——真實載入失敗時會誤顯示
// 「尚無常見問題」且無重試。比照 AdminListView pattern 補 error 分支。
const { faq, loading, error, load } = useFaq()
const query = ref('')
const selectedCategoryId = ref<number | string | null>(null)
const expandedKey = ref<string | null>(null)

const faqData = computed(() => faq.value as Record<string, unknown> | null)
const items = computed(() => (faqData.value?.items as FaqItem[]) || [])
const categories = computed(() => (faqData.value?.categories as FaqCategory[]) || [])
const faqVersion = computed(() => (faqData.value?.version as string) || '')
const faqUpdatedAt = computed(() => (faqData.value?.updated_at as string) || '')

const filteredItems = computed<FaqItem[]>(() => {
  if (query.value.trim()) {
    return searchFaq(items.value, query.value, 20) as FaqItem[]
  }
  if (selectedCategoryId.value !== null) {
    return items.value.filter(x => x.category === selectedCategoryId.value)
  }
  return items.value
})

function itemKey(item: FaqItem): string {
  return String(item.id ?? item.question ?? '')
}

function toggleCategory(cat: FaqCategory) {
  selectedCategoryId.value = selectedCategoryId.value === cat.id ? null : cat.id
  expandedKey.value = null
}

function toggleQuestion(item: FaqItem) {
  const k = itemKey(item)
  expandedKey.value = expandedKey.value === k ? null : k
}

function goContactTeacher() {
  // 訊息下架後，聯絡老師走聯絡簿回覆。
  router.push('/contact-book')
}

onMounted(load)
</script>

<template>
  <div class="assistant-view">
    <header class="pt-page-hero">
      <p class="pt-page-hero-eyebrow">常見問題</p>
      <h1 class="pt-page-hero-title">這裡找答案</h1>
      <p class="pt-page-hero-note">選分類或直接搜尋，找不到再聯絡老師</p>
    </header>

    <AssistantSearch v-model="query" />

    <div v-if="!query.trim() && categories.length" class="category-rail">
      <div
        v-for="c in categories"
        :key="c.id"
        class="cat-wrap"
        :class="{ selected: c.id === selectedCategoryId }"
      >
        <CategoryChip :category="c" @click="toggleCategory" />
      </div>
    </div>

    <div class="faq-list">
      <div v-if="loading && !faq" class="skeleton-wrap">
        <SkeletonBlock variant="row" :count="4" />
      </div>
      <MobileErrorRetry
        v-else-if="error && !faq"
        :error="error"
        @retry="load"
      />
      <EmptyState
        v-else-if="!loading && filteredItems.length === 0"
        variant="inline"
        :title="query.trim() ? '沒有找到相關問題' : '尚無常見問題'"
      />
      <div
        v-for="item in filteredItems"
        :key="itemKey(item)"
        class="faq-item"
        :class="{ open: expandedKey === itemKey(item) }"
      >
        <button
          type="button"
          class="faq-question"
          :aria-expanded="expandedKey === itemKey(item)"
          @click="toggleQuestion(item)"
        >
          <span>{{ item.question }}</span>
          <span class="material-symbols-rounded chev">expand_more</span>
        </button>
        <div v-if="expandedKey === itemKey(item)" class="faq-body">
          <FaqAnswer :item="item" />
        </div>
      </div>
    </div>

    <p v-if="faqVersion || faqUpdatedAt" class="faq-meta">
      <span v-if="faqVersion">版本 {{ faqVersion }}</span>
      <span v-if="faqUpdatedAt">{{ faqVersion ? '·' : '' }} 更新 {{ faqUpdatedAt }}</span>
    </p>

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
  min-height: 100dvh;
  background: var(--pt-surface-mute-soft, #fefcf3);
  padding-bottom: 80px;
  display: flex;
  flex-direction: column;
}
.category-rail {
  display: flex;
  gap: 8px;
  padding: 12px 14px;
  overflow-x: auto;
  scroll-snap-type: x proximity;
}
.category-rail::-webkit-scrollbar { display: none; }
.cat-wrap {
  scroll-snap-align: start;
  flex-shrink: 0;
}
.cat-wrap.selected :deep(.chip) {
  background: color-mix(in oklab, var(--chip-color, #0d9053) 14%, #fff);
}
.faq-list {
  flex: 1;
  padding: 4px 14px 16px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.skeleton-wrap {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 4px 0;
}
.faq-item {
  background: var(--pt-surface-card, #fff);
  border: 1px solid var(--pt-border-light, #ecf5f9);
  border-radius: 14px;
  overflow: hidden;
}
.faq-item.open {
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.06);
}
.faq-question {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 14px 16px;
  background: transparent;
  border: none;
  cursor: pointer;
  text-align: left;
  font-size: 15px;
  font-weight: 500;
  color: var(--pt-text, #1f2937);
}
.faq-question .chev {
  transition: transform 0.15s;
  color: var(--pt-text-faint, #6b7280);
}
.faq-item.open .faq-question .chev {
  transform: rotate(180deg);
}
.faq-body {
  padding: 12px 16px 14px;
  border-top: 1px solid var(--pt-border-light, #ecf5f9);
}
.faq-meta {
  text-align: center;
  font-size: 12px;
  color: var(--pt-text-faint, #6b7280);
  margin: 8px 0 80px;
}
.faq-meta span + span { margin-left: 4px; }
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
