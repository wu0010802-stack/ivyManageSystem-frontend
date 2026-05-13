<script setup>
import { computed } from 'vue'
import M3Icon from './M3Icon.vue'

/**
 * Material 3 Segmented Button.
 *
 * Single / multiple selection 兩種模式。
 *
 * Spec: docs/superpowers/specs/2026-05-13-parent-material3-redesign-design.md §6.5
 */
const props = defineProps({
  modelValue: {
    type: [String, Array],
    default: '',
  },
  items: {
    type: Array,
    required: true,
    validator: (arr) =>
      Array.isArray(arr) && arr.every((it) => 'value' in it && 'label' in it),
  },
  multiple: { type: Boolean, default: false },
})

const emit = defineEmits(['update:modelValue'])

function isSelected(value) {
  if (props.multiple) {
    return Array.isArray(props.modelValue) && props.modelValue.includes(value)
  }
  return props.modelValue === value
}

function onSegmentClick(value) {
  if (props.multiple) {
    const cur = Array.isArray(props.modelValue) ? [...props.modelValue] : []
    const idx = cur.indexOf(value)
    if (idx >= 0) cur.splice(idx, 1)
    else cur.push(value)
    emit('update:modelValue', cur)
  } else {
    emit('update:modelValue', value)
  }
}
</script>

<template>
  <div class="m3-segmented-button" role="group">
    <button
      v-for="item in items"
      :key="item.value"
      type="button"
      class="m3-segment"
      :class="{ 'is-selected': isSelected(item.value) }"
      :aria-pressed="isSelected(item.value)"
      @click="onSegmentClick(item.value)"
    >
      <M3Icon
        v-if="isSelected(item.value)"
        name="check"
        :size="18"
        aria-hidden="true"
      />
      <M3Icon
        v-else-if="item.icon"
        :name="item.icon"
        :size="18"
        aria-hidden="true"
      />
      <span class="m3-segment-label m3-label-large">{{ item.label }}</span>
    </button>
  </div>
</template>

<style scoped>
.m3-segmented-button {
  display: inline-flex;
  height: 40px;
  border: 1px solid var(--m3-outline, #727970);
  border-radius: 9999px;
  overflow: hidden;
  background: var(--m3-surface, #f7fbf3);
  font-family: var(--m3-font-body, 'Roboto', sans-serif);
}

.m3-segment {
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 0 16px;
  height: 100%;
  border: none;
  border-left: 1px solid var(--m3-outline, #727970);
  background: transparent;
  color: var(--m3-on-surface, #181d18);
  cursor: pointer;
  white-space: nowrap;
}
.m3-segment:first-child {
  border-left: none;
}

.m3-segment.is-selected {
  background: var(--m3-secondary-container, #d3e8d3);
  color: var(--m3-on-secondary-container, #0e1f12);
}

.m3-segment::before {
  content: '';
  position: absolute;
  inset: 0;
  background: currentColor;
  opacity: 0;
  pointer-events: none;
  transition: opacity var(--m3-dur-short-2, 100ms) var(--m3-easing-standard, ease);
}
.m3-segment:hover::before        { opacity: var(--m3-state-hover, 0.08); }
.m3-segment:focus-visible::before{ opacity: var(--m3-state-focus, 0.12); }
.m3-segment:active::before       { opacity: var(--m3-state-pressed, 0.12); }
</style>
