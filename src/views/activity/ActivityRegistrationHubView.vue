<script setup lang="ts">
// 報名管理入口（2026-10-29 後台 IA 重整 M4）：「報名」「異動紀錄」兩頁籤合為一頁。
// 原 /activity/changes 獨立頁（側欄「報名修改紀錄」）改為 redirect 到
// /activity/registrations?tab=changes；兩個頁籤的內容仍是既有 ActivityRegistrationView／
// ActivityChangesView（embedded 模式只拿掉各自頁首，業務邏輯與 API 呼叫不動）。
// 權限：兩頁籤 gate 同為 ACTIVITY_READ（與原兩頁的路由規則一致）。
//
// 內容用 v-if 隨頁籤掛載／卸載，而非 el-tab-pane 保活：報名頁在 onMounted 才讀
// ?open=<id>／篩選 query，異動頁點學生姓名會 push /activity/registrations?open=<id>，
// 保活的話已掛載的報名頁不會重跑 onMounted，深連結會失效。
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { hasPermission } from '@/utils/auth'
import PageHeader from '@/components/common/PageHeader.vue'
import ActivityRegistrationView from '@/views/activity/ActivityRegistrationView.vue'
import ActivityChangesView from '@/views/activity/ActivityChangesView.vue'

const route = useRoute()
const router = useRouter()

const canReadRegistrations = computed(() => hasPermission('ACTIVITY_READ'))
// 異動頁籤 gate 照原頁（manifest activityChanges 節點：sharedViews ACTIVITY_READ）
const canReadChanges = computed(() => hasPermission('ACTIVITY_READ'))

type TabKey = 'registrations' | 'changes'
const DEFAULT_TAB: TabKey = 'registrations'

function resolveTab(raw: unknown): TabKey {
  if (raw === 'changes' && canReadChanges.value) return 'changes'
  if (raw === 'registrations' && canReadRegistrations.value) return 'registrations'
  return canReadRegistrations.value ? DEFAULT_TAB : canReadChanges.value ? 'changes' : DEFAULT_TAB
}

const activeTab = ref<TabKey>(resolveTab(route.query.tab))

// 深連結／返回鍵更新 ?tab= 時同步頁籤（例如異動頁點學生姓名 → ?open=<id> 無 tab → 回報名頁籤）
watch(
  () => route.query.tab,
  (value) => {
    activeTab.value = resolveTab(value)
  },
)

// 頁籤 → 網址回寫：預設頁籤不帶 ?tab=。報名頁自己的篩選 query（search／payment_status…）原樣保留，
// 切到異動再切回來篩選還在；異動頁不讀 query，多餘的鍵無害。
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
  <div class="activity-registration-hub">
    <PageHeader title="報名管理" />

    <el-tabs v-model="activeTab" class="activity-registration-hub__tabs">
      <el-tab-pane v-if="canReadRegistrations" label="報名" name="registrations" />
      <el-tab-pane v-if="canReadChanges" label="異動紀錄" name="changes" />
    </el-tabs>

    <ActivityRegistrationView v-if="activeTab === 'registrations'" embedded />
    <ActivityChangesView v-else-if="activeTab === 'changes'" embedded />
  </div>
</template>
