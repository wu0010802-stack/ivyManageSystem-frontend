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
    gap: var(--space-3);
    margin-bottom: var(--space-4);
  }
  .page-header__left {
    flex: 1 1 100%;
  }

  /* 緊湊標題：--text-3xl 在 390px 手機吃掉整個第一屏，且過長頁名會斷成兩行把
     副標推更下面。降一階字級並限制兩行，資訊不刪、只收高度。 */
  .page-header h2 {
    font-size: var(--text-xl);
    line-height: 1.3;
  }
  .page-header__subtitle {
    font-size: var(--text-xs);
  }

  /* 動作區：原本 flex-wrap 讓 4–6 個按鈕堆成兩三行按鈕牆。改為整寬、每列兩顆
     等寬，觸控目標 44px；動作全部保留可見，不靠橫捲藏起來。 */
  .header-actions {
    flex-wrap: wrap;
    width: 100%;
    gap: var(--space-2);
  }
  /* 動作是 parent 傳進來的 slot 內容，帶的是 parent 的 scope id，
     必須用 :deep 才選得到 */
  :deep(.header-actions > *) {
    flex: 1 1 calc(50% - var(--space-2));
    min-width: 0;
  }
  :deep(.header-actions .el-button) {
    min-height: var(--touch-target-min);
    margin-left: 0;
  }
  /* EP 的按鈕群組／下拉本身就是一個單位，內部不再切半 */
  :deep(.header-actions .el-button-group),
  :deep(.header-actions .el-dropdown) {
    display: flex;
  }
  :deep(.header-actions .el-button-group .el-button) {
    flex: 1 1 0;
  }

  .filter-bar {
    gap: var(--space-2);
  }
}
</style>
