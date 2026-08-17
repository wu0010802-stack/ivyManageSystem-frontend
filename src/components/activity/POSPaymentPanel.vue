<template>
  <el-card class="pos-panel" shadow="never" :class="{ 'pos-panel--refund': isRefundMode }">
    <div class="pos-payment__header">
      <h3 class="pos-payment__title">
        {{ isRefundMode ? '退費' : '收款' }}
      </h3>
      <el-radio-group
        :model-value="checkoutType"
        size="small"
        @update:model-value="onCheckoutTypeChange"
      >
        <el-radio-button value="payment">繳費</el-radio-button>
        <el-radio-button value="refund">退費</el-radio-button>
      </el-radio-group>
    </div>

    <!-- 已選取報名摘要 -->
    <div v-if="!selectedItemTyped" class="pos-payment__empty">
      <el-empty description="請從左側選擇一筆報名" :image-size="80" />
    </div>

    <div
      v-else
      class="pos-payment__selected"
      :class="{ 'pos-payment__selected--refund': isRefundMode }"
    >
      <div class="pos-payment__selected-head">
        <div>
          <div class="pos-payment__selected-name">
            {{ selectedItemTyped.student_name }}
            <span class="pos-payment__selected-class">{{ selectedItemTyped.class_name || '—' }}</span>
          </div>
          <div class="pos-payment__selected-meta">
            應繳 {{ formatTWD(selectedItemTyped.total_amount) }} · 已繳 {{ formatTWD(selectedItemTyped.paid_amount) }}
          </div>
        </div>
        <el-button size="small" link :icon="Close" @click="$emit('clear-selection')">
          取消選取
        </el-button>
      </div>

      <div
        v-if="(selectedItemTyped.courses && selectedItemTyped.courses.length) || (selectedItemTyped.supplies && selectedItemTyped.supplies.length)"
        class="pos-payment__selected-lines"
      >
        <div
          v-for="(c, i) in selectedItemTyped.courses"
          :key="`c-${i}`"
          class="pos-payment__selected-line"
        >
          <span class="pos-payment__selected-dot" />
          <span class="pos-payment__selected-line-name">
            {{ c.name }}
            <small v-if="c.status" class="pos-payment__selected-line-status">
              {{ courseStatusLabel(c.status) }}
            </small>
          </span>
          <span
            v-if="c.status === 'enrolled' && c.price"
            class="pos-payment__selected-line-price"
          >
            {{ formatTWD(c.price) }}
          </span>
          <span
            v-else-if="c.status && c.status !== 'enrolled'"
            class="pos-payment__selected-line-price pos-payment__selected-line-price--muted"
          >
            未計費
          </span>
        </div>
        <div
          v-for="(s, i) in selectedItemTyped.supplies"
          :key="`s-${i}`"
          class="pos-payment__selected-line"
        >
          <span class="pos-payment__selected-dot pos-payment__selected-dot--supply" />
          <span class="pos-payment__selected-line-name">{{ s.name }}</span>
          <span v-if="s.price" class="pos-payment__selected-line-price">{{ formatTWD(s.price) }}</span>
        </div>
      </div>

      <div class="pos-payment__selected-footer">
        <span class="pos-payment__label">
          {{ isRefundMode ? '本次退費' : '本次收取' }}
        </span>
        <span v-if="refundSuggestionLoading" class="pos-payment__suggestion-loading">
          退費建議試算中…
        </span>
        <el-input-number
          :model-value="selectedItemTyped.amount_applied"
          :min="1"
          :max="isRefundMode ? (selectedItemTyped.paid_amount || 1) : PAYMENT_INPUT_MAX"
          :step="1"
          :precision="0"
          :controls="false"
          size="small"
          class="pos-payment__applied-input"
          :class="{
            'pos-payment__applied-input--refund': isRefundMode,
            'pos-payment__applied-input--overpay': overpayAmount > 0,
          }"
          @update:model-value="(v) => $emit('update:appliedAmount', v ?? null)"
        />
      </div>

      <!-- 溢繳軟提示：後端不擋超收是業主 2026-06-23 明確裁定（家長常一次多付、
           或用整鈔湊整），所以這裡**只提示不阻擋**。 -->
      <p v-if="overpayAmount > 0" class="pos-payment__overpay-hint">
        超過應繳 {{ formatTWD(overpayAmount) }}，將產生溢繳
      </p>
      <!-- 應收差額提示（繳費模式）：分期收款是合法情境，不阻擋送出，僅提醒收銀員
           口頭與家長確認金額（②收款改造，2026-08-16） -->
      <el-alert
        v-if="!isRefundMode && amountDiff !== 0"
        type="warning"
        :closable="false"
        show-icon
        class="pos-payment__diff-hint"
      >
        與應收差 {{ formatTWD(Math.abs(amountDiff)) }}（應收 {{ formatTWD(owedAmount) }}）——
        分期收款屬正常情況，請口頭與家長確認
      </el-alert>
    </div>

    <div class="pos-payment__summary">
      <div class="pos-payment__row">
        <span>{{ isRefundMode ? '退款合計' : '應收' }}</span>
        <strong
          class="pos-payment__amount"
          :class="{ 'pos-payment__amount--refund': isRefundMode }"
        >
          {{ formatTWD(itemTotal) }}
        </strong>
      </div>
    </div>

    <div class="pos-payment__field">
      <label class="pos-payment__label">備註（選填）</label>
      <el-input
        :model-value="notes"
        type="textarea"
        :rows="2"
        maxlength="200"
        show-word-limit
        :placeholder="isRefundMode ? '退費原因（至少 15 字，例如：家長申請退費，原因為…）' : ''"
        @update:model-value="$emit('update:notes', $event)"
      />
    </div>

    <el-alert
      v-if="refundApprovalBlocked"
      type="warning"
      :closable="false"
      show-icon
      class="pos-payment__approval-hint"
    >
      此筆退費金額超過簽核門檻，需具備「金流簽核」權限（ACTIVITY_PAYMENT_APPROVE）才能送出。請改由主管操作或於「待簽核」頁送審。
    </el-alert>

    <div class="pos-payment__actions">
      <el-button size="large" :disabled="!selectedItemTyped" @click="$emit('clear')">
        清空
      </el-button>
      <el-button
        :type="isRefundMode ? 'danger' : 'primary'"
        size="large"
        :loading="submitting || refundSuggestionLoading"
        :disabled="!canSubmit"
        class="pos-payment__submit"
        @click="$emit('submit')"
      >
        {{ isRefundMode ? '確認退費' : '確認收款' }}
      </el-button>
    </div>
  </el-card>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { Close } from '@element-plus/icons-vue'

import { COURSE_STATUS_LABEL } from '@/constants/activity'
import { computeOwed, formatTWD } from '@/constants/pos'

/**
 * 收款金額輸入框的上限：純粹是輸入框的防呆天花板（防手滑多打幾個 0），
 * 不是業務規則——超收由後端接受、由下方 `.pos-payment__overpay-hint` 軟提示。
 */
const PAYMENT_INPUT_MAX = 999999

interface SelectedCourse {
  name?: string
  price?: number | string
  status?: string
  [key: string]: unknown
}

function courseStatusLabel(status: string): string {
  return (COURSE_STATUS_LABEL as Record<string, string>)[status] || status
}

interface SelectedItem {
  id?: unknown
  student_name: string
  class_name?: string
  total_amount: number
  paid_amount: number
  owed?: number
  amount_applied: number
  courses?: SelectedCourse[]
  supplies?: SelectedCourse[]
  [key: string]: unknown
}

const props = withDefaults(defineProps<{
  itemTotal: number
  selectedItem?: Record<string, unknown> | null
  notes?: string
  canSubmit: boolean
  refundApprovalBlocked?: boolean
  submitting: boolean
  checkoutType?: string
  isRefundMode?: boolean
  /**
   * 退費建議試算進行中。canSubmit 在此期間為 false（避免盲送全額預填），
   * 但若不下傳這個旗標，櫃台只會看到送出鈕莫名變灰、沒有任何原因（P3-07）。
   */
  refundSuggestionLoading?: boolean
}>(), {
  selectedItem: null,
  notes: '',
  refundApprovalBlocked: false,
  checkoutType: 'payment',
  isRefundMode: false,
  refundSuggestionLoading: false,
})

// 將 Record<string, unknown> 轉型為可在模板直接存取的型別
const selectedItemTyped = computed((): SelectedItem | null =>
  props.selectedItem as SelectedItem | null
)

/**
 * 溢繳金額（本次收取 − 應繳餘額），僅收款模式有意義。
 * 為 0 代表沒有超收；> 0 時顯示軟提示（不阻擋送出，見模板註解）。
 */
const overpayAmount = computed((): number => {
  if (props.isRefundMode) return 0
  const item = selectedItemTyped.value
  if (!item) return 0
  const owed = Number(item.owed ?? computeOwed(item.total_amount, item.paid_amount))
  const applied = Number(item.amount_applied) || 0
  return applied > owed ? applied - owed : 0
})

const emit = defineEmits<{
  'update:notes': [value: string]
  'update:checkoutType': [value: string | number | boolean]
  'update:appliedAmount': [value: number | null]
  'clear-selection': []
  'clear': []
  'submit': []
}>()

function onCheckoutTypeChange(v: string | number | boolean | undefined) {
  if (v !== undefined) emit('update:checkoutType', v)
}

// 應收差額提示（②收款改造，2026-08-16）：金額輸入預設已由父層預填欠款
// （既有 buildSelection 邏輯不動），此處只在使用者手動改動、與應收不一致時提示。
const owedAmount = computed(() => {
  const it = selectedItemTyped.value
  if (!it) return 0
  return Math.max(0, (it.total_amount || 0) - (it.paid_amount || 0))
})
const amountDiff = computed(() => {
  const it = selectedItemTyped.value
  if (!it) return 0
  return (Number(it.amount_applied) || 0) - owedAmount.value
})
</script>

<style scoped>
.pos-panel {
  height: 100%;
}
.pos-panel :deep(.el-card__body) {
  display: flex;
  flex-direction: column;
  padding: 16px;
  gap: 14px;
  height: 100%;
}

.pos-payment__header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 10px;
}

.pos-payment__title {
  margin: 0;
  font-size: 18px;
}

/* 退費卡頂部染紅提醒。必須走 token：舊版寫死淺紅→純白的漸層，深色模式沒有任何
   覆寫，於是淺色底疊上深色模式的亮字，退費金額與按鈕幾乎讀不到（P2-11）。
   --color-danger-soft 在 html.dark 已翻成 alpha tint、--surface-color 亦有深色值。 */
.pos-panel--refund :deep(.el-card__body) {
  background: linear-gradient(180deg, var(--color-danger-soft) 0%, var(--surface-color) 15%);
}

/* 文字色一律走 *-darker（a11y.css 的 html.dark 已把該組翻成亮階）。*-hover 是互動態
   token、dark 刻意未覆寫（站上多處拿它當背景／邊框），當文字色用在深色底只有
   2.5–3.6:1（P3-10）。守衛見 __tests__/POSDarkContrast.test.ts。 */
.pos-payment__amount--refund {
  color: var(--color-danger-darker);
}

.pos-payment__empty {
  padding: 24px 0;
  border: 1px dashed var(--border-color);
  border-radius: 10px;
  background: var(--bg-color);
}

.pos-payment__selected {
  padding: 12px;
  border: 1px solid var(--border-color);
  border-radius: 10px;
  background: var(--bg-color);
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.pos-payment__selected--refund {
  background: var(--color-danger-soft);
  border-color: var(--color-danger-soft);
}

.pos-payment__selected-head {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 8px;
}

.pos-payment__selected-name {
  font-weight: 600;
  color: var(--text-primary);
}

.pos-payment__selected-class {
  font-weight: 400;
  color: var(--text-secondary);
  font-size: 13px;
  margin-left: 8px;
}

.pos-payment__selected-meta {
  font-size: 12px;
  color: var(--text-secondary);
  margin-top: 2px;
}

.pos-payment__selected-lines {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 8px 10px;
  background: var(--neutral-0);
  border-radius: 6px;
}

.pos-payment__selected-line {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  color: var(--neutral-700);
}

/* 課程項目圓點：原本寫死一個 indigo 色碼，深色模式下與深底幾乎融在一起（P2-11）。
   --brand-primary 在 html.dark 已釘亮一階。 */
.pos-payment__selected-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--brand-primary);
}

.pos-payment__selected-dot--supply {
  background: var(--color-warning);
}

.pos-payment__selected-line-name {
  flex: 1;
}

.pos-payment__selected-line-status {
  margin-left: 6px;
  color: var(--text-secondary);
  font-size: 11px;
}

.pos-payment__selected-line-price {
  color: var(--text-secondary);
  font-size: 12px;
}

.pos-payment__selected-line-price--muted {
  color: var(--text-tertiary);
}

.pos-payment__selected-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding-top: 8px;
  border-top: 1px dashed var(--border-color);
}

.pos-payment__applied-input {
  width: 130px;
}

.pos-payment__applied-input--refund :deep(input) {
  color: var(--color-danger-darker);
}

/* 溢繳：只描邊警示、不擋送出（業主裁定超收合法） */
.pos-payment__applied-input--overpay :deep(.el-input__wrapper) {
  box-shadow: 0 0 0 1px var(--color-warning) inset;
}

.pos-payment__overpay-hint {
  margin: 6px 0 0;
  font-size: 12px;
  color: var(--color-warning-darker);
}

.pos-payment__suggestion-loading {
  font-size: 12px;
  color: var(--text-secondary);
  margin-left: auto;
  margin-right: 8px;
}

.pos-payment__field {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.pos-payment__label {
  font-size: 13px;
  color: var(--neutral-600);
  font-weight: 500;
}

.pos-payment__summary {
  padding: 12px 14px;
  background: var(--bg-color);
  border-radius: 10px;
  border: 1px solid var(--border-color);
}

.pos-payment__row {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  font-size: 14px;
  color: var(--neutral-600);
}

.pos-payment__amount {
  font-size: 22px;
  font-weight: 700;
  color: var(--text-primary);
}

.pos-payment__approval-hint {
  margin-top: 12px;
}

.pos-payment__actions {
  margin-top: auto;
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.pos-payment__submit {
  flex: 1;
  min-width: 140px;
}

.pos-payment__diff-hint {
  margin-top: -4px;
}
</style>
