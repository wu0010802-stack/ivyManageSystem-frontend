<script setup lang="ts">
/**
 * 費用 hero 卡：未繳合計 + 最近到期 + 跳到應繳 CTA（暖黃漸層 + 月桂葉右下）。
 * IvyKids rebrand 2026-05-07（Phase 4.3）
 *
 * Props:
 *  - unpaidTotal: 未繳金額合計
 *  - unpaidCount: 未繳筆數（控制 CTA 與 due 行顯示）
 *  - nearestDueDate: 最近到期日字串
 *  - overdueAmount: 已逾期金額（>0 顯示警示）
 *
 * Emits:
 *  - jump-unpaid: CTA 點擊；父層負責 scrollIntoView 到 [data-unpaid-anchor]
 */

withDefaults(defineProps<{
  unpaidTotal?: number
  unpaidCount?: number
  nearestDueDate?: string
  overdueAmount?: number
}>(), {
  unpaidTotal: 0,
  unpaidCount: 0,
  nearestDueDate: '',
  overdueAmount: 0,
})
const emit = defineEmits<{
  'jump-unpaid': []
}>()

function fmt(n: number): string { return Number(n).toLocaleString('en-US') }
</script>

<template>
  <section class="fee-hero">
    <img src="/LOGO.png" alt="" aria-hidden="true" class="hero-laurel" style="width: 80px; height: 80px; opacity: 0.15">
    <div class="fee-hero-content">
      <span class="fee-hero-label">未繳合計</span>
      <div class="fee-hero-amount">
        <span class="fee-hero-currency">NT$</span>
        <span class="fee-hero-num">{{ fmt(unpaidTotal) }}</span>
      </div>
      <p v-if="overdueAmount > 0" class="fee-hero-overdue">
        ⚠ 已逾期 NT$ {{ fmt(overdueAmount) }}
      </p>
      <p v-if="nearestDueDate && unpaidCount > 0" class="fee-hero-due">
        最近到期：{{ nearestDueDate }}（共 {{ unpaidCount }} 筆）
      </p>
    </div>
    <button
      v-if="unpaidCount > 0"
      type="button"
      class="fee-hero-cta"
      @click="emit('jump-unpaid')"
    >
      跳到應繳
    </button>
  </section>
</template>

<style scoped>
.fee-hero {
  position: relative;
  overflow: hidden;
  isolation: isolate;
  background:
    linear-gradient(135deg, var(--pt-tint-sun, var(--ivy-tile-yellow-bg)) 0%, var(--pt-surface-raised, #fff) 100%);
  border: 1px solid color-mix(in srgb, var(--ivy-tile-yellow-fg) 28%, transparent);
  border-radius: 16px;
  padding: var(--space-4, 16px);
  box-shadow: var(--m3-elev-1, var(--pt-shadow-card, var(--pt-elev-1)));
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.hero-laurel {
  position: absolute;
  right: -10px;
  bottom: 4px;
  z-index: 0;
}

.fee-hero-content {
  position: relative;
  z-index: 1;
  /* flex 子項預設 min-width:auto 不可縮，大金額 + 窄機時整列會被撐出畫面 */
  min-width: 0;
}

.fee-hero-label {
  display: block;
  font-size: 12px;
  color: var(--ivy-tile-yellow-fg);
  font-weight: 700;
  letter-spacing: 0.5px;
  text-transform: uppercase;
}

.fee-hero-amount {
  display: flex;
  align-items: baseline;
  gap: 4px;
  margin-top: 4px;
}

.fee-hero-currency {
  font-size: 13px;
  color: var(--m3-on-surface-variant, var(--pt-text-muted));
  font-weight: 600;
}

.fee-hero-num {
  font-size: 32px;
  font-weight: 900;
  color: var(--m3-on-surface, var(--pt-text-strong));
  font-variant-numeric: tabular-nums;
  overflow-wrap: anywhere;
}

.fee-hero-overdue {
  font-size: 12px;
  margin-top: 4px;
  color: var(--ivy-tile-pink-fg);
  font-weight: 700;
}

.fee-hero-due {
  font-size: 12px;
  margin-top: 4px;
  color: var(--m3-on-surface-variant, var(--pt-text-muted));
}

.fee-hero-cta {
  position: relative;
  z-index: 1;
  background: var(--pt-surface-raised, rgba(255, 255, 255, 0.9));
  color: var(--ivy-tile-yellow-fg);
  border: 1px solid color-mix(in srgb, var(--ivy-tile-yellow-fg) 28%, transparent);
  padding: 8px 14px;
  border-radius: 999px;
  font-weight: 700;
  font-size: 13px;
  cursor: pointer;
  white-space: nowrap;
  flex-shrink: 0;
}

.fee-hero-cta:hover {
  background: rgba(255, 255, 255, 1);
}
</style>
