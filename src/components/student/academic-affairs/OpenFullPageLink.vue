<script setup lang="ts">
// 「查看全部 ↗」：從學生儀表板（TodayTasksPanel）的請假／評量／事件區塊開對應的完整列表頁。
// 後台 IA 重整 M3：/student-leaves、/student-assessments、/student-incidents 沒有選單、
// 也沒有任何入站連結（SectionCard 的 openFullRoute prop 從未被傳入），在這裡補上入口。
// 新分頁開啟：保留儀表板目前的班級／日期篩選狀態。
import type { RouteLocationRaw } from 'vue-router'

defineProps<{
  to: RouteLocationRaw
  /** 區塊名稱（請假／評量／事件），組成「查看全部請假 ↗」 */
  label: string
}>()
</script>

<template>
  <router-link
    :to="to"
    target="_blank"
    rel="noopener"
    class="open-full-link"
    :title="`在新分頁開啟完整${label}頁`"
  >
    查看全部{{ label }} ↗
  </router-link>
</template>

<style scoped>
.open-full-link {
  font-size: var(--text-sm);
  color: var(--text-secondary);
  text-decoration: none;
  white-space: nowrap;
  padding: 0 6px;
}
.open-full-link:hover {
  color: var(--color-info-darker);
  text-decoration: underline;
}
</style>
