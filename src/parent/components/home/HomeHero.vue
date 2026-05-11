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
 *   todoCount (Number) — 今日待辦件數，>0 顯示處理提示，=0 顯示正向訊息（IA v2 Phase 3）
 *   dailyStar (Object | null) — 「今日 X 之星」moment，後端 ChildSummary.daily_star
 *     形狀 { childName: string, label: string }；為 null 時隱藏該行（目前後端尚未提供）
 */
import { computed } from 'vue'
import LaurelWreath from '@/components/brand/LaurelWreath.vue'
import KawaiiStar from '@/components/brand/KawaiiStar.vue'

const props = defineProps({
  parentName: { type: String, default: '家長' },
  childrenCount: { type: Number, default: 0 },
  todoCount: { type: Number, default: 0 },
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
  <section class="home-hero" aria-label="今日總覽">
    <LaurelWreath side="left" :opacity="0.12" :size="96" class="hero-laurel" />
    <KawaiiStar :size="34" decorative class="hero-star" />

    <div class="home-hero-content">
      <div class="hero-date">{{ todayLabel }}</div>
      <h1 class="hero-greeting">
        {{ greeting }}，<span class="hero-name">{{ parentName || '家長' }}</span>
      </h1>
      <div class="hero-summary">
        <span v-if="childrenCount > 0" class="hero-pill">
          {{ childrenCount }} 位寶貝
        </span>
        <span class="hero-pill hero-pill--soft">常春藤家長端</span>
      </div>
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
  padding: 22px 18px 20px;
  background:
    linear-gradient(135deg, var(--pt-surface-raised, #fff) 0%, var(--pt-surface-recessed, #f5fbe6) 100%);
  border: 1px solid var(--pt-page-border, rgba(90, 168, 66, 0.15));
  border-radius: var(--pt-card-radius, 14px);
  box-shadow: var(--pt-shadow-card, var(--pt-elev-1));
  overflow: hidden;
  isolation: isolate;
}
.hero-laurel {
  position: absolute;
  left: -20px;
  bottom: -12px;
  z-index: 0;
}
.hero-star {
  position: absolute;
  right: 16px;
  top: 14px;
  z-index: 0;
}
.home-hero-content {
  position: relative;
  z-index: 1;
}
.hero-date {
  font-size: 12px;
  color: var(--brand-primary);
  font-weight: 800;
  letter-spacing: 0.04em;
}
.hero-greeting {
  font-size: var(--text-3xl, 24px);
  font-weight: 900;
  line-height: 1.12;
  margin: 8px 42px 0 0;
  color: var(--pt-text-strong);
}
.hero-name {
  color: var(--brand-primary);
}
.hero-summary {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 14px;
}
.hero-pill {
  display: inline-flex;
  align-items: center;
  min-height: 30px;
  padding: 5px 11px;
  border-radius: 999px;
  background: var(--pt-tint-brand, var(--brand-primary-soft));
  color: var(--brand-primary);
  font-size: 12px;
  font-weight: 800;
}
.hero-pill--soft {
  background: var(--pt-tint-sun, var(--ivy-tile-yellow-bg));
  color: var(--ivy-tile-yellow-fg);
}
.hero-daily-star {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  margin-top: 10px;
  font-size: 12px;
  color: var(--ivy-tile-yellow-fg);
  font-weight: 700;
}
.daily-star-icon { vertical-align: middle; }

@media (min-width: 420px) {
  .hero-greeting {
    font-size: var(--text-4xl, 30px);
  }
}
</style>
