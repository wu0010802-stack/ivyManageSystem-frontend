<template>
  <div class="pos-daily-bar-wrap">
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
        :value="formatTWD(data?.payment_total ?? 0)"
        :icon="Money"
        color="success"
        variant="filled"
      />
      <StatCard
        label="今日退款"
        :value="formatTWD(data?.refund_total ?? 0)"
        :icon="RefreshLeft"
        color="warning"
        variant="filled"
      />
      <StatCard
        label="淨額"
        :value="formatTWD(data?.net ?? 0)"
        :icon="Wallet"
        color="primary"
        variant="filled"
      />
      <StatCard
        label="筆數（收/退）"
        :value="`${data?.payment_count ?? 0} / ${data?.refund_count ?? 0}`"
        :icon="Tickets"
        color="info"
        variant="filled"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { Money, RefreshLeft, Tickets, Wallet } from '@element-plus/icons-vue'

import StatCard from '@/components/common/StatCard.vue'
import { formatTWD } from '@/constants/pos'

withDefaults(defineProps<{
  // data 含 cash_warning / cash_in_drawer / cash_warning_threshold（spec H7）
  data?: Record<string, unknown> | null
}>(), {
  data: null,
})
</script>

<style scoped>
.pos-daily-bar-wrap {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.pos-daily-bar__cash-alert :deep(.el-alert__content) {
  font-size: 14px;
  line-height: 1.5;
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
