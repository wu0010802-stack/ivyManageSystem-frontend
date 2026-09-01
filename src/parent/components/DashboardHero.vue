<!-- src/parent/components/DashboardHero.vue -->
<script setup lang="ts">
import StatusPill from './StatusPill.vue'

defineProps<{
  eyebrow?: string
  title: string
  value?: string
  sub?: string
  statusLabel?: string
  statusTone?: 'ok' | 'warn' | 'danger' | 'neutral' | 'info'
}>()
</script>

<template>
  <section class="dash-hero">
    <img src="/LOGO.png" alt="" aria-hidden="true" class="dash-hero-laurel" style="width: 120px; height: 120px; opacity: 0.14">
    <div class="dash-hero-body">
      <p v-if="eyebrow" class="dash-hero-eyebrow">{{ eyebrow }}</p>
      <h2 class="dash-hero-title">{{ title }}</h2>
      <p v-if="value" class="dash-hero-value">{{ value }}</p>
      <p v-if="sub" class="dash-hero-sub">{{ sub }}</p>
      <StatusPill v-if="statusLabel" class="dash-hero-pill" :tone="statusTone ?? 'neutral'" :label="statusLabel" />
    </div>
  </section>
</template>

<style scoped>
.dash-hero {
  position: relative;
  overflow: hidden;
  border-radius: 22px;
  padding: 16px 18px;
  /* m3 配對：brand-primary 漸層配白字在亮端只剩 2.8:1（dark 更差）；
     文字集中左上深端，右下亮端僅放大字/裝飾 */
  color: var(--m3-on-primary, #fff);
  background: linear-gradient(135deg, var(--m3-primary, #006d3d), var(--ivy-green-mid, #41a074));
  box-shadow: 0 10px 22px rgba(13, 144, 83, 0.30);
}
.dash-hero-laurel { position: absolute; right: -16px; top: -12px; pointer-events: none; }
.dash-hero-body { position: relative; }
.dash-hero-eyebrow { margin: 0; font-size: var(--text-xs, 11px); font-weight: 600; opacity: 0.92; }
.dash-hero-title { margin: 2px 0 0; font-size: 17px; font-weight: 800; }
.dash-hero-value { margin: 8px 0 0; font-size: 28px; font-weight: 900; letter-spacing: 0.5px; }
.dash-hero-sub { margin: 3px 0 0; font-size: var(--text-xs, 11px); opacity: 0.95; }
.dash-hero-pill { margin-top: 10px; }
/* ok/warn/neutral 在綠漸層上走白玻璃融入 hero；danger（逾期）刻意不蓋——
   保留 StatusPill 原生警示紅（淺紅底深紅字，pair 內聚 AA），逾期必須一眼看出事態 */
.dash-hero-pill:not(.tone-danger) { background: color-mix(in srgb, var(--m3-on-primary, #fff) 22%, transparent) !important; color: var(--m3-on-primary, #fff) !important; }
.dash-hero-pill.tone-danger { box-shadow: 0 0 0 1px color-mix(in srgb, var(--m3-on-primary, #fff) 45%, transparent); }
</style>
