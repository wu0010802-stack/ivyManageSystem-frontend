<script setup lang="ts">
/**
 * TargetCrossRef — 三處目標人數對照（Task B6）
 *
 * 考核週期目標（AppraisalCycle.enrollment_target）、年終 org_settings 目標
 * （OrgYearSettings.enrollment_target）、實際註冊值三處分屬不同資料表，
 * 資料模型整併不在本案範圍——本元件僅純呈現三值對照 + 來源說明，
 * 協助使用者發現三處輸入不一致時自行到對應頁面核對/修正。
 *
 * 純呈現、無 API：三個 props 由各宿主頁面自身已載入的 state 傳入；
 * 若宿主頁面本身無法取得某一來源（例：YearEndConfigView 沒有考核週期資料），
 * 該 prop 傳 null，元件需容忍——只呈現「—」，不納入不一致判斷。
 */
import { computed } from 'vue'

const props = defineProps<{
  cycleTarget: number | null
  orgSettingTarget: number | null
  actual: number | null
}>()

function fmt(v: number | null): string {
  return v == null ? '—' : String(v)
}

// 只比較「兩個目標來源」（考核週期目標 vs 年終設定目標）是否一致；
// 「實際註冊」是結果值非目標設定，不納入不一致判斷（比照 brief 定義）。
// 任一來源缺值（null）時無從比較，不視為不一致。
const mismatch = computed(
  () => new Set([props.cycleTarget, props.orgSettingTarget].filter((v) => v != null)).size > 1,
)
</script>

<template>
  <div class="target-cross-ref">
    <el-tooltip content="考核週期目標人數（AppraisalCycle.enrollment_target），於「考核與年終 → 學年度目標人數」設定" placement="top">
      <el-tag size="small" data-test="tag-cycle-target">考核週期目標：{{ fmt(cycleTarget) }}</el-tag>
    </el-tooltip>
    <el-tooltip content="年終設定目標人數（OrgYearSettings.enrollment_target），於「年終結算 → 本期設定 → 全校目標」設定" placement="top">
      <el-tag size="small" data-test="tag-org-setting-target">年終設定目標：{{ fmt(orgSettingTarget) }}</el-tag>
    </el-tooltip>
    <el-tooltip content="實際註冊人數，由系統依當期在籍學生數自動統計" placement="top">
      <el-tag size="small" type="info" data-test="tag-actual">實際註冊：{{ fmt(actual) }}</el-tag>
    </el-tooltip>
    <span v-if="mismatch" data-test="target-mismatch" class="warn">三處目標不一致，請確認</span>
  </div>
</template>

<style scoped>
.target-cross-ref {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: var(--space-2);
  margin-top: var(--space-1);
}

.warn {
  font-size: var(--text-xs);
  color: var(--color-warning-hover);
}
</style>
