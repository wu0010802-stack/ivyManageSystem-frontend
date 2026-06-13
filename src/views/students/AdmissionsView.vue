<template>
  <div class="admissions-view">
    <div class="page-header">
      <div class="page-header-left">
        <div class="page-header-icon" aria-hidden="true">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M3 3v18h18"/><path d="m19 9-5 5-4-4-3 3"/>
          </svg>
        </div>
        <div>
          <h2 class="page-title">招生入學</h2>
          <p class="page-subtitle">參觀 → 預繳 → 報到 → 開學 · 統計分析</p>
        </div>
      </div>
    </div>

    <el-tabs v-model="activeTab" class="admissions-tabs">
      <el-tab-pane label="漏斗看板" name="funnel">
        <FunnelBoard />
      </el-tab-pane>
    </el-tabs>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { useRoute } from 'vue-router'
import FunnelBoard from '@/components/recruitment/funnel/FunnelBoard.vue'

const VALID_TABS = ['funnel', 'records', 'intake', 'ivykids', 'stats'] as const
type AdmissionsTab = (typeof VALID_TABS)[number]

const route = useRoute()
const initialTab = ((): AdmissionsTab => {
  const t = typeof route.query.tab === 'string' ? route.query.tab : ''
  return (VALID_TABS as readonly string[]).includes(t) ? (t as AdmissionsTab) : 'funnel'
})()
const activeTab = ref<AdmissionsTab>(initialTab)
</script>

<style scoped>
/* ── Design Tokens（對齊 RecruitmentView）── */
.admissions-view {
  --rv-primary:    #1e40af;
  --rv-primary-lt: #dbeafe;
  --rv-text:       #1e293b;
  --rv-text-2:     #64748b;
}

.admissions-view {
  padding: 8px 0;
}
.page-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: var(--space-4, 16px);
}
.page-header-left {
  display: flex;
  align-items: center;
  gap: 12px;
}
.page-header-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  border-radius: 10px;
  background: var(--rv-primary-lt);
  color: var(--rv-primary);
  flex-shrink: 0;
}
.page-title {
  margin: 0;
  font-size: 18px;
}
.page-subtitle {
  margin: 0;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}
</style>
