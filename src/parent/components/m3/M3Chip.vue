<script setup lang="ts">
import { computed } from 'vue'
import M3Icon from './M3Icon.vue'

/**
 * Material 3 Chip.
 *
 * Variants:
 *   - assist     (預設) 動作提示 chip
 *   - filter     可切換選中態（用 selected prop）
 *   - input      輸入 token，可 removable
 *   - suggestion AI 建議 chip
 *
 * Spec: docs/superpowers/specs/2026-05-13-parent-material3-redesign-design.md §4.5
 */
const props = withDefaults(defineProps<{
  variant?: string
  selected?: boolean
  icon?: string
  removable?: boolean
  disabled?: boolean
}>(), {
  variant: 'assist',
  selected: false,
  icon: '',
  removable: false,
  disabled: false,
})

const emit = defineEmits<{
  'click': [event: MouseEvent]
  'remove': [event: Event]
}>()

const showLeadingCheck = computed<boolean>(
  () => props.variant === 'filter' && props.selected,
)
const leadingIconName = computed<string>(() =>
  showLeadingCheck.value ? 'check' : props.icon,
)
const hasLeading = computed<boolean>(() => !!leadingIconName.value)

const classes = computed<Record<string, boolean>>(() => ({
  'm3-chip': true,
  [`m3-chip-${props.variant}`]: true,
  'is-selected': props.selected,
  'is-disabled': props.disabled,
}))

function onClick(e: MouseEvent): void {
  if (props.disabled) return
  emit('click', e)
}
function onRemove(e: Event): void {
  e.stopPropagation()
  if (props.disabled) return
  emit('remove', e)
}
</script>

<template>
  <button
    :class="classes"
    type="button"
    :disabled="disabled"
    @click="onClick"
  >
    <M3Icon
      v-if="hasLeading"
      class="m3-chip-leading"
      :name="leadingIconName"
      :size="18"
      aria-hidden="true"
    />
    <span class="m3-chip-label m3-label-large">
      <slot />
    </span>
    <span
      v-if="removable"
      class="m3-chip-remove"
      role="button"
      aria-label="移除"
      tabindex="0"
      @click="onRemove"
      @keydown.enter.prevent="onRemove"
    >
      <M3Icon name="close" :size="18" aria-hidden="true" />
    </span>
  </button>
</template>

<style scoped>
.m3-chip {
  position: relative;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  height: 32px;
  padding: 0 16px;
  border: 1px solid var(--m3-outline, #727970);
  border-radius: 9999px;
  background: var(--m3-surface-container-low, #f1f5ee);
  color: var(--m3-on-surface, #181d18);
  cursor: pointer;
  transition:
    background-color var(--m3-dur-short-3, 150ms) var(--m3-easing-standard, ease),
    border-color var(--m3-dur-short-3, 150ms) var(--m3-easing-standard, ease);
}
.m3-chip::before {
  content: '';
  position: absolute;
  inset: 0;
  border-radius: inherit;
  background: currentColor;
  opacity: 0;
  pointer-events: none;
  transition: opacity var(--m3-dur-short-2, 100ms) var(--m3-easing-standard, ease);
}
.m3-chip::after {
  /* 命中區擴張：視覺尺寸維持 M3 規格，透明 ::after 以本體為中心撐到 ≥48px 觸控熱區
   * （::before 已是 state layer）。本體不設 overflow，偽元素可超出邊界；點到它即點到本體。 */
  content: '';
  position: absolute;
  top: 50%;
  left: 50%;
  width: max(100%, var(--touch-target-m3, 48px));
  height: max(100%, var(--touch-target-m3, 48px));
  transform: translate(-50%, -50%);
}
.m3-chip:hover:not(.is-disabled)::before        { opacity: var(--m3-state-hover, 0.08); }
.m3-chip:focus-visible:not(.is-disabled)::before{ opacity: var(--m3-state-focus, 0.12); }
.m3-chip:active:not(.is-disabled)::before       { opacity: var(--m3-state-pressed, 0.12); }

.m3-chip.is-selected {
  background: var(--m3-secondary-container, #d3e8d3);
  color: var(--m3-on-secondary-container, #0e1f12);
  border-color: transparent;
}

.m3-chip-leading { color: inherit; }
.m3-chip-label { white-space: nowrap; }
.m3-chip-remove {
  /* 疊在命中區 ::after 之上，否則點移除鈕會被當成點整顆 chip */
  position: relative;
  z-index: 1;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  padding: 0;
  margin-left: 4px;
  background: transparent;
  border: none;
  cursor: pointer;
  color: inherit;
  border-radius: 50%;
}
.m3-chip-remove:hover {
  background: rgba(0, 0, 0, 0.08);
}

.m3-chip.is-disabled {
  cursor: not-allowed;
  opacity: 0.38;
}
.m3-chip.is-disabled::before { opacity: 0; }

.m3-chip:has(.m3-chip-leading) { padding-left: 8px; }
.m3-chip:has(.m3-chip-remove)  { padding-right: 8px; }
</style>
