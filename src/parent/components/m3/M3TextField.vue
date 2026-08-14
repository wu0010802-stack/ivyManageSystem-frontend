<script setup lang="ts">
import { computed, ref } from 'vue'

/**
 * Material 3 Text Field.
 *
 * Variants: filled (預設) / outlined
 * 浮動 label：focus 或有值時 label 上移
 *
 * Spec: docs/superpowers/specs/2026-05-13-parent-material3-redesign-design.md §6.4
 */
const props = withDefaults(defineProps<{
  modelValue?: string | number
  variant?: string
  label?: string
  placeholder?: string
  supportingText?: string
  error?: boolean
  errorText?: string
  disabled?: boolean
  type?: string
}>(), {
  modelValue: '',
  variant: 'filled',
  label: '',
  placeholder: '',
  supportingText: '',
  error: false,
  errorText: '',
  disabled: false,
  type: 'text',
})

const emit = defineEmits<{
  'update:modelValue': [value: string]
}>()

const isFocused = ref<boolean>(false)

const hasValue = computed<boolean>(
  () => props.modelValue !== '' && props.modelValue != null,
)
const labelFloating = computed<boolean>(() => isFocused.value || hasValue.value)

const classes = computed<Record<string, boolean>>(() => ({
  'm3-text-field': true,
  [`m3-text-field-${props.variant}`]: true,
  'is-focused': isFocused.value,
  'is-error': props.error,
  'is-disabled': props.disabled,
  'has-value': hasValue.value,
  'has-floating-label': labelFloating.value && !!props.label,
}))

const supportingDisplay = computed<string>(() =>
  props.error && props.errorText ? props.errorText : props.supportingText,
)

function onInput(e: Event): void {
  emit('update:modelValue', (e.target as HTMLInputElement).value)
}
</script>

<template>
  <div :class="classes">
    <div class="m3-text-field-control">
      <label v-if="label" class="m3-text-field-label">{{ label }}</label>
      <input
        :type="type"
        :value="modelValue"
        :placeholder="placeholder"
        :disabled="disabled"
        class="m3-text-field-input"
        @focus="isFocused = true"
        @blur="isFocused = false"
        @input="onInput"
      />
    </div>
    <span
      v-if="supportingDisplay"
      class="m3-text-field-supporting m3-body-small"
    >{{ supportingDisplay }}</span>
  </div>
</template>

<style scoped>
.m3-text-field {
  display: inline-flex;
  flex-direction: column;
  gap: 4px;
  width: 100%;
  font-family: var(--m3-font-body, 'Roboto', sans-serif);
}

.m3-text-field-control {
  position: relative;
  display: flex;
  align-items: center;
  min-height: 56px;
  background: transparent;
}

.m3-text-field-label {
  position: absolute;
  top: 16px;
  left: 16px;
  color: var(--m3-on-surface-variant, #424941);
  font-size: 16px;
  pointer-events: none;
  transition: transform var(--m3-dur-short-3, 150ms) var(--m3-easing-standard, ease),
    font-size var(--m3-dur-short-3, 150ms) var(--m3-easing-standard, ease),
    color var(--m3-dur-short-3, 150ms) var(--m3-easing-standard, ease);
  transform-origin: top left;
}
.m3-text-field.has-floating-label .m3-text-field-label {
  transform: translateY(-12px) scale(0.75);
  color: var(--m3-primary, #006d3d);
}

.m3-text-field-input {
  width: 100%;
  height: 56px;
  padding: 24px 16px 8px;
  border: none;
  outline: none;
  background: transparent;
  color: var(--m3-on-surface, #181d18);
  font-family: inherit;
  font-size: 16px;
}

.m3-text-field-filled .m3-text-field-control {
  background: var(--m3-surface-container-highest, #e0e4dc);
  border-radius: var(--pt-control-radius, 14px) var(--pt-control-radius, 14px) 0 0;
  border-bottom: 1px solid var(--m3-on-surface-variant, #424941);
}
.m3-text-field-filled.is-focused .m3-text-field-control {
  border-bottom: 2px solid var(--m3-primary, #006d3d);
}

.m3-text-field-outlined .m3-text-field-control {
  border: 1px solid var(--m3-outline, #727970);
  border-radius: var(--pt-control-radius, 14px);
}
.m3-text-field-outlined.is-focused .m3-text-field-control {
  border: 2px solid var(--m3-primary, #006d3d);
}

.m3-text-field.is-error.m3-text-field-filled .m3-text-field-control {
  border-bottom-color: var(--m3-error, #ba1a1a);
}
.m3-text-field.is-error.m3-text-field-outlined .m3-text-field-control {
  border-color: var(--m3-error, #ba1a1a);
}
.m3-text-field.is-error .m3-text-field-label {
  color: var(--m3-error, #ba1a1a);
}
.m3-text-field.is-error .m3-text-field-supporting {
  color: var(--m3-error, #ba1a1a);
}

.m3-text-field-supporting {
  padding: 0 16px;
  color: var(--m3-on-surface-variant, #424941);
}

.m3-text-field.is-disabled {
  opacity: 0.38;
  pointer-events: none;
}
</style>
