<script setup>
/**
 * 才藝 hero 卡：三段統計（進行中報名 / 待繳活動費 / 即將開課）
 * 藍青資訊漸層 + 月桂葉左上。
 * IvyKids rebrand 2026-05-07（Phase 4.5）
 *
 * Props:
 *  - activeRegistrations: 進行中報名數
 *  - unpaidActivityFee: 未繳活動費合計
 *  - upcomingCount: 即將開課（最近 7 天）；MVP 暫設 0
 *
 * Emits:
 *  - scroll-section(key): 'active' | 'unpaid' | 'upcoming'
 */
import LaurelWreath from '@/components/brand/LaurelWreath.vue'

const props = defineProps({
  activeRegistrations: { type: Number, default: 0 },
  unpaidActivityFee: { type: Number, default: 0 },
  upcomingCount: { type: Number, default: 0 },
})
const emit = defineEmits(['scroll-section'])

function fmt(n) { return Number(n).toLocaleString('en-US') }
</script>

<template>
  <section class="act-hero" aria-label="才藝報名概況">
    <LaurelWreath side="left" :opacity="0.15" :size="80" class="hero-laurel" />
    <div class="act-hero-content">
      <div class="act-hero-label">才藝報名概況</div>
      <div class="act-hero-stats">
        <button type="button" class="act-hero-stat" @click="emit('scroll-section', 'active')">
          <span class="num">{{ activeRegistrations }}</span>
          <span class="lbl">進行中</span>
        </button>
        <button type="button" class="act-hero-stat" @click="emit('scroll-section', 'unpaid')">
          <span class="num">NT$ {{ fmt(unpaidActivityFee) }}</span>
          <span class="lbl">待繳</span>
        </button>
        <button v-if="upcomingCount > 0" type="button" class="act-hero-stat" @click="emit('scroll-section', 'upcoming')">
          <span class="num">{{ upcomingCount }}</span>
          <span class="lbl">即將開課</span>
        </button>
      </div>
    </div>
  </section>
</template>

<style scoped>
.act-hero {
  position: relative;
  overflow: hidden;
  isolation: isolate;
  background:
    linear-gradient(135deg, var(--pt-tint-message, var(--ivy-tile-teal-bg)) 0%, var(--pt-surface-raised, #fff) 100%);
  border: 1px solid color-mix(in srgb, var(--pt-tint-message-fg) 28%, transparent);
  border-radius: 16px;
  padding: var(--space-4, 16px);
  box-shadow: var(--m3-elev-1, var(--pt-shadow-card, var(--pt-elev-1)));
}

.hero-laurel {
  position: absolute;
  left: -10px;
  top: 4px;
  z-index: 0;
}

.act-hero-content {
  position: relative;
  z-index: 1;
}

.act-hero-label {
  font-size: 11px;
  color: var(--ivy-tile-teal-fg);
  font-weight: 700;
  letter-spacing: 0.5px;
  text-transform: uppercase;
  margin-bottom: 8px;
}

.act-hero-stats {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
  gap: 8px;
}

.act-hero-stat {
  background: var(--pt-surface-raised, rgba(255, 255, 255, 0.7));
  border: 1px solid var(--pt-page-border, rgba(51, 170, 170, 0.2));
  border-radius: var(--pt-control-radius, 12px);
  padding: 10px 6px;
  cursor: pointer;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  font-family: inherit;
  color: inherit;
}

.act-hero-stat .num {
  font-size: 16px;
  font-weight: 900;
  color: var(--m3-on-surface, var(--pt-text-strong));
}

.act-hero-stat .lbl {
  font-size: 11px;
  color: var(--m3-on-surface-variant, var(--pt-text-muted));
}
</style>
