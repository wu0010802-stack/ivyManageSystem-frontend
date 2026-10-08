<script setup lang="ts">
/**
 * 「待辦」tab（路由 /admin，2026-10-08 由「事務」改版）。
 *
 * 改版前是 11 列平鋪、順序寫死、各自掛徽章的清單：家長得逐列看紅點才知道哪件
 * 事要先處理。現在分兩段：
 *  1. 待處理：與首頁同一支 HomeTodoList（資料來源 useParentTodos），標題改
 *     「待處理」、沒有待辦時明確顯示「目前沒有要處理的事」
 *  2. 所有服務：每個功能一個固定入口，名稱／圖示取自 parentServices.ts
 *
 * F5（沿用）：summary 失敗時不能把計數 fallback 成 0 當成「都處理完了」（含逾期
 * 款項）——HomeTodoList 在首次載入失敗時顯示可重試錯誤態、不顯示空狀態；
 * 「所有服務」是靜態入口，不受 summary 失敗影響，照常顯示。
 *
 * 今日用藥單是資訊、不是待辦（2026-09-26 起不計入 tab 徽章），改用「用藥委託」
 * 格的副標告知「今天 N 張」，不另開一段。
 */
import { computed } from 'vue'
import { useHomeSummary } from '../composables/useHomeSummary'
import { ALL_SERVICES_ORDER, PARENT_SERVICES } from '../utils/parentServices'
import HomeTodoList from '../components/home/HomeTodoList.vue'

const { badges } = useHomeSummary()

const services = computed(() =>
  ALL_SERVICES_ORDER.map((key) => {
    const s = { key, ...PARENT_SERVICES[key] }
    const meds = badges.value.activeMedicationOrders
    if (key === 'medications' && meds > 0) return { ...s, sub: `今天 ${meds} 張用藥單` }
    return s
  }),
)
</script>

<template>
  <div class="admin-list-view">
    <HomeTodoList title="待處理" empty-text="目前沒有要處理的事" class="admin-todo" />

    <section class="svc" aria-labelledby="svc-title">
      <h3 id="svc-title" class="pt-section-title">所有服務</h3>
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
  padding: var(--space-2, 8px) 0 var(--space-8, 32px);
  min-height: 100%;
}

.svc {
  display: flex;
  flex-direction: column;
  gap: var(--space-2, 8px);
  padding: 0 var(--space-4, 16px);
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
/* 色調語意對齊 parentServices.ts 的 ServiceTone（與 QuickActionsBar 同一組對照） */
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
