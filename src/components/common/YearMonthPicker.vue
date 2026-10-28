<script setup lang="ts">
/**
 * 人事薪資頁共用的年／月選擇器（PageHeader actions 區兩個 el-select）。
 *
 * 年份選項以「目前選到的年」為中心：year - yearsBefore … year + yearsAfter，
 * 與原本各頁自寫的 `yearOptions = [year - 1, year, year + 1]` 行為相同。
 * 只收斂行為一致的頁面（結薪、薪資管理、薪資總覽）；年份視窗固定於「今年」、
 * 或選完就自動查詢等行為不同的選擇器（加班、會議、模擬試算、才藝鐘點費、
 * 考勤 WorkspaceHeader 等）仍各自保留。
 */
import { computed } from 'vue'

const props = withDefaults(
  defineProps<{
    yearsBefore?: number
    yearsAfter?: number
    disabled?: boolean
  }>(),
  { yearsBefore: 1, yearsAfter: 1, disabled: false },
)

const year = defineModel<number>('year', { required: true })
const month = defineModel<number>('month', { required: true })

const yearOptions = computed(() => {
  const options: number[] = []
  for (let y = year.value - props.yearsBefore; y <= year.value + props.yearsAfter; y++) options.push(y)
  return options
})
</script>

<template>
  <el-select v-model="year" style="width: 100px" aria-label="年份" :disabled="disabled">
    <el-option v-for="y in yearOptions" :key="y" :value="y" :label="`${y} 年`" />
  </el-select>
  <el-select v-model="month" style="width: 90px" aria-label="月份" :disabled="disabled">
    <el-option v-for="m in 12" :key="m" :value="m" :label="`${m} 月`" />
  </el-select>
</template>
