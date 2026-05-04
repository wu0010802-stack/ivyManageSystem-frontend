<script setup>
/**
 * 費用 hero 卡：未繳合計 + 最近到期 + 跳到應繳 CTA（暖橘漸層）。
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
const props = defineProps({
  unpaidTotal: { type: Number, default: 0 },
  unpaidCount: { type: Number, default: 0 },
  nearestDueDate: { type: String, default: '' },
  overdueAmount: { type: Number, default: 0 },
})
const emit = defineEmits(['jump-unpaid'])

function fmt(n) { return Number(n).toLocaleString('en-US') }
</script>

<template>
  <section class="fee-hero">
    <div class="fee-hero-blob" aria-hidden="true" />
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
  background: var(--pt-gradient-warm);
  color: #78350f;
  border-radius: 16px;
  padding: 20px;
  box-shadow: var(--pt-elev-2);
  border: var(--pt-hairline);
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}
.fee-hero-blob {
  position: absolute;
  width: 160px;
  height: 160px;
  background: rgba(255, 255, 255, 0.5);
  border-radius: 50%;
  filter: blur(40px);
  top: -50px;
  right: -50px;
  pointer-events: none;
}
.fee-hero-content {
  position: relative;
  z-index: 1;
}
.fee-hero-label {
  font-size: 12px;
  opacity: 0.85;
  letter-spacing: 0.04em;
}
.fee-hero-amount {
  display: flex;
  align-items: baseline;
  gap: 4px;
  margin-top: 2px;
}
.fee-hero-currency {
  font-size: 13px;
  opacity: 0.85;
}
.fee-hero-num {
  font-size: 28px;
  font-weight: 700;
}
.fee-hero-overdue {
  font-size: 12px;
  margin-top: 4px;
  color: #b91c1c;
  font-weight: 600;
}
.fee-hero-due {
  font-size: 12px;
  margin-top: 4px;
  opacity: 0.85;
}
.fee-hero-cta {
  position: relative;
  z-index: 1;
  background: rgba(255, 255, 255, 0.95);
  color: #b45309;
  border: none;
  padding: 8px 14px;
  border-radius: 99px;
  font-weight: 600;
  cursor: pointer;
}
.fee-hero-cta:hover {
  background: #fff;
}
</style>
