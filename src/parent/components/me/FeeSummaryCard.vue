<script setup>
import { computed } from 'vue'

const props = defineProps({
  outstanding: { type: Number, default: 0 },
  overdue: { type: Number, default: 0 },
  detailHref: { type: String, default: '/fees' },
  historyHref: { type: String, default: '/fees' },
})

const hasOutstanding = computed(() => props.outstanding > 0)
const hasOverdue = computed(() => props.overdue > 0)

function fmt(n) {
  return Number(n || 0).toLocaleString('en-US')
}
</script>

<template>
  <section class="fee-summary-card" aria-labelledby="fee-summary-title">
    <header class="header">
      <h2 id="fee-summary-title" class="title">繳費中心</h2>
    </header>

    <div v-if="hasOutstanding" class="amounts">
      <div class="row">
        <span class="label">應繳餘額</span>
        <span class="amount">NT$ {{ fmt(outstanding) }}</span>
      </div>
      <div v-if="hasOverdue" class="row fee-overdue">
        <span class="label">逾期</span>
        <span class="amount overdue">NT$ {{ fmt(overdue) }} ⚠</span>
      </div>
    </div>

    <p v-else class="empty">目前無待繳費用 ✨</p>

    <div class="actions">
      <router-link :to="detailHref" class="btn primary">查看明細</router-link>
      <router-link :to="historyHref" class="btn ghost">繳費紀錄</router-link>
    </div>
  </section>
</template>

<style scoped>
.fee-summary-card {
  background: var(--m3-surface-container-low, var(--pt-surface-card, var(--neutral-0)));
  border-radius: 16px;
  padding: var(--space-4, 16px);
  box-shadow: var(--m3-elev-1, var(--pt-elev-1));
  display: flex;
  flex-direction: column;
  gap: var(--space-3, 12px);
}
.title { font-size: var(--text-base, 15px); font-weight: var(--font-weight-semibold, 600); margin: 0; }
.amounts { display: flex; flex-direction: column; gap: var(--space-2, 8px); }
.row { display: flex; justify-content: space-between; align-items: baseline; }
.label { color: var(--m3-on-surface-variant, var(--pt-text-muted)); font-size: var(--text-sm, 13px); }
.amount { font-size: var(--text-lg, 18px); font-weight: var(--font-weight-semibold, 600); font-variant-numeric: tabular-nums; }
.amount.overdue { color: var(--color-danger); }
.empty { color: var(--m3-on-surface-variant, var(--pt-text-muted)); margin: 0; }
.actions { display: flex; gap: var(--space-2, 8px); }
.btn {
  flex: 1; min-height: var(--touch-target-min, 44px);
  display: inline-flex; align-items: center; justify-content: center;
  border-radius: var(--radius-md, 10px);
  font-size: var(--text-sm, 13px); font-weight: var(--font-weight-semibold, 600);
  text-decoration: none;
}
.btn.primary { background: var(--m3-primary, var(--brand-primary)); color: var(--neutral-0); }
.btn.ghost { background: var(--brand-primary-soft); color: var(--m3-primary, var(--brand-primary)); }
</style>
