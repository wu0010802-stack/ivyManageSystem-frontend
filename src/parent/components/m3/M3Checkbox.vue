<script setup lang="ts">
import { computed } from 'vue'

/**
 * Material 3 Checkbox.
 * Spec: docs/superpowers/specs/2026-05-13-parent-material3-redesign-design.md §6.6
 */
const props = withDefaults(defineProps<{
  modelValue?: boolean
  indeterminate?: boolean
  disabled?: boolean
}>(), {
  modelValue: false,
  indeterminate: false,
  disabled: false,
})

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
}>()

const ariaChecked = computed<'mixed' | 'true' | 'false'>(() => {
  if (props.indeterminate) return 'mixed'
  return props.modelValue ? 'true' : 'false'
})

const classes = computed<Record<string, boolean>>(() => ({
  'm3-checkbox': true,
  'is-checked': props.modelValue,
  'is-indeterminate': props.indeterminate,
  'is-disabled': props.disabled,
}))

function onClick(): void {
  if (props.disabled) return
  emit('update:modelValue', !props.modelValue)
}
</script>

<template>
  <button
    :class="classes"
    type="button"
    role="checkbox"
    :aria-checked="ariaChecked"
    :disabled="disabled"
    @click="onClick"
  >
    <span class="m3-checkbox-box">
      <span v-if="indeterminate" class="m3-checkbox-indeterminate" />
      <span v-else-if="modelValue" class="m3-checkbox-check">✓</span>
    </span>
  </button>
</template>

<style scoped>
.m3-checkbox {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  padding: 0;
  border: none;
  background: transparent;
  cursor: pointer;
}
.m3-checkbox-box {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  border: 2px solid var(--m3-on-surface-variant, #424941);
  border-radius: 2px;
  background: transparent;
  transition: background-color var(--motion-quick, 150ms) ease,
    border-color var(--motion-quick, 150ms) ease;
  color: var(--m3-on-primary, #ffffff);
  font-size: 14px;
  line-height: 1;
}
.m3-checkbox.is-checked .m3-checkbox-box,
.m3-checkbox.is-indeterminate .m3-checkbox-box {
  background: var(--m3-primary, #006d3d);
  border-color: var(--m3-primary, #006d3d);
}
.m3-checkbox-indeterminate {
  display: block;
  width: 10px;
  height: 2px;
  background: var(--m3-on-primary, #ffffff);
}
.m3-checkbox.is-disabled {
  opacity: 0.38;
  cursor: not-allowed;
}
</style>
