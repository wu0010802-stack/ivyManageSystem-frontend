<template>
  <el-card shadow="never" class="wb-side-card" data-test="wb-freshness-sidebar">
    <template #header><span class="wb-side-card__title">資料新鮮度</span></template>
    <p class="wb-side-card__hint">
      同步不會自動執行。如需查看考核資料最後更新時間並手動觸發更新，請至考核工作區「準備資料」階段查看。
    </p>
    <router-link to="/appraisal-year-end/appraisal">前往考核工作區 →</router-link>
  </el-card>
</template>

<style scoped>
.wb-side-card__title { font-weight: 600; }
.wb-side-card__hint { font-size: var(--text-sm); color: var(--text-secondary); margin: 0 0 var(--space-2); }
</style>
