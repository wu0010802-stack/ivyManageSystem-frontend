<script setup lang="ts">
import { computed } from 'vue'

/**
 * Material 3 Divider.
 * Spec: docs/superpowers/specs/2026-05-13-parent-material3-redesign-design.md §4
 */
const props = withDefaults(defineProps<{
  inset?: boolean
  vertical?: boolean
}>(), {
  inset: false,
  vertical: false,
})

const classes = computed<Record<string, boolean>>(() => ({
  'm3-divider': true,
  'is-inset': props.inset,
  'is-vertical': props.vertical,
}))

const ariaOrientation = computed<'vertical' | undefined>(() =>
  props.vertical ? 'vertical' : undefined,
)
</script>

<template>
  <hr :class="classes" role="separator" :aria-orientation="ariaOrientation" />
</template>

<style scoped>
.m3-divider {
  border: none;
  margin: 0;
  background: var(--m3-outline-variant, #c2c9be);
  height: 1px;
  width: 100%;
}
.m3-divider.is-inset {
  margin-left: 16px;
  width: calc(100% - 16px);
}
.m3-divider.is-vertical {
  width: 1px;
  height: auto;
  align-self: stretch;
}
</style>
