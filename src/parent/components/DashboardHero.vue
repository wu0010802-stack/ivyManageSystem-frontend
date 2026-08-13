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
  color: var(--pt-on-accent, #fff);
  background: linear-gradient(135deg, var(--brand-primary, #0d9053), var(--brand-primary-hover, #12b06a));
  box-shadow: 0 10px 22px rgba(13, 144, 83, 0.30);
}
.dash-hero-laurel { position: absolute; right: -16px; top: -12px; pointer-events: none; }
.dash-hero-body { position: relative; }
.dash-hero-eyebrow { margin: 0; font-size: var(--text-xs, 11px); font-weight: 600; opacity: 0.92; }
.dash-hero-title { margin: 2px 0 0; font-size: 17px; font-weight: 800; }
.dash-hero-value { margin: 8px 0 0; font-size: 28px; font-weight: 900; letter-spacing: 0.5px; }
.dash-hero-sub { margin: 3px 0 0; font-size: var(--text-xs, 11px); opacity: 0.95; }
.dash-hero-pill { margin-top: 10px; background: rgba(255, 255, 255, 0.22) !important; color: var(--pt-on-accent, #fff) !important; }
</style>
