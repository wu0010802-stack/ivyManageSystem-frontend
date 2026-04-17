<template>
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
    <div v-if="methodBreakdown.length" class="pos-daily-bar__methods">
      <span
        v-for="m in methodBreakdown"
        :key="m.method"
        class="pos-daily-bar__method-tag"
      >
        {{ m.method }} · {{ formatTWD(m.payment) }}
      </span>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { Money, RefreshLeft, Tickets, Wallet } from '@element-plus/icons-vue'

import StatCard from '@/components/common/StatCard.vue'
import { formatTWD } from '@/constants/pos'

const props = defineProps({
  data: { type: Object, default: null },
})

const methodBreakdown = computed(() => props.data?.by_method || [])
</script>

<style scoped>
.pos-daily-bar {
  display: grid;
  grid-template-columns: repeat(4, minmax(160px, 1fr));
  gap: 12px;
  align-items: stretch;
}

.pos-daily-bar__methods {
  grid-column: 1 / -1;
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  font-size: 12px;
  color: #64748b;
}

.pos-daily-bar__method-tag {
  background: #f1f5f9;
  padding: 4px 10px;
  border-radius: 999px;
}

@media (max-width: 900px) {
  .pos-daily-bar {
    grid-template-columns: repeat(2, 1fr);
  }
}
</style>
