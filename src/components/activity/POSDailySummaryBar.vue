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
        本日已日結簽核，無法再收款或退款。若需補登交易，請先於「POS 日結簽核」解鎖該日。
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
        抽屜現金已累積 {{ formatTWD(data.cash_in_drawer) }}
        （≥ 警報門檻 {{ formatTWD(data.cash_warning_threshold) }}）；建議盡早將現金存入銀行避免遺失風險
      </template>
    </el-alert>

    <el-alert
      v-if="noncashTotal > 0"
      type="info"
      :closable="false"
      show-icon
      class="pos-daily-bar__noncash-alert"
    >
      <template #title>
        本日另有帳務調整（非現金）收 {{ formatTWD(data?.noncash_payment_total ?? 0) }} ·
        退 {{ formatTWD(data?.noncash_refund_total ?? 0) }}，
        來自退課沖帳／批次標記已繳費等系統作業，<strong>不影響抽屜現金</strong>，
        也不會出現在下方「今日交易」清單。
      </template>
    </el-alert>

    <StatStrip :items="stripItems" />
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'

import StatStrip, { type StatStripItem } from '@/components/common/StatStrip.vue'
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

// MONEY-03（2026-08-24）：主數字要對得上抽屜。
// payment_total / refund_total / net 是**所有付款方式**的總額，含
// payment_method='系統補齊' 的帳務調整（退課 force_refund、離園沖帳等）——那些沒有
// 任何現金經手，而且因為沒有收據編號，「今日交易」清單預設也查不到。櫃台照舊主數字
// 點鈔會誤判短溢，還找不到那筆是誰。
//
// 新欄位缺席時（前後端部署有時間差）退回舊行為並拿掉「現金」字樣：顯示 0 會讓櫃台
// 以為今天沒收到錢，比顯示含沖帳的總額更糟。
const hasCashBreakdown = computed((): boolean => props.data?.cash_payment_total !== undefined)

const noncashTotal = computed((): number =>
  Math.abs(props.data?.noncash_payment_total ?? 0) +
  Math.abs(props.data?.noncash_refund_total ?? 0),
)

// 退款只在真的發生時上警示色；淨額是收銀員一眼要看的錨點。
// 無資料（「—」）時一律不上色，避免把缺值染成有語意的狀態。
const stripItems = computed((): StatStripItem[] => {
  const d = props.data
  const cashMode = hasCashBreakdown.value
  const refundValue = cashMode ? d?.cash_refund_total : d?.refund_total
  return [
    {
      label: cashMode ? '今日現金收款' : '今日收款',
      value: amountText(cashMode ? d?.cash_payment_total : d?.payment_total),
    },
    {
      label: cashMode ? '今日現金退款' : '今日退款',
      value: amountText(refundValue),
      tone: d && (refundValue ?? 0) > 0 ? 'warning' : undefined,
    },
    {
      label: cashMode ? '抽屜淨額' : '淨額',
      value: amountText(cashMode ? d?.cash_net : d?.net),
      emphasis: true,
    },
    { label: '筆數（收/退）', value: countText.value },
  ]
})
</script>

<style scoped>
.pos-daily-bar-wrap {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.pos-daily-bar__noncash-alert :deep(.el-alert__content),
.pos-daily-bar__cash-alert :deep(.el-alert__content),
.pos-daily-bar__approved-alert :deep(.el-alert__content),
.pos-daily-bar__error-alert :deep(.el-alert__content) {
  font-size: 14px;
  line-height: 1.5;
}

.pos-daily-bar__retry {
  margin-left: 8px;
}
</style>
