<script setup lang="ts">
import { computed } from 'vue'
import { money } from '@/utils/format'
import SalaryHistoryDetail from './SalaryHistoryDetail.vue'
import type { OverviewEmployeeRow } from './salaryMonthlyOverview'

// 展開明細：進帳收入／薪資獨立轉帳／扣款三區沿用歷史薪條元件（同一後端口徑），
// 本元件只補表外獎金、雇主負擔與完整人事成本，各區小計皆為後端數字，不在前端重算。
const props = defineProps<{ row: OverviewEmployeeRow }>()

// generated SalaryHistoryBreakdownOut 與 SalaryHistoryDetail 的 PayslipDetail
// 結構相容，直接傳入讓 vue-tsc 把關，不用 cast
const payslip = computed(() => props.row.payslip_detail ?? null)
const bonusItems = computed(() => props.row.extra_bonus_items ?? [])
</script>

<template>
  <div class="moe-detail">
    <SalaryHistoryDetail v-if="payslip" :detail="payslip" />
    <div v-else class="moe-no-record">本月無薪資紀錄（僅表外獎金）</div>

    <section v-if="bonusItems.length" class="moe-region" data-testid="detail-extra-bonus">
      <h4>表外獎金（獨立轉帳，不入薪資紀錄）</h4>
      <div v-for="item in bonusItems" :key="item.key" class="moe-line">
        <span>{{ item.label }}</span><span class="moe-num">{{ money(item.amount) }}</span>
      </div>
      <div class="moe-line moe-subtotal">
        <span>表外獎金小計</span><span class="moe-num">{{ money(row.extra_bonus_amount) }}</span>
      </div>
    </section>

    <section class="moe-region" data-testid="detail-cash-payout">
      <h4>現金給付</h4>
      <div class="moe-line">
        <span>主薪轉</span><span class="moe-num">{{ money(row.base_transfer_amount) }}</span>
      </div>
      <div class="moe-line">
        <span>薪資紀錄獨立轉帳</span><span class="moe-num">{{ money(row.salary_separate_transfer) }}</span>
      </div>
      <div class="moe-line">
        <span>表外獎金</span><span class="moe-num">{{ money(row.extra_bonus_amount) }}</span>
      </div>
      <div class="moe-line moe-subtotal">
        <span>現金給付合計</span><span class="moe-num">{{ money(row.salary_cash_payout) }}</span>
      </div>
    </section>

    <section class="moe-region" data-testid="detail-employer">
      <h4>雇主負擔（不經員工帳戶）</h4>
      <div class="moe-line">
        <span>雇主勞保</span><span class="moe-num">{{ money(row.labor_insurance_employer) }}</span>
      </div>
      <div class="moe-line">
        <span>雇主健保</span><span class="moe-num">{{ money(row.health_insurance_employer) }}</span>
      </div>
      <div class="moe-line">
        <span>雇主勞退</span><span class="moe-num">{{ money(row.pension_employer) }}</span>
      </div>
      <div class="moe-line moe-subtotal">
        <span>雇主負擔合計</span><span class="moe-num">{{ money(row.employer_burden) }}</span>
      </div>
      <div class="moe-line moe-cost">
        <span>完整人事成本（應發＋未休假折現＋獨立轉帳＋表外獎金＋雇主負擔）</span>
        <span class="moe-num">{{ money(row.employer_cost) }}</span>
      </div>
    </section>
  </div>
</template>

<style scoped>
.moe-detail { display: grid; gap: 12px; padding: 8px 16px 16px; }
.moe-no-record { color: var(--el-text-color-secondary); font-size: 13px; padding: 4px 0; }
.moe-region h4 { margin: 0 0 8px; font-size: 14px; color: var(--el-text-color-primary); }
.moe-line { display: flex; justify-content: space-between; padding: 2px 0; }
.moe-num { font-variant-numeric: tabular-nums; }
.moe-subtotal { font-weight: 600; border-top: 1px solid var(--el-border-color); margin-top: 4px; padding-top: 4px; }
.moe-cost { font-weight: 700; border-top: 2px solid var(--el-color-primary); margin-top: 6px; padding-top: 6px; }
</style>
