<script setup lang="ts">
/**
 * 園所公告清單面板。
 *
 * 2026-08-28 訊息功能下架後，公告有兩個顯示位置：
 *  - `/announcements` 獨立頁（AnnouncementsView，推播深連結落點）
 *  - 聯絡簿頁（ContactBookView）的第二個分頁
 * 兩處共用這一份面板，避免清單／分頁／已讀邏輯出現兩份實作而漂移。
 *
 * `#hero` slot 讓獨立頁掛自己的 page hero（帶未讀數），嵌在聯絡簿頁時留空。
 * 未讀數透過 `unread-change` 往上送，供外層分頁標籤顯示。
 */
import { computed, onMounted, ref, watch } from 'vue'
import { getUnreadCount, listAnnouncements, markRead } from '../../api/announcements'
import { toast } from '../../utils/toast'
import PullToRefresh from '../PullToRefresh.vue'
import SkeletonBlock from '../SkeletonBlock.vue'
import EmptyState from '@/components/common/EmptyState.vue'
import KawaiiStar from '@/components/brand/KawaiiStar.vue'
import AnnouncementDetailModal from './AnnouncementDetailModal.vue'
import { useIncrementalRender } from '../../composables/useIncrementalRender'

type AnnItem = { id: number | string; priority: string; is_read: boolean; created_at: string; title: string; content?: string }

const emit = defineEmits<{ (e: 'unread-change', count: number): void }>()

// 後端一頁的筆數；跟 useIncrementalRender 的 pageSize（本地漸進渲染批次）是
// 兩個不同層次的分頁，刻意分開：後端一次抓 50 筆省 request 數，本地再切成
// 20 一批漸進揭露以維持捲動流暢。
const PAGE_LIMIT = 50

const items = ref<AnnItem[]>([])
const loading = ref(false)
const loadingMore = ref(false)
const total = ref(0)
// 未讀數以後端權威值（/announcements/unread-count）為準，不是
// items.filter(...).length——那只算「目前已載入的這一批」，筆數一多就會
// 跟外層分頁標籤／tab badge（後端全量）永遠對不上。
const unreadCount = ref(0)
const selected = ref<AnnItem | null>(null)

watch(unreadCount, (n) => emit('unread-change', n), { immediate: true })

const { visible: _visibleRaw, sentinelRef, hasMore: hasMoreLocal } = useIncrementalRender(items as unknown as import('vue').Ref<unknown[]>, { pageSize: 20 })
const visibleItems = computed(() => _visibleRaw.value as AnnItem[])

// 後端是否還有本地陣列沒抓到的資料
const hasMoreOnServer = computed(() => items.value.length < total.value)
// 本地批次還沒揭露完，或後端還有更多可抓，都要讓 sentinel 留在畫面上
const showSentinel = computed(() => hasMoreLocal.value || hasMoreOnServer.value)
const noMoreLabel = computed(
  () => items.value.length > 0 && !hasMoreLocal.value && !hasMoreOnServer.value,
)

const detailOpen = computed({
  get: () => selected.value !== null,
  set: (v) => { if (!v) selected.value = null },
})

const PRIORITY_META: Record<string, { label: string; tone: string }> = {
  normal:    { label: '一般', tone: 'info' },
  important: { label: '重要', tone: 'warn' },
  urgent:    { label: '緊急', tone: 'danger' },
}

async function refreshUnreadCount() {
  try {
    const { data } = await getUnreadCount()
    unreadCount.value = (data as Record<string, unknown>)?.unread_count as number || 0
  } catch { /* ignore：badge 本來就是輔助資訊，抓不到就維持舊值 */ }
}

async function fetchData() {
  loading.value = true
  try {
    const [{ data }] = await Promise.all([
      listAnnouncements({ limit: PAGE_LIMIT }),
      refreshUnreadCount(),
    ])
    items.value = (data?.items || []) as AnnItem[]
    total.value = typeof data?.total === 'number' ? data.total : items.value.length
  } catch (err: unknown) {
    const e = err as Record<string, unknown>
    toast.error(String(e?.displayMessage || '載入失敗'))
  } finally {
    loading.value = false
  }
}

async function fetchMore() {
  if (loadingMore.value || !hasMoreOnServer.value) return
  loadingMore.value = true
  try {
    const { data } = await listAnnouncements({ limit: PAGE_LIMIT, skip: items.value.length })
    const more = (data?.items || []) as AnnItem[]
    // 用 push（原地變更）而非整批重新指派：useIncrementalRender 內部的
    // watch(itemsRef) 只在「換了一個新陣列參考」時才 reset 漸進渲染進度，
    // push 不會觸發，使用者已展開的捲動進度不會被打回第一批。
    items.value.push(...more)
    if (typeof data?.total === 'number') total.value = data.total
  } catch (err: unknown) {
    const e = err as Record<string, unknown>
    toast.error(String(e?.displayMessage || '載入更多失敗'))
  } finally {
    loadingMore.value = false
  }
}

// 本地批次揭露完（hasMoreLocal 轉 false）且後端還有更多時，自動接著抓下一頁。
watch(hasMoreLocal, (v) => {
  if (!v && hasMoreOnServer.value) fetchMore()
})

async function openDetail(item: AnnItem) {
  selected.value = item
  if (!item.is_read) {
    try {
      await markRead(item.id as number)
      item.is_read = true
      // 樂觀遞減：使用者當下體感立即少一則未讀；權威值下次 fetchData 時會再校正。
      if (unreadCount.value > 0) unreadCount.value -= 1
    } catch { /* ignore */ }
  }
}

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
  } catch { return s ? s.replace('T', ' ').slice(0, 16) : '' }
}

onMounted(fetchData)

async function pullRefresh() { await fetchData() }

defineExpose({ refresh: fetchData })
</script>

<template>
  <PullToRefresh :on-refresh="pullRefresh" class="ann-view">
    <slot name="hero" :unread-count="unreadCount" :total="items.length" />

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

    <div v-if="showSentinel" ref="sentinelRef" class="render-sentinel" aria-hidden="true" />

    <p v-if="loadingMore" data-testid="ann-loading-more" class="pagination-status">
      載入更多中…
    </p>
    <p v-else-if="noMoreLabel" data-testid="ann-no-more" class="pagination-status">
      已顯示全部公告
    </p>

    <AnnouncementDetailModal v-model="detailOpen" :announcement="selected" />
  </PullToRefresh>
</template>

<style scoped>
.ann-view :deep(.ptr-content) {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.skeleton-wrap { padding: 0 16px; display: flex; flex-direction: column; gap: 12px; }

.feed {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.render-sentinel { height: 1px; }

.pagination-status {
  margin: 4px 0 0;
  padding: 12px 0 20px;
  text-align: center;
  font-size: 12.5px;
  color: var(--pt-text-faint, #9b8d83);
}

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
  background: linear-gradient(135deg, var(--cream, #fffcf2) 0%, var(--pt-surface-card, #ffffff) 80%);
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

@media (prefers-reduced-motion: reduce) {
  .ann-card { transition: none; }
}
</style>
