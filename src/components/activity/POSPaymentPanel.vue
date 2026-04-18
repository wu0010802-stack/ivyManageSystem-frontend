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

    <!-- 已選取報名摘要 -->
    <div v-if="!selectedItem" class="pos-payment__empty">
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
            {{ selectedItem.student_name }}
            <span class="pos-payment__selected-class">{{ selectedItem.class_name || '—' }}</span>
          </div>
          <div class="pos-payment__selected-meta">
            應繳 {{ formatTWD(selectedItem.total_amount) }} · 已繳 {{ formatTWD(selectedItem.paid_amount) }}
          </div>
        </div>
        <el-button size="small" link :icon="Close" @click="$emit('clear-selection')">
          取消選取
        </el-button>
      </div>

      <div
        v-if="(selectedItem.courses && selectedItem.courses.length) || (selectedItem.supplies && selectedItem.supplies.length)"
        class="pos-payment__selected-lines"
      >
        <div
          v-for="(c, i) in selectedItem.courses"
          :key="`c-${i}`"
          class="pos-payment__selected-line"
        >
          <span class="pos-payment__selected-dot" />
          <span class="pos-payment__selected-line-name">{{ c.name }}</span>
          <span v-if="c.price" class="pos-payment__selected-line-price">{{ formatTWD(c.price) }}</span>
        </div>
        <div
          v-for="(s, i) in selectedItem.supplies"
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
        <el-input-number
          :model-value="selectedItem.amount_applied"
          :min="1"
          :max="isRefundMode ? (selectedItem.paid_amount || 1) : 999999"
          :step="1"
          :precision="0"
          :controls="false"
          size="small"
          class="pos-payment__applied-input"
          :class="{ 'pos-payment__applied-input--refund': isRefundMode }"
          @update:model-value="(v) => $emit('update:appliedAmount', v)"
        />
      </div>
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
        :placeholder="isRefundMode ? '例如：家長要求退費、事由' : ''"
        @update:model-value="$emit('update:notes', $event)"
      />
    </div>

    <div class="pos-payment__actions">
      <el-button size="large" :disabled="!selectedItem" @click="$emit('clear')">
        清空
      </el-button>
      <el-button
        size="large"
        :loading="submitting"
        :disabled="!canSubmit"
        class="pos-payment__submit pos-payment__submit--plain"
        @click="$emit('submit', { print: false })"
      >
        {{ isRefundMode ? '只確認退費' : '只確認收款' }}
      </el-button>
      <el-button
        :type="isRefundMode ? 'danger' : 'primary'"
        size="large"
        :loading="submitting"
        :disabled="!canSubmit"
        class="pos-payment__submit"
        @click="$emit('submit', { print: true })"
      >
        {{ isRefundMode ? '確認退費並列印' : '確認收款並列印' }}
      </el-button>
    </div>
  </el-card>
</template>

<script setup>
import { Close } from '@element-plus/icons-vue'

import { formatTWD } from '@/constants/pos'

defineProps({
  paymentMethod: { type: String, required: true },
  paymentMethodOptions: { type: Array, required: true },
  itemTotal: { type: Number, required: true },
  selectedItem: { type: Object, default: null },
  notes: { type: String, default: '' },
  canSubmit: { type: Boolean, required: true },
  submitting: { type: Boolean, required: true },
  checkoutType: { type: String, default: 'payment' },
  isRefundMode: { type: Boolean, default: false },
})

defineEmits([
  'update:paymentMethod',
  'update:notes',
  'update:checkoutType',
  'update:appliedAmount',
  'clear-selection',
  'clear',
  'submit',
])
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

.pos-payment__empty {
  padding: 24px 0;
  border: 1px dashed #e2e8f0;
  border-radius: 10px;
  background: #f8fafc;
}

.pos-payment__selected {
  padding: 12px;
  border: 1px solid #e2e8f0;
  border-radius: 10px;
  background: #f8fafc;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.pos-payment__selected--refund {
  background: #fef2f2;
  border-color: #fecaca;
}

.pos-payment__selected-head {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 8px;
}

.pos-payment__selected-name {
  font-weight: 600;
  color: #1e293b;
}

.pos-payment__selected-class {
  font-weight: 400;
  color: #64748b;
  font-size: 13px;
  margin-left: 8px;
}

.pos-payment__selected-meta {
  font-size: 12px;
  color: #64748b;
  margin-top: 2px;
}

.pos-payment__selected-lines {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 8px 10px;
  background: #ffffff;
  border-radius: 6px;
}

.pos-payment__selected-line {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  color: #334155;
}

.pos-payment__selected-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #6366f1;
}

.pos-payment__selected-dot--supply {
  background: #f59e0b;
}

.pos-payment__selected-line-name {
  flex: 1;
}

.pos-payment__selected-line-price {
  color: #64748b;
  font-size: 12px;
}

.pos-payment__selected-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding-top: 8px;
  border-top: 1px dashed #e2e8f0;
}

.pos-payment__applied-input {
  width: 130px;
}

.pos-payment__applied-input--refund :deep(input) {
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

.pos-payment__submit--plain {
  flex: 0.8;
}
</style>
