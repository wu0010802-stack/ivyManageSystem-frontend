<script setup lang="ts">
/**
 * 薪資結算前檢查的節慶人數面板 —— 薄殼。
 *
 * 實作已抽成共用元件 `@/components/enrollment/FestivalHeadcountPanel.vue`
 * （2026-08-20），供薪資結算與「考核與年終 › 節慶人數」頁共用同一份 UI 與資料頁。
 * 本檔保留原路徑與 props，既有 StepPrecheck 引用與 spec 不需改動。
 */
import { computed } from 'vue'
import FestivalHeadcountPanel from '@/components/enrollment/FestivalHeadcountPanel.vue'
import { hasPermission } from '@/utils/auth'

defineProps<{ year: number; month: number }>()

// 只持 SALARY_READ（無 SALARY_WRITE）者不該看到產生／確認／重開按鈕——
// 後端 guard 本來就會 403，但按鈕可點是權限呈現不一致（rev-parity）。
// 與「考核與年終 › 節慶人數」頁的 gate 一致。
const canWrite = computed(() => hasPermission('SALARY_WRITE'))
</script>

<template>
  <FestivalHeadcountPanel
    :year="year"
    :month="month"
    mode="coverage"
    :readonly="!canWrite"
    title="節慶人數（節慶／超額獎金人數）"
  />
</template>
