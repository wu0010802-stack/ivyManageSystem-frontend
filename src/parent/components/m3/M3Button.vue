<script setup lang="ts">
import { computed, useSlots } from 'vue'

/**
 * Material 3 Button.
 *
 * Variants（5）:
 *   - filled    (預設) primary bg + on-primary text；最強行動
 *   - tonal     secondary-container bg；中等強度（最常用）
 *   - outlined  border + transparent bg；中性
 *   - text      無 bg / border；連結式行動
 *   - elevated  surface-container-low + elev-1；少用，搭配深色卡
 *
 * Slots:
 *   - default   label 文字
 *   - icon      leading icon（會在 label 前面渲染）
 *
 * Spec: docs/superpowers/specs/2026-05-13-parent-material3-redesign-design.md §4.1
 */
const props = withDefaults(defineProps<{
  variant?: string
  disabled?: boolean
  type?: 'button' | 'submit' | 'reset'
}>(), {
  variant: 'filled',
  disabled: false,
  type: 'button',
})

const slots = useSlots()
const hasLeadingIcon = computed<boolean>(() => !!slots.icon)

const classes = computed<Record<string, boolean>>(() => ({
  'm3-button': true,
  [`m3-button-${props.variant}`]: true,
  'has-leading-icon': hasLeadingIcon.value,
  'is-disabled': props.disabled,
}))
</script>

<template>
  <button
    :class="classes"
    :type="type"
    :disabled="disabled"
  >
    <span v-if="hasLeadingIcon" class="m3-button-icon">
      <slot name="icon" />
    </span>
    <span class="m3-button-label m3-label-large">
      <slot />
    </span>
  </button>
</template>

<style scoped>
.m3-button {
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  height: 40px;
  padding: 0 24px;
  border: none;
  border-radius: 9999px;
  cursor: pointer;
  transition:
    background-color var(--m3-dur-short-3, 150ms) var(--m3-easing-standard, ease),
    box-shadow var(--m3-dur-short-3, 150ms) var(--m3-easing-standard, ease);
  font-family: var(--m3-font-body, 'Roboto', sans-serif);
}
.m3-button::before {
  content: '';
  position: absolute;
  inset: 0;
  border-radius: inherit;
  background: currentColor;
  opacity: 0;
  pointer-events: none;
  transition: opacity var(--m3-dur-short-2, 100ms) var(--m3-easing-standard, ease);
}
.m3-button:hover:not(.is-disabled)::before { opacity: var(--m3-state-hover, 0.08); }
.m3-button:focus-visible:not(.is-disabled)::before { opacity: var(--m3-state-focus, 0.12); }
.m3-button:active:not(.is-disabled)::before { opacity: var(--m3-state-pressed, 0.12); }
.m3-button.has-leading-icon { padding-left: 16px; }
.m3-button-icon { display: inline-flex; align-items: center; flex-shrink: 0; }
.m3-button-label { white-space: nowrap; }

.m3-button-filled {
  background: var(--m3-primary, #006d3d);
  color: var(--m3-on-primary, #ffffff);
}
.m3-button-tonal {
  background: var(--m3-secondary-container, #d3e8d3);
  color: var(--m3-on-secondary-container, #0e1f12);
}
.m3-button-outlined {
  background: transparent;
  color: var(--m3-primary, #006d3d);
  border: 1px solid var(--m3-outline, #727970);
}
.m3-button-text {
  background: transparent;
  color: var(--m3-primary, #006d3d);
  padding: 0 12px;
}
.m3-button-text.has-leading-icon { padding-left: 12px; }
.m3-button-elevated {
  background: var(--m3-surface-container-low, #f1f5ee);
  color: var(--m3-primary, #006d3d);
  box-shadow: var(--m3-elev-1, 0 1px 2px rgba(0, 0, 0, 0.3));
}

.m3-button.is-disabled {
  cursor: not-allowed;
  opacity: 0.38;
}
.m3-button.is-disabled::before { opacity: 0; }
</style>
