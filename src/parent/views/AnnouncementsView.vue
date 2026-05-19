<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { listAnnouncements, markRead } from '../api/announcements'
import { toast } from '../utils/toast'
import ParentIcon from '../components/ParentIcon.vue'
import AppModal from '../components/AppModal.vue'
import PullToRefresh from '../components/PullToRefresh.vue'
import SkeletonBlock from '../components/SkeletonBlock.vue'
import EmptyState from '@/components/common/EmptyState.vue'
import KawaiiStar from '@/components/brand/KawaiiStar.vue'
import { useIncrementalRender } from '../composables/useIncrementalRender'

type AnnItem = { id: number | string; priority: string; is_read: boolean; created_at: string; title: string; content?: string }
const items = ref<AnnItem[]>([])
const loading = ref(false)
const selected = ref<AnnItem | null>(null)

const { visible: _visibleRaw, sentinelRef, hasMore } = useIncrementalRender(items as unknown as import('vue').Ref<unknown[]>, { pageSize: 20 })
const visibleItems = computed(() => _visibleRaw.value as AnnItem[])

const detailOpen = computed({
  get: () => selected.value !== null,
  set: (v) => { if (!v) selected.value = null },
})

const PRIORITY_META: Record<string, { label: string; tone: string }> = {
  normal:    { label: '一般', tone: 'info' },
  important: { label: '重要', tone: 'warn' },
  urgent:    { label: '緊急', tone: 'danger' },
}

const unreadCount = computed(() => items.value.filter((x) => !x.is_read).length)

async function fetchData() {
  loading.value = true
  try {
    const { data } = await listAnnouncements({ limit: 50 })
    items.value = (data?.items || []) as AnnItem[]
  } catch (err: unknown) {
    const e = err as Record<string, unknown>
    toast.error(String(e?.displayMessage || '載入失敗'))
  } finally {
    loading.value = false
  }
}

async function openDetail(item: AnnItem) {
  selected.value = item
  if (!item.is_read) {
    try {
      await markRead(item.id as number)
      item.is_read = true
      item.is_read = true
    } catch { /* ignore */ }
  }
}

function close() { selected.value = null }

const formatTime = (s: string | null | undefined) => s ? s.replace('T', ' ').slice(0, 16) : ''

const formatRelative = (s: string | null | undefined) => {
  if (!s) return ''
  try {
    const d = new Date(s.replace(' ', 'T'))
    const now = new Date()
    const diffMs = now.getTime() - d.getTime()
    const min = Math.floor(diffMs / 60000)
    if (min < 1) return '剛剛'
    if (min < 60) return `${min} 分鐘前`
    const hr = Math.floor(min / 60)
    if (hr < 24) return `${hr} 小時前`
    const day = Math.floor(hr / 24)
    if (day < 7) return `${day} 天前`
    return d.toLocaleDateString('zh-TW', { month: 'numeric', day: 'numeric' })
  } catch { return formatTime(s) }
}

onMounted(fetchData)

async function pullRefresh() { await fetchData() }
</script>

<template>
  <PullToRefresh :on-refresh="pullRefresh" class="ann-view">
    <header class="page-hero pt-page-hero">
      <p class="pt-page-hero-eyebrow">園所公告</p>
      <h1 class="pt-page-hero-title">學校的訊息</h1>
      <p v-if="unreadCount > 0" class="pt-page-hero-note">
        有 <strong>{{ unreadCount }}</strong> 則尚未閱讀
      </p>
      <p v-else-if="items.length" class="pt-page-hero-note">所有公告都看完了</p>
    </header>

    <template v-if="loading && items.length === 0">
      <div class="skeleton-wrap">
        <SkeletonBlock variant="card" :count="3" />
      </div>
    </template>

    <EmptyState
      v-else-if="items.length === 0"
      variant="mobile"
      :icon="KawaiiStar"
      title="目前沒有公告"
      description="園所有新訊息時會即時推送"
    />

    <section v-else class="feed pt-section-pad-x">
      <article
        v-for="item in visibleItems"
        :key="item.id"
        class="ann-card"
        :class="{ unread: !item.is_read }"
        role="button"
        :tabindex="0"
        @click="openDetail(item)"
        @keydown.enter="openDetail(item)"
        @keydown.space.prevent="openDetail(item)"
      >
        <div class="ann-row">
          <span class="pt-pill" :class="`pt-pill-${PRIORITY_META[item.priority]?.tone || 'info'}`">
            {{ PRIORITY_META[item.priority]?.label || item.priority }}
          </span>
          <span class="time">{{ formatRelative(item.created_at) }}</span>
          <span v-if="!item.is_read" class="unread-dot" aria-label="未讀" />
        </div>
        <h2 class="title">{{ item.title }}</h2>
        <p v-if="item.content" class="preview">{{ item.content }}</p>
      </article>
    </section>

    <div v-if="hasMore" ref="sentinelRef" class="render-sentinel" aria-hidden="true" />

    <!-- 詳情 modal -->
    <AppModal v-model:open="detailOpen" labelled-by="announcement-detail-title">
      <template v-if="selected">
        <div class="detail-header">
          <span
            class="pt-pill"
            :class="`pt-pill-${PRIORITY_META[selected.priority]?.tone || 'info'}`"
          >
            {{ PRIORITY_META[selected.priority]?.label || selected.priority }}
          </span>
          <button class="close" type="button" aria-label="關閉" @click="close">
            <ParentIcon name="close" size="sm" />
          </button>
        </div>
        <h2 id="announcement-detail-title" class="detail-title">{{ selected.title }}</h2>
        <p class="detail-time">{{ formatTime(selected.created_at) }}</p>
        <div class="detail-content">{{ selected.content }}</div>
      </template>
    </AppModal>
  </PullToRefresh>
</template>

<style scoped>
.ann-view :deep(.ptr-content) {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.page-hero { margin-bottom: 4px; }
.skeleton-wrap { padding: 0 16px; display: flex; flex-direction: column; gap: 12px; }

.feed {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.render-sentinel { height: 1px; }

.ann-card {
  background: var(--pt-surface-card, #fff);
  border: 1px solid var(--pt-border-light, #ecf5f9);
  border-radius: 16px;
  padding: 14px 16px;
  cursor: pointer;
  text-align: left;
  transition: background 160ms ease, transform 120ms ease, border-color 160ms ease;
}
.ann-card:focus-visible {
  outline: 2px solid var(--brand-primary, #0d9053);
  outline-offset: 2px;
}
.ann-card:active { transform: scale(0.995); background: var(--pt-surface-mute-soft, #fefcf3); }

.ann-card.unread {
  background: linear-gradient(135deg, var(--cream, #fffcf2) 0%, #ffffff 80%);
  border-color: rgba(13, 144, 83, 0.16);
}

.ann-row {
  display: flex;
  align-items: center;
  gap: 8px;
}
.time {
  flex: 1;
  font-size: 12px;
  color: var(--pt-text-faint, #6b7280);
}
.unread-dot {
  width: 9px;
  height: 9px;
  background: var(--coral-500, #ff8b8b);
  border-radius: 50%;
}

.title {
  margin: 8px 0 0;
  font-size: 16px;
  font-weight: 700;
  color: var(--pt-text-strong);
  line-height: 1.35;
  letter-spacing: -0.005em;
}
.ann-card:not(.unread) .title { font-weight: 600; }

.preview {
  margin: 4px 0 0;
  color: var(--pt-text-body, #4b5563);
  font-size: 14px;
  line-height: 1.55;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.detail-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 18px 8px;
}
.detail-title {
  margin: 0 18px;
  font-weight: 700;
  font-size: 18px;
  color: var(--pt-text-strong);
  line-height: 1.4;
}
.close {
  position: relative;
  width: 32px;
  height: 32px;
  border: none;
  background: var(--cream, #fffcf2);
  border-radius: 50%;
  color: var(--pt-text-muted);
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}
.close::before {
  content: '';
  position: absolute;
  top: 50%;
  left: 50%;
  width: 44px;
  height: 44px;
  transform: translate(-50%, -50%);
}
.detail-time {
  margin: 4px 18px 14px;
  color: var(--pt-text-faint);
  font-size: 12px;
}
.detail-content {
  padding: 0 18px 20px;
  white-space: pre-wrap;
  line-height: 1.7;
  color: var(--pt-text-body);
  font-size: 15px;
}

@media (prefers-reduced-motion: reduce) {
  .ann-card { transition: none; }
}
</style>
