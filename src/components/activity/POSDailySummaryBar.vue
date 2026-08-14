<template>
  <div class="pos-daily-bar-wrap">
    <!-- 已日結：後端 daily-summary 早就回 is_approved，但前端一直不消費——櫃台會照舊
         按收款，直到後端回 400 才知道今天已經鎖了（P3-04）。 -->
    <el-alert
      v-if="data?.is_approved"
      type="info"
      :closable="false"
      show-icon
      class="pos-daily-bar__approved-alert"
    >
      <template #title>
        🔒 本日已日結簽核，無法再收款或退款。若需補登交易，請先於「POS 日結簽核」解鎖該日。
      </template>
    </el-alert>

    <!-- 刷新失敗：金額一律改顯示「—」，不可留舊值也不可顯示 NT$0（P3-05）。
         結帳成功後刷新失敗時留著舊值，等於顯示「不含剛收那筆」的金額，
         櫃台照著點鈔會少算。 -->
    <el-alert
      v-if="error"
      type="error"
      :closable="false"
      show-icon
      class="pos-daily-bar__error-alert"
    >
      <template #title>
        <span>日結彙總載入失敗，下方金額暫不可用，請重試後再對帳。</span>
        <el-button
          size="small"
          link
          class="pos-daily-bar__retry"
          @click="emit('retry')"
        >
          重試
        </el-button>
      </template>
    </el-alert>

    <el-alert
      v-if="data?.cash_warning"
      type="warning"
      :closable="false"
      show-icon
      class="pos-daily-bar__cash-alert"
    >
      <template #title>
        💰 抽屜現金已累積 {{ formatTWD(data.cash_in_drawer) }}
        （≥ 警報門檻 {{ formatTWD(data.cash_warning_threshold) }}）；建議盡早將現金存入銀行避免遺失風險
      </template>
    </el-alert>

    <div class="pos-daily-bar">
      <StatCard
        label="今日收款"
        :value="amountText(data?.payment_total)"
        :icon="Money"
        color="success"
        variant="filled"
      />
      <StatCard
        label="今日退款"
        :value="amountText(data?.refund_total)"
        :icon="RefreshLeft"
        color="warning"
        variant="filled"
      />
      <StatCard
        label="淨額"
        :value="amountText(data?.net)"
        :icon="Wallet"
        color="primary"
        variant="filled"
      />
      <StatCard
        label="筆數（收/退）"
        :value="countText"
        :icon="Tickets"
        color="info"
        variant="filled"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { Money, RefreshLeft, Tickets, Wallet } from '@element-plus/icons-vue'

import StatCard from '@/components/common/StatCard.vue'
import { formatTWD } from '@/constants/pos'
import type { ApiResponse } from '@/api/_generated/typed'

type DailySummary = ApiResponse<'/activity/pos/daily-summary', 'get'>

const props = withDefaults(defineProps<{
  // 具名型別而非 Record<string, unknown>：欄位（cash_warning / is_approved 等）
  // 一旦漏消費，TS 幫不上忙——is_approved 就是這樣被忽略了整整兩個月（P3-04）。
  data?: DailySummary | null
  /** 刷新失敗：金額改顯示「—」並提供重試（P3-05） */
  error?: boolean
}>(), {
  data: null,
  error: false,
})

const emit = defineEmits<{ retry: [] }>()

/** 無資料一律「—」：不可用 `?? 0` 把「沒資料」偽裝成「今天真的是零」。 */
function amountText(value: number | null | undefined): string {
  if (!props.data || value == null) return '—'
  return formatTWD(value)
}

const countText = computed((): string => {
  if (!props.data) return '—'
  return `${props.data.payment_count ?? 0} / ${props.data.refund_count ?? 0}`
})
</script>

<style scoped>
.pos-daily-bar-wrap {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.pos-daily-bar__cash-alert :deep(.el-alert__content),
.pos-daily-bar__approved-alert :deep(.el-alert__content),
.pos-daily-bar__error-alert :deep(.el-alert__content) {
  font-size: 14px;
  line-height: 1.5;
}

.pos-daily-bar__retry {
  margin-left: 8px;
}

.pos-daily-bar {
  display: grid;
  grid-template-columns: repeat(4, minmax(160px, 1fr));
  gap: 12px;
  align-items: stretch;
}

@media (max-width: 900px) {
  .pos-daily-bar {
    grid-template-columns: repeat(2, 1fr);
  }
}
</style>
