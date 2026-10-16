<script setup lang="ts">
/**
 * 首頁「公告」預覽卡（2026-09-08 首頁改版；2026-10-14 標題由「校園公告」對齊
 * parentServices 的服務名稱「公告」）。
 *
 * 只抓最新 3 則公告做預覽，完整清單／已讀操作仍在 /announcements
 * （AnnouncementsPanel 負責，避免兩處各自實作一份已讀邏輯漂移）。
 * 相對時間格式化刻意重用 AnnouncementsPanel 原本那份既有措辭
 * （見 utils/announcementRelativeTime.ts），不重寫第二份。
 *
 * 純預覽卡：整卡／每一列點擊都導去 /announcements 列表頁，不在首頁另開
 * 詳情彈窗（詳情彈窗邏輯留在 AnnouncementsPanel + AnnouncementDetailModal，
 * 首頁沒有必要重複一份已讀狀態管理）。
 *
 * 2026-10-14（D-26）：有未讀才顯示完整卡；全部已讀時縮成一行入口「公告（全部已讀）›」，
 * 把首屏讓給待辦與今日動態。「全部已讀」不能只看最新 3 則——較舊的未讀會被誤判成
 * 已讀——所以父層可傳 `unreadTotal`（home summary 的 unread_announcements 權威值），
 * 兩者任一有未讀就維持完整卡。
 */
import { computed, onMounted, ref } from 'vue'
import { listAnnouncements, type AnnouncementCategoryBrief } from '../../api/announcements'
import { formatAnnouncementRelativeTime } from '../../utils/announcementRelativeTime'
import SectionHeader from '../SectionHeader.vue'
import SkeletonBlock from '../SkeletonBlock.vue'
import { PARENT_SERVICES } from '../../utils/parentServices'

const LIMIT = 3

interface HomeAnnouncementItem {
  id: number | string
  title: string
  is_read: boolean
  created_at: string
  category?: AnnouncementCategoryBrief | null
}

const props = withDefaults(defineProps<{
  /** home summary 的全部未讀公告數；未提供時只依最新 3 則的 is_read 判斷。 */
  unreadTotal?: number
}>(), {
  unreadTotal: 0,
})

const items = ref<HomeAnnouncementItem[]>([])
const loading = ref(false)

// 已有資料時（下拉刷新）保留現有畫面，不閃回骨架；骨架只給首次載入。
const showSkeleton = computed(() => loading.value && items.value.length === 0)
const hasUnread = computed(
  () => props.unreadTotal > 0 || items.value.some((item) => !item.is_read),
)
const collapsed = computed(() => !showSkeleton.value && items.value.length > 0 && !hasUnread.value)

async function load(): Promise<void> {
  loading.value = true
  try {
    const { data } = await listAnnouncements({ limit: LIMIT })
    items.value = ((data?.items || []) as HomeAnnouncementItem[]).slice(0, LIMIT)
  } catch {
    // 首頁預覽卡失敗不擋其他區塊：不渲染即可，完整清單仍可從 /announcements 重試
    items.value = []
  } finally {
    loading.value = false
  }
}

onMounted(load)

defineExpose({ refresh: load })
</script>

<template>
  <router-link
    v-if="collapsed"
    to="/announcements"
    class="ann-home-collapsed"
    data-testid="ann-home-collapsed"
  >
    <span class="material-symbols-rounded" aria-hidden="true">campaign</span>
    <span class="ann-home-collapsed-text">{{ PARENT_SERVICES.announce.label }}（全部已讀）</span>
    <span class="material-symbols-rounded" aria-hidden="true">chevron_right</span>
  </router-link>

  <section
    v-else-if="showSkeleton || items.length > 0"
    class="ann-home-card"
    data-testid="ann-home-card"
  >
    <SectionHeader :title="PARENT_SERVICES.announce.label">
      <template #action>
        <router-link to="/announcements" class="ann-home-more">
          更多
          <span class="material-symbols-rounded" aria-hidden="true">arrow_forward</span>
        </router-link>
      </template>
    </SectionHeader>

    <div v-if="showSkeleton" class="ann-home-skeleton">
      <SkeletonBlock variant="row" :count="3" />
    </div>

    <ul v-else class="ann-home-list">
      <li v-for="item in items" :key="item.id">
        <router-link to="/announcements" class="ann-home-row">
          <span v-if="!item.is_read" class="ann-home-dot" aria-label="未讀" />
          <span class="ann-home-body">
            <span class="ann-home-title">{{ item.title }}</span>
            <span class="ann-home-meta">
              <span
                v-if="item.category"
                class="ann-home-cat"
                :style="{ '--cat-color': item.category.color || 'var(--brand-primary, #0d9053)' }"
              >
                <span class="material-symbols-rounded" aria-hidden="true">{{ item.category.icon || 'campaign' }}</span>
                {{ item.category.name }}
              </span>
              <span class="ann-home-time">{{ formatAnnouncementRelativeTime(item.created_at) }}更新</span>
            </span>
          </span>
        </router-link>
      </li>
    </ul>
  </section>
</template>

<style scoped>
/* 完整卡與「全部已讀」一行入口共用同一組外框（背景／邊框／圓角），深色模式自動跟著換 */
.ann-home-card,
.ann-home-collapsed {
  background: var(--pt-surface-card, #fff);
  border: 1px solid var(--pt-border-light, #ecf5f9);
  border-radius: 16px;
}

.ann-home-card {
  margin: 0 var(--space-4, 16px);
  padding: var(--space-3, 12px) var(--space-4, 16px) var(--space-2, 8px);
  box-shadow: var(--pt-shadow-card, var(--pt-elev-1));
}

/* 全部已讀的一行入口：文字沿用繼承色、圖示降不透明度，比完整卡安靜 */
.ann-home-collapsed {
  display: flex;
  align-items: center;
  gap: var(--space-2, 8px);
  min-height: var(--touch-target-min, 44px);
  margin: 0 var(--space-4, 16px);
  padding: 0 var(--space-4, 16px);
  box-sizing: border-box;
  color: inherit;
  text-decoration: none;
  font-size: 0.875rem;
  font-weight: 600;
}
.ann-home-collapsed .material-symbols-rounded {
  font-size: 20px;
  font-variation-settings: 'wght' 500;
  opacity: 0.6;
}
.ann-home-collapsed-text { flex: 1; min-width: 0; }

.ann-home-more {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  background: transparent;
  border: none;
  color: var(--brand-primary, #0d9053);
  font-size: var(--text-sm, 13px);
  font-weight: 600;
  cursor: pointer;
  padding: var(--space-1, 4px) 0;
  text-decoration: none;
}
.ann-home-more .material-symbols-rounded {
  font-size: 18px;
  font-variation-settings: 'wght' 500;
}

.ann-home-skeleton { padding: var(--space-2, 8px) 0; }

.ann-home-list {
  display: flex;
  flex-direction: column;
  /* 清掉瀏覽器預設 bullet 與縮排：原本黑點和未讀紅點疊成雙點，左側多縮約 40px */
  list-style: none;
  margin: 0;
  padding: 0;
}
.ann-home-list li + li {
  border-top: 1px solid var(--pt-border-light, #ecf5f9);
}

.ann-home-row {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: var(--space-2, 8px) 0;
  text-decoration: none;
  color: inherit;
  min-height: 44px;
}

.ann-home-dot {
  flex-shrink: 0;
  width: 8px;
  height: 8px;
  margin-top: 6px;
  border-radius: 50%;
  background: var(--coral-500, #ff8b8b);
}

.ann-home-body {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
  flex: 1;
}

.ann-home-title {
  font-size: var(--text-base, 15px);
  font-weight: 700;
  color: var(--pt-text-strong);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.ann-home-meta {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.ann-home-cat {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  padding: 1px 8px 1px 6px;
  border-radius: 999px;
  font-size: 0.7188rem;
  font-weight: 600;
  color: var(--cat-color);
  background: color-mix(in srgb, var(--cat-color) 14%, transparent);
}
.ann-home-cat .material-symbols-rounded {
  font-size: 14px;
}

.ann-home-time {
  font-size: 0.75rem;
  color: var(--pt-text-faint, #6b7280);
}
</style>
