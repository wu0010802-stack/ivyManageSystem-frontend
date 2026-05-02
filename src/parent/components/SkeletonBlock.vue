<script setup>
/**
 * 家長 App 共用骨架元件。
 *
 * 為什麼？
 *  - >300ms 的非同步載入只用「載入中…」文字會掉漆。
 *  - 骨架可以暗示 layout 結構，避免內容跳動（CLS）。
 *
 * 提供三種預設變體（variant）：
 *  - line：單行文字骨架（預設高度 14px）
 *  - card：卡片骨架（含標題 + 兩行 + 12px radius）
 *  - row：列表 row 骨架（avatar + 兩行）
 *
 * 也支援自訂 width / height，純當 placeholder。
 *
 * 例：
 *   <SkeletonBlock variant="card" />
 *   <SkeletonBlock variant="row" :count="3" />
 *   <SkeletonBlock width="60%" height="14px" />
 */
import { computed } from 'vue'

const props = defineProps({
  variant: { type: String, default: 'line' }, // line / card / row
  count: { type: Number, default: 1 },
  width: { type: String, default: null },
  height: { type: String, default: null },
})

const items = computed(() => Array.from({ length: Math.max(1, props.count) }))
const customStyle = computed(() => {
  const s = {}
  if (props.width) s.width = props.width
  if (props.height) s.height = props.height
  return s
})
</script>

<template>
  <!-- 純 placeholder（自訂尺寸） -->
  <template v-if="variant === 'line'">
    <div
      v-for="(_, i) in items"
      :key="i"
      class="sk sk-line"
      :style="customStyle"
      aria-hidden="true"
    />
  </template>

  <!-- 卡片骨架 -->
  <template v-else-if="variant === 'card'">
    <div v-for="(_, i) in items" :key="i" class="sk-card" aria-hidden="true">
      <div class="sk sk-line" style="width: 40%; height: 16px;" />
      <div class="sk sk-line" style="width: 90%; margin-top: 12px;" />
      <div class="sk sk-line" style="width: 70%; margin-top: 6px;" />
    </div>
  </template>

  <!-- 列表 row 骨架 -->
  <template v-else-if="variant === 'row'">
    <div v-for="(_, i) in items" :key="i" class="sk-row" aria-hidden="true">
      <div class="sk sk-avatar" />
      <div class="sk-row-body">
        <div class="sk sk-line" style="width: 30%; height: 14px;" />
        <div class="sk sk-line" style="width: 80%; margin-top: 6px;" />
      </div>
    </div>
  </template>

  <!-- 通用 announce loading 給 SR（一次掛載即可） -->
  <span class="sr-only" role="status" aria-live="polite">載入中</span>
</template>

<style scoped>
.sk {
  display: block;
  background: var(--neutral-100, #f1f5f9);
  border-radius: var(--radius-sm, 4px);
  position: relative;
  overflow: hidden;
}

.sk::after {
  content: '';
  position: absolute;
  inset: 0;
  background: linear-gradient(
    90deg,
    transparent 0%,
    rgba(255, 255, 255, 0.6) 50%,
    transparent 100%
  );
  animation: sk-shimmer 1.4s ease-in-out infinite;
}

.sk-line {
  height: 14px;
  width: 100%;
}

.sk-line + .sk-line {
  margin-top: 8px;
}

.sk-card {
  background: var(--neutral-0, #fff);
  padding: var(--card-padding, 20px);
  border-radius: var(--card-radius, var(--radius-lg, 12px));
  box-shadow: var(--card-shadow, var(--shadow-sm));
  margin-bottom: var(--space-2, 8px);
}

.sk-row {
  display: flex;
  gap: var(--space-3, 12px);
  padding: var(--space-3, 12px) var(--space-4, 16px);
  background: var(--neutral-0, #fff);
  border-bottom: 1px solid var(--neutral-100, #f1f5f9);
}

.sk-row-body {
  flex: 1;
  min-width: 0;
}

.sk-avatar {
  width: 44px;
  height: 44px;
  border-radius: 50%;
  flex-shrink: 0;
  background: var(--neutral-100, #f1f5f9);
  position: relative;
  overflow: hidden;
}

.sk-avatar::after {
  content: '';
  position: absolute;
  inset: 0;
  background: linear-gradient(
    90deg,
    transparent 0%,
    rgba(255, 255, 255, 0.6) 50%,
    transparent 100%
  );
  animation: sk-shimmer 1.4s ease-in-out infinite;
}

@keyframes sk-shimmer {
  0% {
    transform: translateX(-100%);
  }
  100% {
    transform: translateX(100%);
  }
}

@media (prefers-reduced-motion: reduce) {
  .sk::after,
  .sk-avatar::after {
    animation: none;
    background: rgba(255, 255, 255, 0.3);
  }
}
</style>
