<template>
  <el-card class="pos-panel" shadow="never" :class="{ 'pos-panel--refund': isRefundMode }">
    <div class="pos-payment__header">
      <h3 class="pos-payment__title">
        {{ isRefundMode ? '退費' : '收款' }}
      </h3>
      <el-radio-group
        :model-value="checkoutType"
        size="small"
        @update:model-value="$emit('update:checkoutType', $event)"
      >
        <el-radio-button value="payment">繳費</el-radio-button>
        <el-radio-button value="refund">退費</el-radio-button>
      </el-radio-group>
    </div>

    <div class="pos-payment__field">
      <label class="pos-payment__label">
        {{ isRefundMode ? '退款方式' : '付款方式' }}
      </label>
      <el-radio-group
        :model-value="paymentMethod"
        size="large"
        @update:model-value="$emit('update:paymentMethod', $event)"
      >
        <el-radio-button
          v-for="m in paymentMethodOptions"
          :key="m.value"
          :value="m.value"
        >
          {{ m.label }}
        </el-radio-button>
      </el-radio-group>
    </div>

    <div class="pos-payment__summary">
      <div class="pos-payment__row">
        <span>{{ isRefundMode ? '退款合計' : '應收' }}</span>
        <strong
          class="pos-payment__amount"
          :class="{ 'pos-payment__amount--refund': isRefundMode }"
        >
          {{ formatTWD(cartTotal) }}
        </strong>
      </div>
    </div>

    <!-- 收款模式 + 現金才顯示實收 / 找零 -->
    <template v-if="!isRefundMode && isCash">
      <div class="pos-payment__field">
        <label class="pos-payment__label">實收金額</label>
        <el-input-number
          :model-value="tenderedInput"
          :min="0"
          :max="9999999"
          :step="100"
          :controls="false"
          size="large"
          class="pos-payment__tendered"
          placeholder="請輸入客戶實付金額"
          @update:model-value="$emit('update:tenderedInput', $event)"
        />
        <div class="pos-payment__quick-keys">
          <el-button
            v-for="k in quickKeys"
            :key="k"
            size="small"
            plain
            @click="applyQuick(k)"
          >
            {{ k === 'exact' ? '剛好' : `+${k}` }}
          </el-button>
        </div>
      </div>

      <div class="pos-payment__summary pos-payment__summary--change">
        <div class="pos-payment__row">
          <span>找零</span>
          <strong
            class="pos-payment__amount"
            :class="{ 'pos-payment__amount--positive': change > 0 }"
          >
            {{ change == null ? '—' : formatTWD(change) }}
          </strong>
        </div>
      </div>
    </template>

    <div class="pos-payment__field">
      <label class="pos-payment__label">備註（選填）</label>
      <el-input
        :model-value="notes"
        type="textarea"
        :rows="2"
        maxlength="200"
        show-word-limit
        :placeholder="isRefundMode ? '例如：家長要求退費、事由' : ''"
        @update:model-value="$emit('update:notes', $event)"
      />
    </div>

    <div class="pos-payment__actions">
      <el-button size="large" :disabled="cartTotal === 0" @click="$emit('clear')">
        清空
      </el-button>
      <el-button
        :type="isRefundMode ? 'danger' : 'primary'"
        size="large"
        :loading="submitting"
        :disabled="!canSubmit"
        class="pos-payment__submit"
        @click="$emit('submit')"
      >
        {{ isRefundMode ? '送出退費' : '送出並列印' }}
      </el-button>
    </div>
  </el-card>
</template>

<script setup>
import { formatTWD } from '@/constants/pos'

const props = defineProps({
  paymentMethod: { type: String, required: true },
  paymentMethodOptions: { type: Array, required: true },
  isCash: { type: Boolean, required: true },
  tenderedInput: { type: Number, default: null },
  change: { type: Number, default: null },
  cartTotal: { type: Number, required: true },
  notes: { type: String, default: '' },
  canSubmit: { type: Boolean, required: true },
  submitting: { type: Boolean, required: true },
  checkoutType: { type: String, default: 'payment' },
  isRefundMode: { type: Boolean, default: false },
})

const emit = defineEmits([
  'update:paymentMethod',
  'update:tenderedInput',
  'update:notes',
  'update:checkoutType',
  'clear',
  'submit',
])

const quickKeys = ['exact', 100, 500, 1000]

function applyQuick(k) {
  if (k === 'exact') {
    emit('update:tenderedInput', props.cartTotal)
    return
  }
  const base = props.tenderedInput == null ? props.cartTotal : Number(props.tenderedInput)
  emit('update:tenderedInput', base + Number(k))
}
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

.pos-panel--refund :deep(.el-card__body) {
  background: linear-gradient(180deg, #fff1f1 0%, #ffffff 15%);
}

.pos-payment__amount--refund {
  color: #dc2626;
}

.pos-payment__field {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.pos-payment__label {
  font-size: 13px;
  color: #475569;
  font-weight: 500;
}

.pos-payment__summary {
  padding: 12px 14px;
  background: #f8fafc;
  border-radius: 10px;
  border: 1px solid #e2e8f0;
}

.pos-payment__summary--change {
  background: #eef0fd;
  border-color: #c7d2fe;
}

.pos-payment__row {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  font-size: 14px;
  color: #475569;
}

.pos-payment__amount {
  font-size: 22px;
  font-weight: 700;
  color: #1e293b;
}

.pos-payment__amount--positive {
  color: #059669;
}

.pos-payment__tendered {
  width: 100%;
}
.pos-payment__tendered :deep(input) {
  text-align: right;
  font-size: 22px;
  font-weight: 700;
}

.pos-payment__quick-keys {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}

.pos-payment__actions {
  margin-top: auto;
  display: flex;
  gap: 10px;
}

.pos-payment__submit {
  flex: 1;
}
</style>
