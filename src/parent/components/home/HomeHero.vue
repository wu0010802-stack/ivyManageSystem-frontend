<script setup>
/**
 * 家長首頁 hero 問候卡（IvyKids rebrand 2026-05-07）。
 *
 * 視覺：cream/leaf 漸層底（pt-gradient-hero）、左下月桂葉裝飾、右上 kawaii 星，
 *      雙色字（暖咖啡 + 深綠）。問候語依時間段切換。
 *
 * Props：
 *   parentName (String) — 家長名，default '家長'
 *   childrenCount (Number) — 子女總數
 *   dailyStar (Object | null) — 「今日 X 之星」moment，後端 ChildSummary.daily_star
 *     形狀 { childName: string, label: string }；為 null 時隱藏該行（目前後端尚未提供）
 */
import { computed } from 'vue'
import LaurelWreath from '../brand/LaurelWreath.vue'
import KawaiiStar from '../brand/KawaiiStar.vue'

const props = defineProps({
  parentName: { type: String, default: '家長' },
  childrenCount: { type: Number, default: 0 },
  dailyStar: { type: Object, default: null },
})

const greeting = computed(() => {
  const h = new Date().getHours()
  if (h < 5) return '夜深了'
  if (h < 11) return '早安'
  if (h < 14) return '午安'
  if (h < 18) return '下午好'
  return '晚安'
})

const todayLabel = computed(() => {
  const d = new Date()
  const wd = ['日', '一', '二', '三', '四', '五', '六'][d.getDay()]
  return `${d.getMonth() + 1}/${d.getDate()} · 星期${wd}`
})
</script>

<template>
  <section class="home-hero" aria-label="今日問候">
    <LaurelWreath side="left" :opacity="0.18" :size="80" class="hero-laurel" />
    <KawaiiStar :size="40" decorative class="hero-star" />

    <div class="home-hero-content">
      <div class="hero-date">{{ todayLabel }}</div>
      <h1 class="hero-greeting">
        {{ greeting }}，<span class="hero-name">{{ parentName || '家長' }}</span>
      </h1>
      <p v-if="childrenCount > 0" class="hero-subtitle">
        您今天有 {{ childrenCount }} 位寶貝
      </p>
      <div v-if="dailyStar" class="hero-daily-star">
        <KawaiiStar :size="14" decorative class="daily-star-icon" />
        今日 {{ dailyStar.childName }} 是「{{ dailyStar.label }}」
      </div>
    </div>
  </section>
</template>

<style scoped>
.home-hero {
  position: relative;
  margin: 0 var(--space-3, 12px);
  padding: var(--space-4, 16px) var(--space-3, 12px) var(--space-4, 16px) var(--space-4, 16px);
  background: var(--pt-gradient-hero);
  border: 1px solid rgba(90, 168, 66, 0.15);
  border-radius: 18px;
  box-shadow: var(--pt-elev-1);
  overflow: hidden;
  isolation: isolate;
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
.home-hero-content {
  position: relative;
  z-index: 1;
}
.hero-date {
  font-size: 11px;
  color: var(--ivy-green-laurel, #5aa842);
  font-weight: 700;
  letter-spacing: 1px;
}
.hero-greeting {
  font-size: 22px;
  font-weight: 900;
  line-height: 1.2;
  margin: 4px 0 0;
  color: var(--pt-text-strong);
}
.hero-name {
  color: var(--brand-primary);
}
.hero-subtitle {
  font-size: 12px;
  color: var(--pt-text-muted);
  margin: 6px 0 0;
  font-weight: 500;
}
.hero-daily-star {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  margin-top: 6px;
  font-size: 11px;
  color: var(--ivy-tile-yellow-fg);
  font-weight: 700;
}
.daily-star-icon { vertical-align: middle; }
</style>
