<script setup>
import { onMounted } from 'vue'
import { usePortalAppraisal } from '@/composables/usePortalAppraisal'
import LatestSummaryCard from '@/components/portal/growth/LatestSummaryCard.vue'
import TrendChart from '@/components/portal/growth/TrendChart.vue'
import CycleTimelineItem from '@/components/portal/growth/CycleTimelineItem.vue'

const {
  items,
  trend,
  loading,
  error,
  emptyState,
  latest,
  fetchAll,
  fetchDetail,
} = usePortalAppraisal()

onMounted(fetchAll)
</script>

<template>
  <div class="portal-growth">
    <header class="page-header">
      <h2>我的成長軌跡</h2>
      <el-button :loading="loading" plain size="small" @click="fetchAll">
        重新整理
      </el-button>
    </header>

    <div v-if="error" class="error-banner">
      載入失敗：{{ error.message || '請稍後再試' }}
    </div>

    <div v-if="loading && !items.length" class="loading-state">
      <div v-for="i in 3" :key="i" class="pt-shimmer skeleton-block"></div>
    </div>

    <template v-else>
      <div v-if="emptyState === 'no-data'" class="empty">
        您尚未列入任何考核週期。
      </div>

      <template v-else>
        <LatestSummaryCard
          v-if="latest"
          :item="latest.item"
          :delta="latest.delta"
        />

        <section
          v-if="emptyState === 'has-finalized' && trend.length"
          class="section"
        >
          <h3>歷年趨勢</h3>
          <TrendChart :points="trend" />
        </section>

        <section class="section">
          <h3>歷年紀錄</h3>
          <p v-if="emptyState === 'all-pending'" class="hint">
            目前考核進行中，預計簽核完成後公布分數。
          </p>
          <CycleTimelineItem
            v-for="item in items"
            :key="item.cycle_id"
            :item="item"
            :fetch-detail="fetchDetail"
          />
        </section>
      </template>
    </template>
  </div>
</template>

<style scoped>
.portal-growth {
  max-width: 800px;
  margin: 0 auto;
  display: flex;
  flex-direction: column;
  gap: var(--space-4, 16px);
}
.page-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.page-header h2 {
  margin: 0;
  font-size: var(--text-xl, 20px);
  font-weight: 700;
  color: var(--pt-text-strong, #111);
}
.error-banner {
  padding: var(--space-3, 12px);
  background: var(--color-danger-lighter, #fee2e2);
  color: var(--color-danger, #b91c1c);
  border-radius: var(--radius-md, 8px);
}
.loading-state {
  display: flex;
  flex-direction: column;
  gap: var(--space-3, 12px);
}
.skeleton-block {
  height: 120px;
  border-radius: var(--radius-md, 8px);
  background: var(--neutral-100, #f1f5f9);
}
.empty {
  text-align: center;
  padding: var(--space-6, 24px);
  color: var(--pt-text-muted, #6b7280);
}
.section {
  display: flex;
  flex-direction: column;
  gap: var(--space-3, 12px);
}
.section h3 {
  margin: 0;
  font-size: var(--text-lg, 16px);
  font-weight: 600;
  color: var(--pt-text-strong, #111);
}
.hint {
  color: var(--pt-text-muted, #6b7280);
  font-size: var(--text-sm, 13px);
  margin: 0;
}
</style>
