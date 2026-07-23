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
      <h4>應發收入（計入 gross/net）</h4>
      <div v-for="line in income" :key="line.key" class="sh-line">
        <span>{{ line.label }}<small v-if="line.note">（{{ line.note }}）</small></span>
        <span>{{ money(line.amount) }}</span>
      </div>
      <div class="sh-line sh-subtotal">
        <span>應發合計</span><span>{{ money(detail.income_subtotal) }}</span>
      </div>
    </section>

    <section v-if="showSeparate" class="sh-region">
      <h4>獨立轉帳（不含主薪轉）</h4>
      <div v-for="line in separate" :key="line.key" class="sh-line">
        <span>{{ line.label }}</span><span>{{ money(line.amount) }}</span>
      </div>
      <div class="sh-line sh-subtotal">
        <span>獨立轉帳小計</span><span>{{ money(detail.separate_subtotal) }}</span>
      </div>
    </section>

    <section class="sh-region">
      <h4>扣款</h4>
      <template v-for="line in deductions" :key="line.key">
        <div class="sh-line">
          <span>{{ line.label }}</span><span class="sh-neg">-{{ money(line.amount) }}</span>
        </div>
        <!-- informational 子列（如補充保費已含於健保）：不顯示負號，避免誤讀為額外扣款 -->
        <div v-for="child in (line.children || [])" :key="child.key" class="sh-line sh-child">
          <span>{{ child.label }}</span><span>{{ money(child.amount) }}</span>
        </div>
      </template>
      <div class="sh-line sh-subtotal">
        <span>扣款合計</span><span class="sh-neg">-{{ money(detail.deduction_subtotal) }}</span>
      </div>
    </section>

    <section v-if="detail.unused_leave_payout" class="sh-region">
      <h4>主薪轉加給</h4>
      <div class="sh-line">
        <span>未休假折現（併入主薪轉）</span>
        <span>{{ money(detail.unused_leave_payout) }}</span>
      </div>
    </section>

    <div class="sh-line sh-net">
      <span>實發（主薪轉）</span><span>{{ money(detail.base_transfer_amount) }}</span>
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
