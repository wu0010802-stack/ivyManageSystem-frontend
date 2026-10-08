<script setup lang="ts">
/**
 * 「待辦」tab（路由 /admin，2026-10-08 由「事務」改版）。
 *
 * 改版前是 8 列平鋪、順序寫死、各自掛徽章的清單：家長得逐列看紅點才知道哪件
 * 事要先處理，入學文件簽署與出席紀錄、常見問題則根本不在清單裡。現在分三段：
 *  1. 待處理：與首頁「待你處理」同一份 buildPendingItems()，依急迫度排序
 *  2. 進行中：今日用藥單、臨時接送授權（資訊性，不計徽章）
 *  3. 所有服務：每個功能一個固定入口，名稱／圖示取自 parentServices.ts
 *
 * F5（沿用）：summary 失敗時不能把計數 fallback 成 0 當成「都處理完了」（含逾期
 * 款項），首次載入的 pending／error 會擋住「待處理」段並給可重試的錯誤態；
 * 「所有服務」是靜態入口，不受 summary 失敗影響，照常顯示。
 */
import { computed } from 'vue'
import { usePendingItems } from '../composables/usePendingItems'
import { ALL_SERVICES_ORDER, PARENT_SERVICES } from '../utils/parentServices'
import type { PendingItem } from '../utils/pendingItems'
import PendingInbox from '../components/home/PendingInbox.vue'
import SkeletonBlock from '../components/SkeletonBlock.vue'
import MobileErrorRetry from '@/components/common/MobileErrorRetry.vue'

const {
  badges,
  data: summaryData,
  error: summaryError,
  pending: summaryPending,
  items: pendingItems,
  pickupActiveCount,
  refreshAll,
} = usePendingItems()

const ongoingItems = computed<PendingItem[]>(() => {
  const out: PendingItem[] = []
  const meds = badges.value.activeMedicationOrders
  if (meds > 0) {
    out.push({
      key: 'medications',
      title: PARENT_SERVICES.medications.label,
      detail: `今天有 ${meds} 張用藥單`,
      icon: PARENT_SERVICES.medications.icon,
      tone: 'info',
      path: PARENT_SERVICES.medications.route,
      count: 0,
    })
  }
  if (pickupActiveCount.value > 0) {
    out.push({
      key: 'pickupAuth',
      title: PARENT_SERVICES.proxy.label,
      detail: `${pickupActiveCount.value} 筆授權進行中`,
      icon: PARENT_SERVICES.proxy.icon,
      tone: 'info',
      path: PARENT_SERVICES.proxy.route,
      count: 0,
    })
  }
  return out
})

const services = ALL_SERVICES_ORDER.map((key) => ({ key, ...PARENT_SERVICES[key] }))

function retry(): void {
  void refreshAll(true)
}
</script>

<template>
  <div class="admin-list-view">
    <div v-if="summaryPending && !summaryData" class="skeleton-wrap">
      <SkeletonBlock variant="row" :count="3" />
    </div>

    <MobileErrorRetry
      v-else-if="summaryError && !summaryData"
      :error="summaryError"
      @retry="retry"
    />

    <template v-else>
      <PendingInbox title="待處理" :items="pendingItems" empty-text="目前沒有要處理的事" />
      <PendingInbox v-if="ongoingItems.length" title="進行中" :items="ongoingItems" />
    </template>

    <section class="svc" aria-labelledby="svc-title">
      <h2 id="svc-title" class="pt-section-title">所有服務</h2>
      <div class="svc-grid">
        <router-link
          v-for="s in services"
          :key="s.key"
          :to="s.route"
          class="svc-item"
          :data-service="s.key"
        >
          <span class="svc-icon" :class="`tone-${s.tone}`">
            <span class="material-symbols-rounded" aria-hidden="true">{{ s.icon }}</span>
          </span>
          <span class="svc-label">{{ s.label }}</span>
          <span class="svc-sub">{{ s.sub }}</span>
        </router-link>
      </div>
    </section>
  </div>
</template>

<style scoped>
.admin-list-view {
  display: flex;
  flex-direction: column;
  gap: var(--space-5, 20px);
  padding: var(--space-2, 8px) var(--space-4, 16px) var(--space-8, 32px);
  min-height: 100%;
}
.skeleton-wrap {
  display: flex;
  flex-direction: column;
  gap: var(--space-3, 12px);
}

.svc-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: var(--space-2, 8px);
}
.svc-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  min-height: 96px;
  padding: var(--space-3, 12px) 4px;
  box-sizing: border-box;
  border-radius: 20px;
  background: var(--pt-surface-card);
  box-shadow: var(--pt-shadow-card);
  color: inherit;
  text-align: center;
  text-decoration: none;
}
.svc-icon {
  width: 40px;
  height: 40px;
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
}
.svc-icon .material-symbols-rounded { font-size: 22px; }
.svc-icon.tone-amber { background: var(--pt-accent-sun-container); color: var(--pt-accent-sun-on); }
.svc-icon.tone-coral { background: var(--pt-accent-coral-container); color: var(--pt-accent-coral-on); }
.svc-icon.tone-sky { background: var(--pt-accent-sky-container); color: var(--pt-accent-sky-on); }
.svc-icon.tone-leaf { background: var(--pt-accent-leaf-container); color: var(--pt-accent-leaf-on); }
.svc-icon.tone-grape { background: var(--pt-accent-grape-container); color: var(--pt-accent-grape-on); }
.svc-icon.tone-brand { background: var(--m3-primary-container); color: var(--m3-on-primary-container); }
.svc-icon.tone-teal { background: var(--pt-tint-pickup); color: var(--pt-tint-pickup-fg); }
.svc-label { font-size: 14px; font-weight: 800; }
.svc-sub { font-size: 11px; font-weight: 600; opacity: 0.72; line-height: 1.3; }
</style>
