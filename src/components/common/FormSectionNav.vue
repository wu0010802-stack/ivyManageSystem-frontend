<!-- src/components/common/FormSectionNav.vue
     wide 分型表單的左側區段導覽（2026-08-18 admin 新增表單重整）：
     列出表單區段，帶錯誤徽章；點擊由父層捲動至對應區段（並展開收合區）。
     只負責導覽視覺，不持有任何表單狀態；--to-md 以下整個隱藏（窄螢幕回到
     純收合單欄模式）。 -->
<script setup lang="ts">
export interface FormNavSection {
  key: string
  title: string
  /** 驗證錯誤數（>0 顯示紅色徽章；沿用 FormSection 的 sectionErrors 計數） */
  errorCount?: number
}

defineProps<{ sections: FormNavSection[] }>()

const emit = defineEmits<{ select: [key: string] }>()
</script>

<template>
  <nav class="form-section-nav" aria-label="表單區段導覽">
    <button
      v-for="s in sections"
      :key="s.key"
      type="button"
      class="form-section-nav__item"
      :data-nav-section="s.key"
      @click="emit('select', s.key)"
    >
      <span class="form-section-nav__title">{{ s.title }}</span>
      <span
        v-if="(s.errorCount ?? 0) > 0"
        class="form-section-nav__badge"
        :aria-label="`${s.errorCount} 個錯誤`"
      >{{ s.errorCount }}</span>
    </button>
  </nav>
</template>

<style scoped>
.form-section-nav {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.form-section-nav__item {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  width: 100%;
  padding: var(--space-2) var(--space-3);
  border: none;
  background: none;
  border-radius: var(--radius-md);
  font: inherit;
  font-size: var(--text-base);
  color: var(--el-text-color-regular);
  text-align: left;
  cursor: pointer;
  transition: background-color var(--transition-fast), color var(--transition-fast);
}
.form-section-nav__item:hover {
  background: var(--bg-color-soft);
  color: var(--el-text-color-primary);
}
.form-section-nav__item:focus-visible {
  outline: 2px solid var(--el-color-primary);
  outline-offset: 2px;
}
.form-section-nav__badge {
  margin-left: auto;
  min-width: 18px;
  height: 18px;
  padding: 0 6px;
  border-radius: var(--radius-full);
  background: var(--el-color-danger);
  /* #fff 刻意寫死：白字壓飽和 danger 在 light/dark 皆正確（同 FormSection badge） */
  color: #fff;
  font-size: var(--text-xs);
  font-weight: 600;
  line-height: 18px;
  text-align: center;
}
/* 窄螢幕（<1024px）隱藏導覽，表單回到單欄＋收合模式 */
@media (--to-md) {
  .form-section-nav {
    display: none;
  }
}
</style>
