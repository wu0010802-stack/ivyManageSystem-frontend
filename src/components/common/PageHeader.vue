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

<script setup lang="ts">
withDefaults(defineProps<{
  title: string
  subtitle?: string
}>(), {
  subtitle: '',
})
</script>

<style scoped>
.page-header__subtitle {
  margin: 4px 0 0;
  font-size: var(--text-sm);
  color: var(--text-tertiary);
}

/* F-4：.page-header 的 flex nowrap 來自全站 src/assets/main.css（非 scoped）；
   窄螢幕下右側 .header-actions（下拉/按鈕組）不收縮，把左側標題擠到只剩幾 px
   寬，逐字直排、副標破版。scoped 選擇器（.page-header[data-v-xxx]）specificity
   高於 main.css 的裸 class，安全覆寫且只在窄斷點生效，桌機版不變。 */
@media (--to-sm) {
  .page-header {
    flex-wrap: wrap;
  }
  .page-header__left {
    flex: 1 1 auto;
  }
}
</style>
