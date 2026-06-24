<script setup lang="ts">
defineProps<{ title: string }>()
</script>

<template>
  <div class="pt-section-head">
    <h3 class="pt-section-title">{{ title }}</h3>
    <slot name="action" />
  </div>
</template>
