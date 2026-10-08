<template>
  <div class="alloc-confirm-card" data-test="alloc-confirm-card">
    <p class="alloc-confirm-card__who">{{ studentName }} · {{ itemLabel }}</p>
    <p class="alloc-confirm-card__amount">{{ formatCurrency(amount) }}</p>
    <p class="alloc-confirm-card__note">帳單面額全額吻合</p>
    <ul class="alloc-confirm-card__reasons">
      <li v-for="(r, i) in reasons" :key="i">{{ r }}</li>
    </ul>
    <p class="alloc-confirm-card__meta">
      {{ paidDate }} 繳 · {{ channel }}
      <template v-if="feeAmount > 0">
        · 手續費 {{ formatCurrency(feeAmount) }}（實入 {{ formatCurrency(netAmount) }}）
      </template>
    </p>
  </div>
</template>

<script setup lang="ts">
/**
 * SPEC-022 §4.2 高信心確認卡：帳號錨定唯一學生、期別內未繳恰可完全組成時，
 * 會計只需要知道「誰、哪張單、多少錢、為何確定」四件事，不需要看四次同一個金額。
 * 理由文字直接用後端 reasons，不在前端另寫一套（權威在 matching.py）。
 */
import { formatCurrency } from '@/utils/currency'

defineProps<{
  studentName: string
  itemLabel: string
  amount: number
  reasons: string[]
  paidDate: string
  channel: string
  feeAmount: number
  netAmount: number
}>()
</script>

<style scoped>
.alloc-confirm-card {
  padding: 20px 4px;
}
.alloc-confirm-card__who {
  font-size: 16px;
  font-weight: 600;
  margin: 0 0 12px;
}
.alloc-confirm-card__amount {
  font-size: 28px;
  font-weight: 700;
  margin: 0;
  font-variant-numeric: tabular-nums;
}
.alloc-confirm-card__note {
  color: var(--el-text-color-secondary);
  margin: 4px 0 16px;
}
.alloc-confirm-card__reasons {
  margin: 0 0 16px;
  padding-left: 18px;
  color: var(--el-text-color-regular);
}
.alloc-confirm-card__meta {
  color: var(--el-text-color-secondary);
  font-size: 13px;
  margin: 0;
}
</style>
