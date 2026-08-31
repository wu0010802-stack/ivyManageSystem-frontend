<script setup lang="ts">
import { computed } from 'vue'
import M3Icon from './M3Icon.vue'

/**
 * Material 3 Icon Button.
 *
 * Variants:
 *   - standard     (預設) transparent bg, on-surface-variant color
 *   - filled       primary bg, on-primary color
 *   - filled-tonal secondary-container bg
 *   - outlined     1px outline border, transparent bg
 *
 * 必填 aria-label（icon-only 按鈕 accessibility 要求）；父層必須傳入。
 *
 * Spec: docs/superpowers/specs/2026-05-13-parent-material3-redesign-design.md §4.3
 */
const props = withDefaults(defineProps<{
  variant?: string
  icon: string
  iconSize?: number
  iconFilled?: boolean
  disabled?: boolean
}>(), {
  variant: 'standard',
  iconSize: 24,
  iconFilled: false,
  disabled: false,
})

const emit = defineEmits<{
  'click': [event: MouseEvent]
}>()

const classes = computed<Record<string, boolean>>(() => ({
  'm3-icon-button': true,
  [`m3-icon-button-${props.variant}`]: true,
  'is-disabled': props.disabled,
}))

function handleClick(event: MouseEvent): void {
  if (props.disabled) return
  emit('click', event)
}
</script>

<template>
  <button
    :class="classes"
    type="button"
    :disabled="disabled"
    @click.stop="handleClick"
  >
    <M3Icon
      :name="icon"
      :size="iconSize"
      :filled="iconFilled"
      aria-hidden="true"
    />
  </button>
</template>

<style scoped>
.m3-icon-button {
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  padding: 0;
  border: none;
  border-radius: 9999px;
  background: transparent;
  cursor: pointer;
  transition:
    background-color var(--m3-dur-short-3, 150ms) var(--m3-easing-standard, ease),
    transform var(--motion-base, 260ms) var(--motion-spring, ease);
}
.m3-icon-button:active:not(.is-disabled) { transform: scale(0.96); }
@media (prefers-reduced-motion: reduce) {
  .m3-icon-button { transition: none; }
  .m3-icon-button:active:not(.is-disabled) { transform: none; }
}
.m3-icon-button::before {
  content: '';
  position: absolute;
  inset: 0;
  border-radius: inherit;
  background: currentColor;
  opacity: 0;
  pointer-events: none;
  transition: opacity var(--m3-dur-short-2, 100ms) var(--m3-easing-standard, ease);
}
.m3-icon-button:hover:not(.is-disabled)::before { opacity: var(--m3-state-hover, 0.08); }
.m3-icon-button:focus-visible:not(.is-disabled)::before { opacity: var(--m3-state-focus, 0.12); }
.m3-icon-button:active:not(.is-disabled)::before { opacity: var(--m3-state-pressed, 0.12); }

.m3-icon-button-standard {
  color: var(--m3-on-surface-variant, #424941);
}
.m3-icon-button-filled {
  background: var(--m3-primary, #006d3d);
  color: var(--m3-on-primary, #ffffff);
}
.m3-icon-button-filled-tonal {
  background: var(--m3-secondary-container, #d3e8d3);
  color: var(--m3-on-secondary-container, #0e1f12);
}
.m3-icon-button-outlined {
  border: 1px solid var(--m3-outline, #727970);
  color: var(--m3-on-surface-variant, #424941);
}

.m3-icon-button.is-disabled {
  cursor: not-allowed;
  opacity: 0.38;
}
.m3-icon-button.is-disabled::before { opacity: 0; }
</style>
