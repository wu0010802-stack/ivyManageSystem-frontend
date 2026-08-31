<script setup lang="ts">
import { computed } from 'vue'

/**
 * Material 3 Radio Button.
 * Spec: docs/superpowers/specs/2026-05-13-parent-material3-redesign-design.md §6.6
 */
const props = withDefaults(defineProps<{
  modelValue?: unknown
  value: unknown
  name?: string
  disabled?: boolean
}>(), {
  modelValue: undefined,
  name: '',
  disabled: false,
})

const emit = defineEmits<{
  'update:modelValue': [value: unknown]
}>()

const isSelected = computed<boolean>(() => props.modelValue === props.value)

const classes = computed<Record<string, boolean>>(() => ({
  'm3-radio': true,
  'is-selected': isSelected.value,
  'is-disabled': props.disabled,
}))

function onClick(): void {
  if (props.disabled) return
  if (!isSelected.value) {
    emit('update:modelValue', props.value)
  }
}
</script>

<template>
  <button
    :class="classes"
    type="button"
    role="radio"
    :aria-checked="isSelected ? 'true' : 'false'"
    :disabled="disabled"
    :name="name || undefined"
    @click="onClick"
  >
    <span class="m3-radio-outer">
      <span v-if="isSelected" class="m3-radio-inner" />
    </span>
  </button>
</template>

<style scoped>
.m3-radio {
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
.m3-radio-outer {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  border: 2px solid var(--m3-on-surface-variant, #424941);
  border-radius: 50%;
  background: transparent;
  transition: border-color var(--motion-quick, 150ms) ease;
}
.m3-radio.is-selected .m3-radio-outer {
  border-color: var(--m3-primary, #006d3d);
}
.m3-radio-inner {
  display: block;
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: var(--m3-primary, #006d3d);
}
.m3-radio.is-disabled {
  opacity: 0.38;
  cursor: not-allowed;
}
</style>
