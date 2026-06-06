<script setup lang="ts">
import { computed } from 'vue'
import { money } from '@/utils/format'
import { nonZeroLines, hasSeparateTransfer, type PayslipDetail } from './salaryHistoryDetail'

const props = defineProps<{ detail: PayslipDetail }>()
const income = computed(() => nonZeroLines(props.detail.income))
const separate = computed(() => nonZeroLines(props.detail.separate_transfer))
const deductions = computed(() => nonZeroLines(props.detail.deductions))
const showSeparate = computed(() => hasSeparateTransfer(props.detail))
</script>

<template>
  <div class="sh-detail">
    <section class="sh-region">
      <h4>進帳收入（計入應發/實發）</h4>
      <div v-for="line in income" :key="line.key" class="sh-line">
        <span>{{ line.label }}<small v-if="line.note">（{{ line.note }}）</small></span>
        <span>{{ money(line.amount) }}</span>
      </div>
      <div class="sh-line sh-subtotal">
        <span>應發合計</span><span>{{ money(detail.income_subtotal) }}</span>
      </div>
    </section>

    <section v-if="showSeparate" class="sh-region">
      <h4>另行轉帳（不進實發，另一條金流）</h4>
      <div v-for="line in separate" :key="line.key" class="sh-line">
        <span>{{ line.label }}</span><span>{{ money(line.amount) }}</span>
      </div>
      <div class="sh-line sh-subtotal">
        <span>另行轉帳小計</span><span>{{ money(detail.separate_subtotal) }}</span>
      </div>
    </section>

    <section class="sh-region">
      <h4>扣款</h4>
      <template v-for="line in deductions" :key="line.key">
        <div class="sh-line">
          <span>{{ line.label }}</span><span class="sh-neg">-{{ money(line.amount) }}</span>
        </div>
        <div v-for="child in (line.children || [])" :key="child.key" class="sh-line sh-child">
          <span>{{ child.label }}</span><span>-{{ money(child.amount) }}</span>
        </div>
      </template>
      <div class="sh-line sh-subtotal">
        <span>扣款合計</span><span class="sh-neg">-{{ money(detail.deduction_subtotal) }}</span>
      </div>
    </section>

    <div class="sh-line sh-net">
      <span>實發</span><span>{{ money(detail.net_salary) }}</span>
    </div>
  </div>
</template>

<style scoped>
.sh-detail { padding: 12px 16px; background: var(--el-fill-color-lighter); border-radius: 4px; display: grid; gap: 16px; }
.sh-region h4 { margin: 0 0 8px; font-size: 14px; color: var(--el-text-color-primary); }
.sh-line { display: flex; justify-content: space-between; padding: 2px 0; }
.sh-child { padding-left: 16px; font-size: 12px; color: var(--el-text-color-secondary); }
.sh-subtotal { font-weight: 600; border-top: 1px solid var(--el-border-color); margin-top: 4px; padding-top: 4px; }
.sh-neg { color: var(--el-color-danger); }
.sh-net { font-weight: 700; font-size: 16px; border-top: 2px solid var(--el-color-primary); padding-top: 6px; }
</style>
