<script setup>
import { computed } from 'vue'

/**
 * Material 3 Card.
 *
 * Variants:
 *   - elevated (預設) surface-container-low + elev-1
 *   - filled   surface-container-highest + no shadow
 *   - outlined surface + 1px outline-variant + no shadow
 *
 * clickable prop:
 *   - true: 加 role=button + tabindex=0 + state layer + cursor:pointer + emit click
 *
 * Spec: docs/superpowers/specs/2026-05-13-parent-material3-redesign-design.md §4.2
 */
const props = defineProps({
  variant: {
    type: String,
    default: 'elevated',
    validator: (v) => ['elevated', 'filled', 'outlined'].includes(v),
  },
  clickable: { type: Boolean, default: false },
  padding: { type: String, default: '16px' },
})

const classes = computed(() => ({
  'm3-card': true,
  [`m3-card-${props.variant}`]: true,
  'is-clickable': props.clickable,
}))

const style = computed(() => ({ padding: props.padding }))

const rootAttrs = computed(() =>
  props.clickable
    ? { role: 'button', tabindex: '0' }
    : {},
)
</script>

<template>
  <div :class="classes" :style="style" v-bind="rootAttrs">
    <slot />
  </div>
</template>

<style scoped>
.m3-card {
  position: relative;
  border-radius: 12px;
  color: var(--m3-on-surface, #181d18);
  transition:
    background-color var(--m3-dur-short-3, 150ms) var(--m3-easing-standard, ease),
    box-shadow var(--m3-dur-short-3, 150ms) var(--m3-easing-standard, ease);
}
.m3-card-elevated {
  background: var(--m3-surface-container-low, #f1f5ee);
  box-shadow: var(--m3-elev-1, 0 1px 2px rgba(0, 0, 0, 0.3));
}
.m3-card-filled {
  background: var(--m3-surface-container-highest, #e0e4dc);
}
.m3-card-outlined {
  background: var(--m3-surface, #f7fbf3);
  border: 1px solid var(--m3-outline-variant, #c2c9be);
}

.m3-card.is-clickable {
  cursor: pointer;
}
.m3-card.is-clickable::before {
  content: '';
  position: absolute;
  inset: 0;
  border-radius: inherit;
  background: var(--m3-on-surface, currentColor);
  opacity: 0;
  pointer-events: none;
  transition: opacity var(--m3-dur-short-2, 100ms) var(--m3-easing-standard, ease);
}
.m3-card.is-clickable:hover::before  { opacity: var(--m3-state-hover, 0.08); }
.m3-card.is-clickable:focus-visible::before { opacity: var(--m3-state-focus, 0.12); }
.m3-card.is-clickable:active::before { opacity: var(--m3-state-pressed, 0.12); }
</style>
