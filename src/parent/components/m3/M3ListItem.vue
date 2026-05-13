<script setup>
import { computed, useSlots } from 'vue'
import M3Icon from './M3Icon.vue'

/**
 * Material 3 List Item.
 *
 * 自動依 props 推導高度：
 *   - 只有 headline → one-line (56px)
 *   - headline + supporting OR headline + overline → two-line (72px)
 *   - overline + headline + supporting → three-line (88px)
 *
 * Spec: docs/superpowers/specs/2026-05-13-parent-material3-redesign-design.md §4.4
 */
const props = defineProps({
  headline: { type: String, required: true },
  supportingText: { type: String, default: '' },
  overline: { type: String, default: '' },
  leadingIcon: { type: String, default: '' },
  trailingIcon: { type: String, default: '' },
  clickable: { type: Boolean, default: false },
  disabled: { type: Boolean, default: false },
})

const emit = defineEmits(['click'])

const slots = useSlots()
const hasLeading = computed(() => !!slots.leading || !!props.leadingIcon)
const hasTrailing = computed(() => !!slots.trailing || !!props.trailingIcon)

const lineCount = computed(() => {
  if (props.overline && props.supportingText) return 'three-line'
  if (props.supportingText || props.overline) return 'two-line'
  return 'one-line'
})

const classes = computed(() => ({
  'm3-list-item': true,
  [`m3-list-item-${lineCount.value}`]: true,
  'is-clickable': props.clickable,
  'is-disabled': props.disabled,
}))

const rootAttrs = computed(() =>
  props.clickable && !props.disabled
    ? { role: 'button', tabindex: '0' }
    : props.clickable
      ? { role: 'button', tabindex: '-1', 'aria-disabled': 'true' }
      : {},
)

function onClick(e) {
  if (props.disabled) return
  emit('click', e)
}
</script>

<template>
  <li :class="classes" v-bind="rootAttrs" @click="onClick">
    <span v-if="hasLeading" class="m3-list-item-leading">
      <slot name="leading">
        <M3Icon v-if="leadingIcon" :name="leadingIcon" aria-hidden="true" />
      </slot>
    </span>

    <span class="m3-list-item-content">
      <span v-if="overline" class="m3-list-item-overline m3-label-small">{{ overline }}</span>
      <span class="m3-list-item-headline m3-body-large">{{ headline }}</span>
      <span v-if="supportingText" class="m3-list-item-supporting m3-body-medium">{{ supportingText }}</span>
    </span>

    <span v-if="hasTrailing" class="m3-list-item-trailing">
      <slot name="trailing">
        <M3Icon v-if="trailingIcon" :name="trailingIcon" aria-hidden="true" />
      </slot>
    </span>
  </li>
</template>

<style scoped>
.m3-list-item {
  position: relative;
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 8px 16px;
  color: var(--m3-on-surface, #181d18);
  background: transparent;
  outline: none;
}
.m3-list-item-one-line   { min-height: 56px; }
.m3-list-item-two-line   { min-height: 72px; }
.m3-list-item-three-line { min-height: 88px; }

.m3-list-item-leading,
.m3-list-item-trailing {
  display: inline-flex;
  align-items: center;
  flex-shrink: 0;
  color: var(--m3-on-surface-variant, #424941);
}

.m3-list-item-content {
  display: flex;
  flex-direction: column;
  gap: 2px;
  flex: 1;
  min-width: 0;
}
.m3-list-item-headline {
  color: var(--m3-on-surface, #181d18);
}
.m3-list-item-supporting,
.m3-list-item-overline {
  color: var(--m3-on-surface-variant, #424941);
}

.m3-list-item.is-clickable {
  cursor: pointer;
  transition: background-color var(--m3-dur-short-3, 150ms) var(--m3-easing-standard, ease);
}
.m3-list-item.is-clickable::before {
  content: '';
  position: absolute;
  inset: 0;
  background: var(--m3-on-surface, currentColor);
  opacity: 0;
  pointer-events: none;
  transition: opacity var(--m3-dur-short-2, 100ms) var(--m3-easing-standard, ease);
}
.m3-list-item.is-clickable:hover::before        { opacity: var(--m3-state-hover, 0.08); }
.m3-list-item.is-clickable:focus-visible::before{ opacity: var(--m3-state-focus, 0.12); }
.m3-list-item.is-clickable:active::before       { opacity: var(--m3-state-pressed, 0.12); }

.m3-list-item.is-disabled {
  cursor: not-allowed;
  opacity: 0.38;
}
.m3-list-item.is-disabled::before { opacity: 0; }
</style>
