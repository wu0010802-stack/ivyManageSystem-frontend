<script setup>
/**
 * 請假 hero 卡：本學期請假天數彙總（cream/leaf 漸層 + 月桂葉 + KawaiiStar）。
 * IvyKids rebrand 2026-05-07（Phase 4.1）
 *
 * Props:
 *  - summary: Object（必填）
 *    { total_used: number, by_type: { sick, personal, ... }, semester_label: string }
 */
import LaurelWreath from '@/components/brand/LaurelWreath.vue'
import KawaiiStar from '@/components/brand/KawaiiStar.vue'

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
  <section class="leave-hero" aria-label="請假概況">
    <LaurelWreath side="left" :opacity="0.18" :size="80" class="hero-laurel" />
    <KawaiiStar :size="32" decorative class="hero-star" />
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
  isolation: isolate;
  background:
    linear-gradient(135deg, var(--pt-surface-raised, #fff) 0%, var(--pt-surface-recessed, #f5fbe6) 100%);
  border: 1px solid var(--pt-page-border, rgba(90, 168, 66, 0.15));
  border-radius: var(--pt-card-radius, 14px);
  padding: var(--space-4, 16px) var(--space-3, 12px) var(--space-4, 16px) var(--space-4, 16px);
  box-shadow: var(--pt-shadow-card, var(--pt-elev-1));
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 12px;
}

.hero-laurel {
  position: absolute;
  left: -10px;
  top: 4px;
  z-index: 0;
}

.hero-star {
  position: absolute;
  right: var(--space-3, 12px);
  top: 10px;
  z-index: 0;
}

.leave-hero-content {
  position: relative;
  z-index: 1;
}

.leave-hero-label {
  display: block;
  font-size: 11px;
  color: var(--ivy-green-laurel);
  font-weight: 700;
  letter-spacing: 0.5px;
  text-transform: uppercase;
}

.leave-hero-num {
  display: flex;
  align-items: baseline;
  gap: 4px;
  margin-top: 4px;
}

.leave-hero-num-val {
  font-size: 36px;
  font-weight: 900;
  line-height: 1;
  color: var(--pt-text-strong);
}

.leave-hero-num-unit {
  font-size: 14px;
  color: var(--pt-text-muted);
}

.leave-hero-sub {
  display: block;
  font-size: 12px;
  color: var(--pt-text-muted);
  margin-top: 2px;
}

.leave-hero-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 12px;
}

.leave-hero-chip {
  background: var(--pt-tint-brand, rgba(90, 168, 66, 0.12));
  color: var(--ivy-green-laurel);
  padding: 3px 10px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 600;
}

.leave-hero-action {
  position: relative;
  z-index: 1;
}
</style>
