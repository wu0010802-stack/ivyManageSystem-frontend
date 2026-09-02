<script setup lang="ts">
/**
 * 考核與年終 › 節慶人數。
 *
 * 與薪資結算 StepPrecheck 共用同一元件與同一資料頁（`FestivalHeadcountPanel`），
 * 讓 HR 不必為了核對人數在兩個模組之間切換。
 *
 * 權限：沿用 `SALARY_READ` / `SALARY_WRITE`（業主裁定 D4）。只持 `APPRAISAL_*` /
 * `YEAR_END_*` 者看不到本頁——依據是 navigation manifest 的 appraisalYearEnd
 * 群組 `sharedViews` 已含 `SALARY_READ`，屬既有慣例。
 */
import { ref, computed } from 'vue'
import FestivalHeadcountPanel from '@/components/enrollment/FestivalHeadcountPanel.vue'
import { hasPermission } from '@/utils/auth'
import { todayISO } from '@/utils/format'

const canRead = computed(() => hasPermission('SALARY_READ'))
const canWrite = computed(() => hasPermission('SALARY_WRITE'))

const today = todayISO()
const year = ref(Number(today.slice(0, 4)))
const month = ref(Number(today.slice(5, 7)))

const YEARS = computed(() => {
    const base = Number(today.slice(0, 4))
    return [base - 2, base - 1, base, base + 1]
})
const MONTHS = Array.from({ length: 12 }, (_, i) => i + 1)
</script>

<template>
  <div class="fh-page">
    <el-alert
      v-if="!canRead"
      type="info"
      :closable="false"
      title="需要「薪資檢視」權限才能檢視節慶人數"
      description="節慶人數同時供薪資、年終與考核使用，權限沿用薪資模組（SALARY_READ / SALARY_WRITE）。"
    />
    <template v-else>
      <div class="fh-toolbar">
        <el-select v-model="year" size="small" class="fh-select">
          <el-option v-for="y in YEARS" :key="y" :label="`${y} 年`" :value="y" />
        </el-select>
        <el-select v-model="month" size="small" class="fh-select">
          <el-option v-for="m in MONTHS" :key="m" :label="`${m} 月`" :value="m" />
        </el-select>
      </div>
      <FestivalHeadcountPanel
        :year="year"
        :month="month"
        mode="single"
        :readonly="!canWrite"
        title="節慶人數（月度共用人數）"
      />
      <p class="fh-note">
        本頁的「最終節慶人數」是薪資節慶／超額獎金、年終超額與節慶差額、
        考核帶班超編的共同來源。考核的基礎分數（9/15、3/15 註冊人數）不使用本頁數字，
        仍在「學年目標人數」頁維護。
      </p>
    </template>
  </div>
</template>

<style scoped>
.fh-page {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}

.fh-toolbar {
  display: flex;
  gap: var(--space-2);
}

.fh-select {
  width: 110px;
}

.fh-note {
  margin: 0;
  color: var(--text-tertiary);
  font-size: var(--text-sm);
}
</style>
