<template>
  <el-card class="pos-panel" shadow="never">
    <div class="pos-cart__head">
      <h3 class="pos-cart__title">購物車</h3>
      <div class="pos-cart__count">{{ cart.length }} 筆</div>
    </div>

    <div v-if="cart.length === 0" class="pos-cart__empty">
      <el-empty description="尚未選擇任何報名" :image-size="100" />
    </div>

    <el-scrollbar v-else class="pos-cart__body">
      <div v-for="row in cart" :key="row.id" class="pos-cart__row">
        <div class="pos-cart__row-head">
          <div>
            <div class="pos-cart__name">
              {{ row.student_name }}
              <span class="pos-cart__class">{{ row.class_name || '—' }}</span>
            </div>
            <div class="pos-cart__meta">
              應繳 {{ formatTWD(row.total_amount) }} · 已繳 {{ formatTWD(row.paid_amount) }}
            </div>
          </div>
          <el-button
            size="small"
            link
            type="danger"
            :icon="Delete"
            @click="$emit('remove', row.id)"
          >
            移除
          </el-button>
        </div>

        <div class="pos-cart__lines">
          <div
            v-for="(c, i) in row.courses"
            :key="`c-${i}`"
            class="pos-cart__line"
          >
            <span class="pos-cart__line-dot" />
            <span class="pos-cart__line-name">{{ c.name }}</span>
            <span v-if="c.price" class="pos-cart__line-price">{{ formatTWD(c.price) }}</span>
          </div>
          <div
            v-for="(s, i) in row.supplies"
            :key="`s-${i}`"
            class="pos-cart__line"
          >
            <span class="pos-cart__line-dot pos-cart__line-dot--supply" />
            <span class="pos-cart__line-name">{{ s.name }}</span>
            <span v-if="s.price" class="pos-cart__line-price">{{ formatTWD(s.price) }}</span>
          </div>
        </div>

        <div class="pos-cart__row-footer">
          <span class="pos-cart__footer-label">
            {{ isRefundMode ? '本次退費' : '本次收取' }}
          </span>
          <el-input-number
            :model-value="row.amount_applied"
            :min="1"
            :max="isRefundMode ? (row.paid_amount || 1) : 999999"
            :step="1"
            :precision="0"
            :controls="false"
            size="small"
            class="pos-cart__amount-input"
            :class="{ 'pos-cart__amount-input--refund': isRefundMode }"
            @update:model-value="(v) => $emit('edit-amount', { id: row.id, amount: v })"
          />
        </div>
      </div>
    </el-scrollbar>

    <div class="pos-cart__total" :class="{ 'pos-cart__total--refund': isRefundMode }">
      <span>{{ isRefundMode ? '退款合計' : '合計' }}</span>
      <span class="pos-cart__total-value">{{ formatTWD(cartTotal) }}</span>
    </div>
  </el-card>
</template>

<script setup>
import { Delete } from '@element-plus/icons-vue'

import { formatTWD } from '@/constants/pos'

defineProps({
  cart: { type: Array, required: true },
  cartTotal: { type: Number, required: true },
  isRefundMode: { type: Boolean, default: false },
})
defineEmits(['remove', 'edit-amount'])
</script>

<style scoped>
.pos-panel {
  height: 100%;
  display: flex;
  flex-direction: column;
}
.pos-panel :deep(.el-card__body) {
  display: flex;
  flex-direction: column;
  height: 100%;
  padding: 16px;
  gap: 12px;
}

.pos-cart__head {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
}

.pos-cart__title {
  margin: 0;
  font-size: 18px;
}

.pos-cart__count {
  color: #64748b;
  font-size: 13px;
}

.pos-cart__empty {
  display: flex;
  flex: 1;
  align-items: center;
  justify-content: center;
}

.pos-cart__body {
  flex: 1;
  min-height: 0;
}

.pos-cart__row {
  padding: 12px;
  border: 1px solid #e2e8f0;
  border-radius: 10px;
  margin-bottom: 10px;
  background: #ffffff;
}

.pos-cart__row-head {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 8px;
}

.pos-cart__name {
  font-weight: 600;
  color: #1e293b;
}

.pos-cart__class {
  font-weight: 400;
  color: #64748b;
  font-size: 13px;
  margin-left: 8px;
}

.pos-cart__meta {
  font-size: 12px;
  color: #64748b;
  margin-top: 2px;
}

.pos-cart__lines {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin-bottom: 10px;
  padding: 8px 10px;
  background: #f8fafc;
  border-radius: 6px;
}

.pos-cart__line {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  color: #334155;
}

.pos-cart__line-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #6366f1;
}

.pos-cart__line-dot--supply {
  background: #f59e0b;
}

.pos-cart__line-name {
  flex: 1;
}

.pos-cart__line-price {
  color: #64748b;
  font-size: 12px;
}

.pos-cart__row-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding-top: 8px;
  border-top: 1px dashed #e2e8f0;
}

.pos-cart__footer-label {
  font-size: 13px;
  color: #475569;
}

.pos-cart__amount-input {
  width: 130px;
}

.pos-cart__amount-input--refund :deep(input) {
  color: #dc2626;
}

.pos-cart__total {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  padding: 12px 16px;
  background: #eef0fd;
  border-radius: 10px;
  font-size: 15px;
  color: #475569;
}

.pos-cart__total--refund {
  background: #fef2f2;
}

.pos-cart__total--refund .pos-cart__total-value {
  color: #dc2626;
}

.pos-cart__total-value {
  font-size: 24px;
  font-weight: 700;
  color: #4338ca;
}
</style>
