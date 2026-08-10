<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useChildrenStore } from '../stores/children'
import { useChildSelection } from '../composables/useChildSelection'
import { useHomeSummary } from '../composables/useHomeSummary'
import M3List from '../components/m3/M3List.vue'
import M3ListItem from '../components/m3/M3ListItem.vue'
import M3Divider from '../components/m3/M3Divider.vue'

const router = useRouter()
const childrenStore = useChildrenStore()
const { selectedId, ensureSelected } = useChildSelection()
const { badges, summary } = useHomeSummary()

// pending_survey_count 尚未併入 HomeBadges（該 interface 之後才擴充），
// 直接讀 summary 原始欄位，做法比照 TodayView 的 pendingSurveyCount。
const pendingSurveyCount = computed(() => {
  const v = (summary.value as { pending_survey_count?: unknown } | null)?.pending_survey_count
  return typeof v === 'number' ? v : 0
})

/**
 * 徽章語意分兩種，色調要分開，否則「今天有藥要吃」會被讀成「有事沒處理」：
 *  - action：需要家長處理或該知道結果 → 品牌綠（逾期款項轉 coral）
 *  - info：純資訊 → 中性藍
 * 數字為 0 時不顯示徽章（不要出現「0 筆」）。
 */
interface AdminItem {
  headline: string
  supportingText: string
  leadingIcon: string
  path: string
  badge: number
  badgeTone: 'action' | 'info' | 'alert'
  badgeLabel: string
}

const items = computed<AdminItem[]>(() => {
  const b = badges.value
  return [
    {
      headline: '請假',
      supportingText: '送出請假申請、查詢假單狀態',
      leadingIcon: 'event_busy',
      path: '/leaves',
      badge: b.recentLeaveReviews,
      badgeTone: 'action',
      badgeLabel: `${b.recentLeaveReviews} 筆假單有審核結果`,
    },
    {
      headline: '繳費',
      supportingText: '查詢應繳/已繳費用',
      leadingIcon: 'payments',
      path: '/fees',
      badge: b.outstandingFees,
      badgeTone: b.overdueFees > 0 ? 'alert' : 'action',
      badgeLabel:
        b.overdueFees > 0
          ? `${b.outstandingFees} 筆待繳，含逾期款項`
          : `${b.outstandingFees} 筆待繳`,
    },
    {
      headline: '用藥委託',
      supportingText: '新增/查詢委託用藥單',
      leadingIcon: 'medication',
      path: '/medications',
      badge: b.activeMedicationOrders,
      badgeTone: 'info',
      badgeLabel: `今日 ${b.activeMedicationOrders} 張用藥單`,
    },
    {
      headline: '課後才藝',
      supportingText: '才藝課程報名與紀錄',
      leadingIcon: 'palette',
      path: '/activity',
      badge: b.pendingActivityPromotions,
      badgeTone: 'action',
      badgeLabel: `${b.pendingActivityPromotions} 筆候補待確認`,
    },
    {
      headline: '待簽紀錄',
      supportingText: '需家長簽收的通知事項',
      leadingIcon: 'mark_email_read',
      path: '/events',
      badge: b.pendingEventAcks,
      badgeTone: 'action',
      badgeLabel: `${b.pendingEventAcks} 份待簽`,
    },
    {
      headline: '活動調查',
      supportingText: '戶外教學/親子活動參加意願回覆',
      leadingIcon: 'fact_check',
      path: '/surveys',
      badge: pendingSurveyCount.value,
      badgeTone: 'action',
      badgeLabel: `${pendingSurveyCount.value} 份待回覆`,
    },
  ]
})

const children = computed(() =>
  (childrenStore.items || []) as { student_id: number; name?: string }[],
)

const childProfileTarget = computed(() => {
  const sid = selectedId.value || children.value[0]?.student_id || null
  return sid ? `/children/${sid}` : null
})

const childProfileSupporting = computed(() => {
  const list = children.value
  if (list.length === 0) return '尚未綁定子女'
  if (list.length === 1) return `${list[0].name || ''} · 基本資料 / 健康 / 照片 / 報告 / 出勤`
  return `${list.length} 位 · 基本資料 / 健康 / 照片 / 報告 / 出勤`
})

function go(path: string) {
  router.push(path)
}

function goChildProfile() {
  if (childProfileTarget.value) router.push(childProfileTarget.value)
}

onMounted(async () => {
  await childrenStore.load()
  ensureSelected(children.value)
})
</script>

<template>
  <div class="admin-list-view">
    <M3List>
      <M3ListItem
        v-for="item in items"
        :key="item.path"
        :headline="item.headline"
        :supporting-text="item.supportingText"
        :leading-icon="item.leadingIcon"
        clickable
        @click="go(item.path)"
      >
        <template #trailing>
          <span class="admin-trailing">
            <span
              v-if="item.badge > 0"
              class="admin-badge"
              :class="`admin-badge-${item.badgeTone}`"
              role="status"
              :aria-label="item.badgeLabel"
            >{{ item.badge }}</span>
            <span class="material-symbols-rounded admin-chevron" aria-hidden="true">chevron_right</span>
          </span>
        </template>
      </M3ListItem>

      <M3Divider class="admin-divider" />

      <M3ListItem
        headline="孩子檔案"
        :supporting-text="childProfileSupporting"
        leading-icon="folder_shared"
        trailing-icon="chevron_right"
        :clickable="!!childProfileTarget"
        :disabled="!childProfileTarget"
        @click="goChildProfile"
      />
    </M3List>
  </div>
</template>

<style scoped>
.admin-list-view {
  padding: 8px 0 16px;
  background: var(--m3-surface, #f7fbf3);
  min-height: 100%;
}
.admin-divider {
  margin: 8px 0;
}

.admin-trailing {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}

.admin-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 22px;
  height: 22px;
  padding: 0 7px;
  border-radius: 11px;
  font-size: 13px;
  font-weight: 700;
  line-height: 1;
  color: var(--pt-on-accent, #fff);
  background: var(--m3-primary, #006d3d);
}
/* 逾期款項：唯一該讓家長心跳快一下的情況 */
.admin-badge-alert {
  background: var(--coral-700, #b14545);
}
/* 資訊性（今日用藥單）：中性藍，避免被讀成待辦 */
.admin-badge-info {
  background: var(--sky-700, #2d6f8e);
}

.admin-chevron {
  font-size: 20px;
  color: var(--pt-text-muted, #6b5e54);
  font-variation-settings: 'wght' 400;
}
</style>
