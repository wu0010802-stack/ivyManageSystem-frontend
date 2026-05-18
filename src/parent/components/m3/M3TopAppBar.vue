<script setup lang="ts">
import { computed } from 'vue'
import M3IconButton from './M3IconButton.vue'

/**
 * Material 3 Top App Bar.
 *
 * Variants:
 *   - center-aligned 首頁，title 置中（64px）
 *   - small (預設)   detail page，title 左對齊（64px）
 *   - large          特殊頁，152px 展開（scroll collapse 留待 P5）
 *
 * Slots:
 *   - leading 自訂左側內容（覆蓋預設 back 按鈕）
 *   - actions 右側 trailing 區域，預期放 M3IconButton
 *
 * Spec: docs/superpowers/specs/2026-05-13-parent-material3-redesign-design.md §5.2
 */
const props = withDefaults(defineProps<{
  variant?: string
  title?: string
  showBack?: boolean
  onBack?: (() => void) | null
}>(), {
  variant: 'small',
  title: '',
  showBack: false,
  onBack: null,
})

const classes = computed<Record<string, boolean>>(() => ({
  'm3-top-app-bar': true,
  [`m3-top-app-bar-${props.variant}`]: true,
}))

function onBackClick(): void {
  if (props.onBack) props.onBack()
}
</script>

<template>
  <header :class="classes" role="banner">
    <div class="m3-top-app-bar-leading">
      <slot name="leading">
        <M3IconButton
          v-if="showBack"
          class="m3-top-app-bar-back"
          icon="arrow_back"
          aria-label="返回上一頁"
          @click="onBackClick"
        />
      </slot>
    </div>

    <h1 class="m3-top-app-bar-title m3-title-large">{{ title }}</h1>

    <div class="m3-top-app-bar-actions">
      <slot name="actions" />
    </div>
  </header>
</template>

<style scoped>
.m3-top-app-bar {
  position: sticky;
  top: 0;
  z-index: var(--z-sticky, 10);
  display: grid;
  grid-template-columns: 48px minmax(0, 1fr) auto;
  align-items: center;
  gap: 4px;
  padding: 0 4px;
  padding-top: env(safe-area-inset-top, 0);
  background: var(--m3-surface, #f7fbf3);
  color: var(--m3-on-surface, #181d18);
}

.m3-top-app-bar-small,
.m3-top-app-bar-center-aligned {
  min-height: 64px;
}
.m3-top-app-bar-large {
  min-height: 152px;
  grid-template-rows: 64px auto;
  grid-template-areas:
    "leading title actions"
    "title-expanded title-expanded title-expanded";
}

.m3-top-app-bar-leading {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  grid-area: leading;
}
.m3-top-app-bar-actions {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  grid-area: actions;
  padding-right: 4px;
}

.m3-top-app-bar-title {
  margin: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  grid-area: title;
}
.m3-top-app-bar-small .m3-top-app-bar-title { text-align: left; }
.m3-top-app-bar-center-aligned .m3-top-app-bar-title { text-align: center; }
.m3-top-app-bar-large .m3-top-app-bar-title {
  grid-area: title-expanded;
  padding: 0 16px 16px;
  font-size: 28px;
  line-height: 36px;
}
</style>
