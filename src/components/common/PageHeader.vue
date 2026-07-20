<template>
  <div class="page-header">
    <div class="page-header__left">
      <div v-if="$slots.icon" class="page-header__icon" aria-hidden="true">
        <slot name="icon" />
      </div>
      <div class="page-header__body">
        <div v-if="$slots['title-extra']" class="page-header__title-row">
          <h2>{{ title }}</h2>
          <slot name="title-extra" />
        </div>
        <h2 v-else>{{ title }}</h2>
        <p v-if="subtitle" class="page-header__subtitle">{{ subtitle }}</p>
        <slot />
      </div>
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
/* 標題字級/顏色/margin 來自全站 src/assets/main.css 的 .page-header h2（單一來源）；
   此處只補元件自身的排版與副標樣式。 */
.page-header__left {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  min-width: 0;
}

.page-header__icon {
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.page-header__body {
  min-width: 0;
}

.page-header__title-row {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  flex-wrap: wrap;
}

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
  .header-actions {
    flex-wrap: wrap;
  }
}
</style>
