<script setup lang="ts">
import { computed } from 'vue'
import { hasPermission } from '@/utils/auth'
const props = defineProps<{ excludePath?: string }>()

// 只集中導向既有工作區；未查詢的模組不顯示零筆或已完成。
const entries = computed(() => [
  { label: '人事簽核', description: '請假、加班與補打卡待審', path: '/workbench', codes: ['APPROVALS'] },
  { label: '學費待辦', description: '未收、漏單、交接、媒合與關帳', path: '/fees', codes: ['FEES_READ'] },
  { label: '收付款與固定支出', description: '送審、收付與補憑證', path: '/finance-signoffs', codes: ['VENDOR_PAYMENT_READ', 'MISC_RECEIPT_READ'] },
  { label: '考核待辦', description: '資料準備、例外與簽核', path: '/appraisal-year-end/appraisal', codes: ['APPRAISAL_READ'] },
  { label: '年終待辦', description: '結算、覆核與核定', path: '/appraisal-year-end/year-end', codes: ['YEAR_END_READ'] },
  { label: '高風險事件', description: '檢查未讀風險事件', path: '/governance/high-risk', codes: ['HIGH_RISK_READ'] },
  { label: '資料異常待辦', description: '檢查並處理資料缺漏', path: '/governance/data-quality', codes: ['DATA_QUALITY_READ'] },
].filter(entry => entry.path !== props.excludePath && entry.codes.some(code => hasPermission(code))))
</script>

<template>
  <section v-if="entries.length" class="task-workspaces" aria-label="各模組待辦入口">
    <h2>各模組待辦入口</h2>
    <p>依您的權限顯示。各工作區會載入自己的待辦與處理狀態，不納入人事與出勤摘要筆數。</p>
    <ul>
      <li v-for="entry in entries" :key="entry.path">
        <router-link :to="entry.path">{{ entry.label }} →</router-link>
        <span>{{ entry.description }}</span>
      </li>
    </ul>
  </section>
</template>

<style scoped>
.task-workspaces { margin-block: var(--space-6); }
h2 { font-size: var(--font-size-lg, 18px); }
p, span { color: var(--text-secondary); font-size: var(--font-size-sm, 14px); }
ul { list-style: none; padding: 0; display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: var(--space-4); }
li { display: flex; flex-direction: column; gap: var(--space-1); }
a { color: var(--brand-primary); padding-block: var(--space-2); }
</style>
