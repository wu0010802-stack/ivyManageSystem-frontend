<script setup>
import { ArrowLeft, ArrowRight } from '@element-plus/icons-vue'

defineProps({
  visible: { type: Boolean, required: true },
  year: { type: Number, required: true },
  month: { type: Number, required: true },
  /** true = 正在檢視當前月份（顯示「今日」按鈕） */
  isCurrentMonth: { type: Boolean, default: false },
})

defineEmits(['prev', 'next', 'today'])
</script>

<template>
  <transition name="sticky-bar-fade">
    <div v-show="visible" class="sticky-month-bar">
      <button
        type="button"
        class="sticky-bar__btn"
        aria-label="上個月"
        @click="$emit('prev')"
      >
        <el-icon><ArrowLeft /></el-icon>
      </button>
      <span class="sticky-bar__label">{{ year }} / {{ String(month).padStart(2, '0') }}</span>
      <button
        type="button"
        class="sticky-bar__btn"
        aria-label="下個月"
        @click="$emit('next')"
      >
        <el-icon><ArrowRight /></el-icon>
      </button>
      <button
        v-if="isCurrentMonth"
        type="button"
        class="sticky-bar__today"
        @click="$emit('today')"
      >
        今日
      </button>
    </div>
  </transition>
</template>

<style scoped>
.sticky-month-bar {
  position: sticky;
  top: 0;
  z-index: 10;
  background: var(--pt-surface-card);
  border-bottom: var(--pt-hairline);
  display: flex;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-2) var(--space-3);
  box-shadow: var(--pt-elev-1);
}

.sticky-bar__btn {
  width: 36px;
  height: 36px;
  border: none;
  background: transparent;
  border-radius: var(--radius-sm);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--pt-text-strong);
  -webkit-tap-highlight-color: transparent;
}

.sticky-bar__btn:hover {
  background: var(--pt-surface-mute);
}

.sticky-bar__label {
  flex: 1;
  text-align: center;
  font-weight: 600;
  color: var(--pt-text-strong);
}

.sticky-bar__today {
  border: none;
  background: var(--pt-tint-primary, #eef0fd);
  color: var(--pt-tint-primary-fg, #4338ca);
  padding: 6px 12px;
  border-radius: 999px;
  font-size: var(--text-sm);
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
}

.sticky-bar-fade-enter-active,
.sticky-bar-fade-leave-active {
  transition: opacity 200ms ease, transform 200ms ease;
}

.sticky-bar-fade-enter-from,
.sticky-bar-fade-leave-to {
  opacity: 0;
  transform: translateY(-8px);
}
</style>
