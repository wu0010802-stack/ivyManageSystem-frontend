<template>
  <div class="stat-strip">
    <div v-for="item in items" :key="item.label" class="stat-strip__cell">
      <span class="stat-strip__label">{{ item.label }}</span>
      <span
        class="stat-strip__value"
        :class="[
          item.tone ? `stat-strip__value--${item.tone}` : '',
          { 'stat-strip__value--em': item.emphasis },
        ]"
      >{{ item.value }}</span>
    </div>
  </div>
</template>

<script setup lang="ts">
export interface StatStripItem {
  label: string
  value: string | number
  /** 值的語意色；僅在數字本身帶狀態意義時給（例：退款 > 0 用 warning），常態留白 */
  tone?: 'primary' | 'success' | 'warning' | 'danger'
  /** 視覺錨點（一列至多一個，例：淨額）：主色加粗 */
  emphasis?: boolean
}

defineProps<{ items: StatStripItem[] }>()
</script>

<style scoped>
/* 摘要統計列：單一表面、hairline 分隔，數字自己說話（無 icon、無 tonal 色塊）。
 * 1px gap + 容器底色即分隔線，窄幅換行時水平/垂直 hairline 自動成立。 */
.stat-strip {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  gap: 1px;
  background: var(--border-color);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-lg);
  overflow: hidden;
}

.stat-strip__cell {
  background: var(--neutral-0);
  padding: var(--space-4) var(--space-5);
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  min-width: 0;
}

.stat-strip__label {
  font-size: var(--text-sm);
  font-weight: var(--font-weight-medium);
  color: var(--text-secondary);
  white-space: nowrap;
}

.stat-strip__value {
  font-size: var(--text-3xl);
  font-weight: var(--font-weight-semibold);
  line-height: var(--line-height-tight);
  color: var(--text-primary);
  font-variant-numeric: tabular-nums;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* 文字色一律走 *-darker／--brand-primary（a11y.css 的 html.dark 已翻亮階）；
 * *-hover 是互動態 token、dark 未覆寫，當文字色在深底只有 2.5–3.6:1（P3-10）。 */
.stat-strip__value--em {
  font-weight: var(--font-weight-bold);
  color: var(--brand-primary);
}

.stat-strip__value--primary { color: var(--brand-primary); }
.stat-strip__value--success { color: var(--color-success-darker); }
.stat-strip__value--warning { color: var(--color-warning-darker); }
.stat-strip__value--danger { color: var(--color-danger-darker); }
</style>
