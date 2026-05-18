<script setup lang="ts">
/**
 * Material 3 List wrapper.
 * Spec: docs/superpowers/specs/2026-05-13-parent-material3-redesign-design.md §4.4
 */
</script>

<template>
  <ul class="m3-list" role="list">
    <slot />
  </ul>
</template>

<style scoped>
.m3-list {
  list-style: none;
  margin: 0;
  padding: 0;
  background: var(--m3-surface, #f7fbf3);
}
</style>
