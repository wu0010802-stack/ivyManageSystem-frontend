<script setup lang="ts">
import { computed } from 'vue'
import M3Icon from './M3Icon.vue'

/**
 * Material 3 Floating Action Button.
 *
 * Variants (color): primary (預設) / secondary / tertiary / surface
 * Sizes: small (40) / regular (56, 預設) / large (96)
 * Extended: 含 label 的延伸 FAB（56 高，寬自適應）
 *
 * 必填 aria-label。
 *
 * Spec: docs/superpowers/specs/2026-05-13-parent-material3-redesign-design.md §5.3
 */
const props = withDefaults(defineProps<{
  icon: string
  variant?: string
  size?: string
  extended?: boolean
  label?: string
  disabled?: boolean
}>(), {
  variant: 'primary',
  size: 'regular',
  extended: false,
  label: '',
  disabled: false,
})

const classes = computed<Record<string, boolean>>(() => ({
  'm3-fab': true,
  [`m3-fab-${props.variant}`]: true,
  [`m3-fab-${props.size}`]: true,
  'is-extended': props.extended,
  'is-disabled': props.disabled,
}))

const iconSize = computed<number>(() => {
  if (props.size === 'small') return 20
  if (props.size === 'large') return 36
  return 24
})

const emit = defineEmits<{
  'click': [event: MouseEvent]
}>()

function onClick(e: MouseEvent): void {
  if (props.disabled) return
  emit('click', e)
}
</script>

<template>
  <button
    :class="classes"
    type="button"
    :disabled="disabled"
    @click="onClick"
  >
    <M3Icon :name="icon" :size="iconSize" aria-hidden="true" />
    <span v-if="extended && label" class="m3-fab-label m3-label-large">{{ label }}</span>
  </button>
</template>

<style scoped>
.m3-fab {
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
  border: none;
  cursor: pointer;
  box-shadow: var(--pt-shadow-float, var(--m3-elev-3, 0 4px 8px rgba(0, 0, 0, 0.2)));
  transition:
    background-color var(--m3-dur-short-3, 150ms) var(--m3-easing-standard, ease),
    box-shadow var(--m3-dur-short-3, 150ms) var(--m3-easing-standard, ease),
    transform var(--motion-base, 260ms) var(--motion-spring, ease);
  font-family: var(--m3-font-body, 'Roboto', sans-serif);
}
.m3-fab:active:not(.is-disabled) { transform: scale(0.96); }
@media (prefers-reduced-motion: reduce) {
  .m3-fab { transition: none; }
  .m3-fab:active:not(.is-disabled) { transform: none; }
}
.m3-fab::before {
  content: '';
  position: absolute;
  inset: 0;
  border-radius: inherit;
  background: currentColor;
  opacity: 0;
  pointer-events: none;
  transition: opacity var(--m3-dur-short-2, 100ms) var(--m3-easing-standard, ease);
}
.m3-fab:hover:not(.is-disabled) {
  box-shadow: var(--m3-elev-4, 0 6px 10px rgba(0, 0, 0, 0.2));
}
.m3-fab:hover:not(.is-disabled)::before        { opacity: var(--m3-state-hover, 0.08); }
.m3-fab:focus-visible:not(.is-disabled)::before{ opacity: var(--m3-state-focus, 0.12); }
.m3-fab:active:not(.is-disabled)::before       { opacity: var(--m3-state-pressed, 0.12); }

.m3-fab-small  { width: 40px; height: 40px; border-radius: 12px; }
.m3-fab-regular{ width: 56px; height: 56px; border-radius: 16px; }
.m3-fab-large  { width: 96px; height: 96px; border-radius: 28px; }
.m3-fab.is-extended {
  width: auto;
  height: 56px;
  padding: 0 16px 0 20px;
  border-radius: 16px;
}

.m3-fab-primary {
  background: var(--m3-primary-container, #98f7be);
  color: var(--m3-on-primary-container, #002111);
}
.m3-fab-secondary {
  background: var(--m3-secondary-container, #d3e8d3);
  color: var(--m3-on-secondary-container, #0e1f12);
}
.m3-fab-tertiary {
  background: var(--m3-tertiary-container, #beeaf8);
  color: var(--m3-on-tertiary-container, #001f27);
}
.m3-fab-surface {
  background: var(--m3-surface-container-low, #f1f5ee);
  color: var(--m3-primary, #006d3d);
}

.m3-fab-label {
  white-space: nowrap;
}

.m3-fab.is-disabled {
  cursor: not-allowed;
  opacity: 0.38;
  box-shadow: none;
}
.m3-fab.is-disabled::before { opacity: 0; }
</style>
