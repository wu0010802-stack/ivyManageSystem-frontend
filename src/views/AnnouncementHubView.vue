<script setup lang="ts">
// 公告管理入口（2026-10-29 後台 IA 重整 M1）：「公告」與「分類」兩頁籤合為一頁。
// 原 /announcement-categories 獨立頁改為 redirect 到 /announcements?tab=categories。
// 兩個頁籤的內容仍是既有 AnnouncementView／AnnouncementCategoryView（embedded 模式只拿掉
// 各自的頁首，業務邏輯與 API 呼叫不動）。權限：兩頁籤 gate 同為 ANNOUNCEMENTS_READ
// （與原路由規則一致）；分類的寫入鈕仍由 AnnouncementCategoryView 內 ANNOUNCEMENTS_WRITE 控制。
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { hasPermission } from '@/utils/auth'
import PageHeader from '@/components/common/PageHeader.vue'
import AnnouncementView from '@/views/AnnouncementView.vue'
import AnnouncementCategoryView from '@/views/AnnouncementCategoryView.vue'

const route = useRoute()
const router = useRouter()

const canReadAnnouncements = computed(() => hasPermission('ANNOUNCEMENTS_READ'))
// 分類頁籤 gate 照原頁（manifest announcementCategories 節點：sharedViews ANNOUNCEMENTS_READ）
const canReadCategories = computed(() => hasPermission('ANNOUNCEMENTS_READ'))

type TabKey = 'announcements' | 'categories'
const DEFAULT_TAB: TabKey = 'announcements'

function resolveTab(raw: unknown): TabKey {
  if (raw === 'categories' && canReadCategories.value) return 'categories'
  if (raw === 'announcements' && canReadAnnouncements.value) return 'announcements'
  return canReadAnnouncements.value ? DEFAULT_TAB : canReadCategories.value ? 'categories' : DEFAULT_TAB
}

const activeTab = ref<TabKey>(resolveTab(route.query.tab))

// 返回／深連結更新 ?tab= 時同步頁籤
watch(
  () => route.query.tab,
  (value) => {
    activeTab.value = resolveTab(value)
  },
)

// 頁籤 → 網址回寫：預設頁籤不帶 ?tab=，維持 /announcements 原網址乾淨；保留其他 query。
watch(activeTab, async (value) => {
  const current = typeof route.query.tab === 'string' ? route.query.tab : undefined
  if (value === (current ?? DEFAULT_TAB)) return
  const nextQuery = { ...route.query } as Record<string, string | (string | null)[] | null>
  if (value === DEFAULT_TAB) delete nextQuery.tab
  else nextQuery.tab = value
  await router.replace({ query: nextQuery })
})
</script>

<template>
  <div class="announcement-hub">
    <PageHeader title="公告管理" />

    <el-tabs v-model="activeTab" class="announcement-hub__tabs">
      <el-tab-pane v-if="canReadAnnouncements" label="公告" name="announcements" lazy>
        <AnnouncementView embedded />
      </el-tab-pane>
      <el-tab-pane v-if="canReadCategories" label="分類" name="categories" lazy>
        <AnnouncementCategoryView embedded />
      </el-tab-pane>
    </el-tabs>
  </div>
</template>
