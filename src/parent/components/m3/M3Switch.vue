<script setup>
import { computed } from 'vue'

/**
 * Material 3 Switch.
 * Spec: docs/superpowers/specs/2026-05-13-parent-material3-redesign-design.md §6.6
 */
const props = defineProps({
  modelValue: { type: Boolean, default: false },
  disabled: { type: Boolean, default: false },
})

const emit = defineEmits(['update:modelValue'])

const classes = computed(() => ({
  'm3-switch': true,
  'is-checked': props.modelValue,
  'is-disabled': props.disabled,
}))

function onClick() {
  if (props.disabled) return
  emit('update:modelValue', !props.modelValue)
}
</script>

<template>
  <button
    :class="classes"
    type="button"
    role="switch"
    :aria-checked="modelValue ? 'true' : 'false'"
    :disabled="disabled"
    @click="onClick"
  >
    <span class="m3-switch-track">
      <span class="m3-switch-thumb" />
    </span>
  </button>
</template>

<style scoped>
.m3-switch {
  position: relative;
  display: inline-block;
  width: 52px;
  height: 32px;
  padding: 0;
  border: none;
  background: transparent;
  cursor: pointer;
}

.m3-switch-track {
  position: absolute;
  inset: 0;
  border-radius: 9999px;
  background: var(--m3-surface-container-highest, #e0e4dc);
  border: 2px solid var(--m3-outline, #727970);
  transition: background-color var(--m3-dur-short-3, 150ms) var(--m3-easing-standard, ease),
    border-color var(--m3-dur-short-3, 150ms) var(--m3-easing-standard, ease);
}

.m3-switch-thumb {
  position: absolute;
  top: 50%;
  left: 6px;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: var(--m3-outline, #727970);
  transform: translateY(-50%);
  transition: transform var(--m3-dur-short-3, 150ms) var(--m3-easing-emphasized-decel, ease),
    width var(--m3-dur-short-3, 150ms) var(--m3-easing-emphasized-decel, ease),
    height var(--m3-dur-short-3, 150ms) var(--m3-easing-emphasized-decel, ease),
    background-color var(--m3-dur-short-3, 150ms) var(--m3-easing-standard, ease);
}

.m3-switch.is-checked .m3-switch-track {
  background: var(--m3-primary, #006d3d);
  border-color: var(--m3-primary, #006d3d);
}
.m3-switch.is-checked .m3-switch-thumb {
  background: var(--m3-on-primary, #ffffff);
  width: 24px;
  height: 24px;
  left: auto;
  right: 2px;
  transform: translateY(-50%);
}

.m3-switch.is-disabled {
  opacity: 0.38;
  cursor: not-allowed;
}
</style>
