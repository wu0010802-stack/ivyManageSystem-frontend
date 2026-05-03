<script setup>
/**
 * 才藝 hero 卡：三段統計（進行中報名 / 待繳活動費 / 即將開課）藍青資訊漸層。
 *
 * Props:
 *  - activeRegistrations: 進行中報名數
 *  - unpaidActivityFee: 未繳活動費合計
 *  - upcomingCount: 即將開課（最近 7 天）；MVP 暫設 0
 *
 * Emits:
 *  - scroll-section(key): 'active' | 'unpaid' | 'upcoming'
 */
const props = defineProps({
  activeRegistrations: { type: Number, default: 0 },
  unpaidActivityFee: { type: Number, default: 0 },
  upcomingCount: { type: Number, default: 0 },
})
const emit = defineEmits(['scroll-section'])

function fmt(n) { return Number(n).toLocaleString('en-US') }
</script>

<template>
  <section class="act-hero">
    <div class="act-hero-blob" aria-hidden="true" />
    <div class="act-hero-content">
      <button type="button" class="act-hero-stat" @click="emit('scroll-section', 'active')">
        <span class="num">{{ activeRegistrations }}</span><span class="lbl">進行中</span>
      </button>
      <button type="button" class="act-hero-stat" @click="emit('scroll-section', 'unpaid')">
        <span class="num">NT$ {{ fmt(unpaidActivityFee) }}</span><span class="lbl">待繳</span>
      </button>
      <button type="button" class="act-hero-stat" @click="emit('scroll-section', 'upcoming')">
        <span class="num">{{ upcomingCount }}</span><span class="lbl">即將開課</span>
      </button>
    </div>
  </section>
</template>

<style scoped>
.act-hero {
  position: relative; overflow: hidden;
  background: var(--pt-gradient-info);
  color: #1e3a8a;
  border-radius: 16px; padding: 16px;
  box-shadow: var(--pt-elev-2); border: var(--pt-hairline);
}
.act-hero-blob {
  position: absolute; width: 160px; height: 160px;
  background: rgba(255,255,255,0.5); border-radius: 50%; filter: blur(40px);
  top: -50px; right: -50px; pointer-events: none;
}
.act-hero-content {
  position: relative; z-index: 1;
  display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px;
}
.act-hero-stat {
  background: rgba(255,255,255,0.6); border: none; border-radius: 12px;
  padding: 12px 6px; cursor: pointer;
  display: flex; flex-direction: column; align-items: center; gap: 2px;
  color: inherit;
}
.act-hero-stat .num { font-size: 16px; font-weight: 700; }
.act-hero-stat .lbl { font-size: 11px; opacity: 0.85; }
</style>
