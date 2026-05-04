<script setup>
/**
 * 家長首頁 hero 問候卡。
 *
 * 內含：時間問候 + 家長名 + 子女數，漸層 brand 色 + 兩個裝飾 blob。
 * 為純呈現元件，無外部依賴；問候語邏輯在元件內以 `new Date()` 計算。
 */
import { computed } from 'vue'

const props = defineProps({
  parentName: { type: String, default: '家長' },
  childrenCount: { type: Number, default: 0 },
})

function greetingByHour(h = new Date().getHours()) {
  if (h < 5) return '夜深了，記得早點休息'
  if (h < 11) return '早安'
  if (h < 14) return '午安'
  if (h < 18) return '下午好'
  return '晚安'
}

const greeting = computed(() => greetingByHour())
</script>

<template>
  <section class="home-hero">
    <div class="home-hero-content">
      <div class="home-hero-greeting">{{ greeting }}</div>
      <div class="home-hero-name">{{ parentName || '家長' }}</div>
      <div v-if="childrenCount > 0" class="home-hero-meta">
        照顧 {{ childrenCount }} 位寶貝
      </div>
    </div>
    <div class="home-hero-decoration" aria-hidden="true">
      <span class="home-hero-blob home-hero-blob-1" />
      <span class="home-hero-blob home-hero-blob-2" />
    </div>
  </section>
</template>

<style scoped>
/* ==========================================================
 * Hero 問候卡 — 漸層 brand 色，建立首頁視覺定錨
 * ========================================================== */
.home-hero {
  position: relative;
  background: var(--pt-gradient-hero);
  border-radius: var(--radius-xl, 16px);
  padding: 18px 20px 20px;
  color: var(--neutral-0, #fff);
  box-shadow: var(--pt-elev-2);
  overflow: hidden;
  isolation: isolate;
}

.home-hero-content {
  position: relative;
  z-index: 1;
}

.home-hero-greeting {
  font-size: var(--text-sm, 13px);
  /* 不用 opacity 區分層次，避免在淡色端文字對比不足；改以亮黃色帶 brand 暖意 */
  color: rgba(255, 255, 255, 0.96);
  letter-spacing: 0.04em;
}

.home-hero-name {
  font-size: var(--text-2xl, 22px);
  font-weight: var(--font-weight-bold, 700);
  margin-top: 2px;
  letter-spacing: 0.01em;
}

.home-hero-meta {
  font-size: var(--text-xs, 12px);
  margin-top: 6px;
  color: rgba(255, 255, 255, 0.92);
}

/* 浮球裝飾 — 純 CSS，零 asset cost */
.home-hero-decoration {
  position: absolute;
  inset: 0;
  pointer-events: none;
}
.home-hero-blob {
  position: absolute;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.16);
  filter: blur(2px);
}
.home-hero-blob-1 {
  top: -32px;
  right: -24px;
  width: 120px;
  height: 120px;
}
.home-hero-blob-2 {
  bottom: -48px;
  right: 56px;
  width: 80px;
  height: 80px;
  background: rgba(255, 255, 255, 0.10);
}
</style>
