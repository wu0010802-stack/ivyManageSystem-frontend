<script setup lang="ts">
/**
 * 首頁「校園公告」預覽卡（2026-09-08 首頁改版）。
 *
 * 只抓最新 3 則公告做預覽，完整清單／已讀操作仍在 /announcements
 * （AnnouncementsPanel 負責，避免兩處各自實作一份已讀邏輯漂移）。
 * 相對時間格式化刻意重用 AnnouncementsPanel 原本那份既有措辭
 * （見 utils/announcementRelativeTime.ts），不重寫第二份。
 *
 * 純預覽卡：整卡／每一列點擊都導去 /announcements 列表頁，不在首頁另開
 * 詳情彈窗（詳情彈窗邏輯留在 AnnouncementsPanel + AnnouncementDetailModal，
 * 首頁沒有必要重複一份已讀狀態管理）。
 */
import { onMounted, ref } from 'vue'
import { listAnnouncements, type AnnouncementCategoryBrief } from '../../api/announcements'
import { formatAnnouncementRelativeTime } from '../../utils/announcementRelativeTime'
import SectionHeader from '../SectionHeader.vue'
import SkeletonBlock from '../SkeletonBlock.vue'

const LIMIT = 3

interface HomeAnnouncementItem {
  id: number | string
  title: string
  is_read: boolean
  created_at: string
  category?: AnnouncementCategoryBrief | null
}

const items = ref<HomeAnnouncementItem[]>([])
const loading = ref(false)

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
  <section v-if="loading || items.length > 0" class="ann-home-card" data-testid="ann-home-card">
    <SectionHeader title="校園公告">
      <template #action>
        <router-link to="/announcements" class="ann-home-more">
          更多
          <span class="material-symbols-rounded" aria-hidden="true">arrow_forward</span>
        </router-link>
      </template>
    </SectionHeader>

    <div v-if="loading" class="ann-home-skeleton">
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
.ann-home-card {
  margin: 0 var(--space-4, 16px);
  padding: var(--space-3, 12px) var(--space-4, 16px) var(--space-2, 8px);
  background: var(--pt-surface-card, #fff);
  border: 1px solid var(--pt-border-light, #ecf5f9);
  border-radius: 16px;
  box-shadow: var(--pt-shadow-card, var(--pt-elev-1));
}

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
  font-size: 11.5px;
  font-weight: 600;
  color: var(--cat-color);
  background: color-mix(in srgb, var(--cat-color) 14%, transparent);
}
.ann-home-cat .material-symbols-rounded {
  font-size: 14px;
}

.ann-home-time {
  font-size: 12px;
  color: var(--pt-text-faint, #6b7280);
}
</style>
