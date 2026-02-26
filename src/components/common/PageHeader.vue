<template>
  <div class="page-header">
    <div class="page-header__left">
      <h2>{{ title }}</h2>
      <p v-if="subtitle" class="page-header__subtitle">{{ subtitle }}</p>
    </div>
    <div v-if="$slots.actions" class="header-actions">
      <slot name="actions" />
    </div>
  </div>
  <div v-if="$slots.filters" class="filter-bar">
    <slot name="filters" />
  </div>
</template>

<script setup>
defineProps({
  title: { type: String, required: true },
  subtitle: { type: String, default: '' }
})
</script>

<style scoped>
.page-header__subtitle {
  margin: 4px 0 0;
  font-size: var(--text-sm);
  color: var(--text-tertiary);
}
</style>
