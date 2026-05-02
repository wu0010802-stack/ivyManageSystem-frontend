<script setup>
/**
 * 請假 hero 卡：本學期請假天數彙總（深綠漸層）。
 */
const props = defineProps({
  summary: {
    type: Object,
    required: true,
    // { total_used: number, by_type: { sick, personal, ... }, semester_label: string }
  },
})

const TYPE_LABEL = {
  sick: '病假',
  personal: '事假',
  official: '公假',
  funeral: '喪假',
  marriage: '婚假',
  maternity: '產假',
  other: '其他',
}
</script>

<template>
  <section class="leave-hero">
    <div class="leave-hero-blob leave-hero-blob-a" aria-hidden="true" />
    <div class="leave-hero-blob leave-hero-blob-b" aria-hidden="true" />
    <div class="leave-hero-content">
      <div class="leave-hero-main">
        <span class="leave-hero-label">{{ summary.semester_label || '本學期' }}</span>
        <div class="leave-hero-num">
          <span class="leave-hero-num-val">{{ summary.total_used ?? 0 }}</span>
          <span class="leave-hero-num-unit">天</span>
        </div>
        <span class="leave-hero-sub">已請</span>
      </div>
      <div class="leave-hero-chips">
        <span
          v-for="(days, key) in summary.by_type"
          :key="key"
          class="leave-hero-chip"
        >
          {{ TYPE_LABEL[key] ?? key }} {{ days }}
        </span>
      </div>
    </div>
    <div class="leave-hero-action">
      <slot name="action" />
    </div>
  </section>
</template>

<style scoped>
.leave-hero {
  position: relative;
  overflow: hidden;
  background: var(--pt-gradient-hero);
  color: #fff;
  border-radius: 16px;
  padding: 20px;
  box-shadow: var(--pt-elev-2);
  border: var(--pt-hairline);
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 12px;
}
.leave-hero-blob {
  position: absolute;
  border-radius: 50%;
  filter: blur(40px);
  opacity: 0.35;
  pointer-events: none;
}
.leave-hero-blob-a {
  width: 160px; height: 160px;
  background: rgba(255, 255, 255, 0.4);
  top: -40px; right: -40px;
}
.leave-hero-blob-b {
  width: 120px; height: 120px;
  background: rgba(180, 233, 192, 0.5);
  bottom: -30px; left: -30px;
}
.leave-hero-content { position: relative; z-index: 1; }
.leave-hero-label {
  display: block;
  font-size: 12px;
  opacity: 0.85;
  letter-spacing: 0.04em;
  margin-bottom: 4px;
}
.leave-hero-num {
  display: flex;
  align-items: baseline;
  gap: 4px;
}
.leave-hero-num-val { font-size: 36px; font-weight: 700; line-height: 1; }
.leave-hero-num-unit { font-size: 14px; opacity: 0.85; }
.leave-hero-sub { display: block; font-size: 12px; opacity: 0.85; margin-top: 2px; }
.leave-hero-chips {
  display: flex; flex-wrap: wrap; gap: 6px; margin-top: 12px;
}
.leave-hero-chip {
  background: rgba(255, 255, 255, 0.2);
  padding: 3px 10px;
  border-radius: 99px;
  font-size: 12px;
}
.leave-hero-action { position: relative; z-index: 1; }
</style>
