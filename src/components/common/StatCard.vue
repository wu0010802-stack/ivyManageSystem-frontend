<template>
  <div
    class="stat-card"
    :class="[`stat-card--${variant}`, `stat-card--${color}`, { 'stat-card--iconless': !icon }]"
  >
    <div class="stat-card__body">
      <div class="stat-card__content">
        <span class="stat-card__label">{{ label }}</span>
        <div class="stat-card__value">{{ value }}</div>
      </div>
      <div v-if="icon" class="stat-card__icon-wrap">
        <el-icon :size="20"><component :is="icon" /></el-icon>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { Component } from 'vue'

// icon 為選填：純裝飾（只是複述 label 文字）的場合直接不傳，卡片會收成
// 「標籤＋數值」的純資料塊。傳時只收元件物件——字串名走 <component :is> 需
// 全域註冊，局部 import 的 EP icon 傳字串會靜默渲染成空色塊。
withDefaults(defineProps<{
  label: string
  value: string | number
  icon?: Component
  color?: 'primary' | 'success' | 'warning' | 'danger' | 'info'
  variant?: 'default' | 'filled'
}>(), {
  color: 'primary',
  variant: 'default',
})
</script>

<style scoped>
/* 非互動元件：不做 hover 抬升（假 affordance——邀請點擊卻不可點） */
.stat-card {
  background: var(--neutral-0);
  border: 1px solid var(--border-color);
  border-radius: 12px;
  padding: 20px 24px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.04);
  height: 100%;
  box-sizing: border-box;
}

.stat-card__body {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
}

.stat-card__content {
  min-width: 0;
}

.stat-card__label {
  font-size: 13px;
  color: var(--text-secondary);
  display: block;
  margin-bottom: 8px;
  font-weight: 500;
  white-space: nowrap;
}

.stat-card__value {
  font-size: 30px;
  font-weight: 700;
  color: var(--text-primary);
  line-height: 1;
}

.stat-card__icon-wrap {
  flex-shrink: 0;
  width: 44px;
  height: 44px;
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
}

/* ── default variant ── */
.stat-card--default.stat-card--primary .stat-card__icon-wrap { background: var(--brand-primary-soft); color: var(--brand-primary); }
.stat-card--default.stat-card--success .stat-card__icon-wrap { background: var(--color-success-soft); color: var(--color-success); }
.stat-card--default.stat-card--warning .stat-card__icon-wrap { background: var(--color-warning-soft); color: var(--color-warning); }
.stat-card--default.stat-card--danger  .stat-card__icon-wrap { background: var(--color-danger-soft); color: var(--color-danger); }
.stat-card--default.stat-card--info    .stat-card__icon-wrap { background: var(--color-info-soft); color: var(--color-info); }

/* ── iconless（未傳 icon）──
 * color prop 原本只作用在 icon 底色；拿掉裝飾 icon 後改由數值承載語意色，
 * 讓顏色說明狀態而非裝飾。文字內容本身已完整敘述狀態（「需重算」「10 筆」），
 * 色彩非唯一指示，符合 PRODUCT.md 的 a11y 要求。
 * -darker 階是「文字用」色（light 深、dark 亮，a11y.css 已翻色），對比達 AA。
 * info 刻意不著色——info 語意是「無特殊狀態」，上色反而變雜訊。 */
.stat-card--default.stat-card--iconless.stat-card--primary .stat-card__value { color: var(--brand-primary-hover); }
.stat-card--default.stat-card--iconless.stat-card--success .stat-card__value { color: var(--color-success-darker); }
.stat-card--default.stat-card--iconless.stat-card--warning .stat-card__value { color: var(--color-warning-darker); }
.stat-card--default.stat-card--iconless.stat-card--danger  .stat-card__value { color: var(--color-danger-darker); }

/* ── filled variant (Material 3 tonal) ──
 * 一律走 token：primary 硬編 indigo 會與 admin 青藍 brand 脫鉤（html.ivy-admin 覆寫）。
 * icon 底以 color-mix 從主色淡出，不再各自硬編 rgba。 */
.stat-card--filled { border-color: transparent; }

.stat-card--filled.stat-card--primary { background: var(--brand-primary-soft); }
.stat-card--filled.stat-card--success  { background: var(--color-success-soft); }
.stat-card--filled.stat-card--warning  { background: var(--color-warning-soft); }
.stat-card--filled.stat-card--danger   { background: var(--color-danger-soft); }
.stat-card--filled.stat-card--info     { background: var(--color-info-soft); }

.stat-card--filled .stat-card__label { color: var(--neutral-600); }

.stat-card--filled.stat-card--primary .stat-card__value { color: var(--brand-primary-hover); }
.stat-card--filled.stat-card--success  .stat-card__value { color: var(--color-success-hover); }
.stat-card--filled.stat-card--warning  .stat-card__value { color: var(--color-warning-hover); }
.stat-card--filled.stat-card--danger   .stat-card__value { color: var(--color-danger-hover); }
.stat-card--filled.stat-card--info     .stat-card__value { color: var(--color-info-hover); }

.stat-card--filled.stat-card--primary .stat-card__icon-wrap { background: color-mix(in srgb, var(--brand-primary) 12%, transparent); color: var(--brand-primary-hover); }
.stat-card--filled.stat-card--success  .stat-card__icon-wrap { background: color-mix(in srgb, var(--color-success) 12%, transparent); color: var(--color-success-hover); }
.stat-card--filled.stat-card--warning  .stat-card__icon-wrap { background: color-mix(in srgb, var(--color-warning) 12%, transparent); color: var(--color-warning-hover); }
.stat-card--filled.stat-card--danger   .stat-card__icon-wrap { background: color-mix(in srgb, var(--color-danger) 12%, transparent); color: var(--color-danger-hover); }
.stat-card--filled.stat-card--info     .stat-card__icon-wrap { background: color-mix(in srgb, var(--color-info) 12%, transparent); color: var(--color-info-hover); }
</style>
