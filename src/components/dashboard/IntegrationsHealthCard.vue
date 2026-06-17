<template>
  <el-card class="no-hover side-card mb-4 integrations-health-card" shadow="never">
    <template #header>
      <div class="card-title">
        <el-icon><Connection /></el-icon>
        <span>外部整合狀態</span>
        <el-button
          v-if="!pending"
          link
          type="primary"
          size="small"
          @click="refresh(true)"
          aria-label="重新整理整合狀態"
        >
          重新整理
        </el-button>
      </div>
    </template>

    <div v-if="pending && !data" class="loading-text" role="status" aria-live="polite">載入中…</div>
    <div v-else-if="error && !data" class="error-text" role="alert">
      載入失敗，請稍後重試
    </div>

    <template v-else-if="data">
      <!-- LINE -->
      <div class="integration-row">
        <span class="integration-name">LINE 推送</span>
        <el-tag :type="breakerTagType(data.line.breaker)" size="small" effect="dark">
          {{ breakerLabel(data.line.breaker) }}
        </el-tag>
      </div>
      <ul class="integration-detail">
        <li>
          <span>Token 健康</span>
          <el-tag :type="data.line.token_healthy ? 'success' : 'danger'" size="small">
            {{ tokenHealthLabel(data.line.token_healthy) }}
          </el-tag>
        </li>
        <li v-if="data.line.retry_pending > 0">
          <span>等待重發</span>
          <el-tag type="warning" size="small">{{ data.line.retry_pending }} 筆</el-tag>
        </li>
        <li v-if="data.line.retry_final_failed_24h > 0">
          <span>24h 終局失敗</span>
          <el-tag type="danger" size="small">{{ data.line.retry_final_failed_24h }} 筆</el-tag>
        </li>
      </ul>

      <!-- Supabase -->
      <div class="integration-row">
        <span class="integration-name">Supabase 儲存</span>
        <el-tag :type="breakerTagType(data.supabase.breaker)" size="small" effect="dark">
          {{ breakerLabel(data.supabase.breaker) }}
        </el-tag>
      </div>
      <ul
        v-if="data.supabase.pending_uploads > 0 || data.supabase.final_failed > 0"
        class="integration-detail"
      >
        <li v-if="data.supabase.pending_uploads > 0">
          <span>待同步上傳</span>
          <el-tag type="warning" size="small">{{ data.supabase.pending_uploads }} 筆</el-tag>
        </li>
        <li v-if="data.supabase.final_failed > 0">
          <span>永久失敗</span>
          <el-tag type="danger" size="small">{{ data.supabase.final_failed }} 筆</el-tag>
        </li>
      </ul>

      <!-- External HTTP -->
      <div class="integration-row">
        <span class="integration-name">外部 API</span>
        <el-tag :type="breakerTagType(data.external_http.breaker)" size="small" effect="dark">
          {{ breakerLabel(data.external_http.breaker) }}
        </el-tag>
      </div>

      <p v-if="hasAnyIssue" class="hint warn">
        部分整合異常，請至監控系統確認，必要時通知技術維運。
      </p>
      <p v-else class="hint">所有外部整合運作正常。</p>
    </template>
  </el-card>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { Connection } from '@element-plus/icons-vue'
import { useIntegrationsHealth, type IntegrationsHealth } from '@/composables/useIntegrationsHealth'

const { data, pending, error, refresh } = useIntegrationsHealth()

type BreakerState = IntegrationsHealth['line']['breaker']

function breakerTagType(state: BreakerState): 'success' | 'warning' | 'danger' {
  if (state === 'closed') return 'success'
  if (state === 'half_open') return 'warning'
  return 'danger'  // open
}

function breakerLabel(state: BreakerState): string {
  if (state === 'closed') return '正常'
  if (state === 'half_open') return '恢復中'
  return '熔斷'
}

function tokenHealthLabel(healthy: boolean | null): string {
  if (healthy === null) return '未檢查'
  return healthy ? '正常' : '異常'
}

const hasAnyIssue = computed(() => {
  if (!data.value) return false
  const d = data.value
  return (
    d.line.breaker !== 'closed' ||
    d.supabase.breaker !== 'closed' ||
    d.external_http.breaker !== 'closed' ||
    d.line.token_healthy === false ||
    d.line.retry_pending > 0 ||
    d.line.retry_final_failed_24h > 0 ||
    d.supabase.pending_uploads > 0 ||
    d.supabase.final_failed > 0
  )
})
</script>

<style scoped>
.integrations-health-card .card-title {
  display: flex;
  align-items: center;
  gap: 8px;
}
.integrations-health-card .card-title > span {
  flex: 1;
}
.integration-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 0;
  border-bottom: 1px solid var(--el-border-color-lighter);
}
.integration-row:last-of-type {
  border-bottom: none;
}
.integration-name {
  font-weight: 500;
}
.integration-detail {
  list-style: none;
  margin: 0 0 8px 16px;
  padding: 0;
  font-size: 0.9em;
  color: var(--el-text-color-secondary);
}
.integration-detail li {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 2px 0;
}
.hint {
  margin: 8px 0 0;
  font-size: 0.85em;
  color: var(--el-text-color-secondary);
}
.hint.warn {
  color: var(--el-color-warning);
}
.loading-text,
.error-text {
  padding: 12px 0;
  text-align: center;
  color: var(--el-text-color-secondary);
}
.error-text {
  color: var(--el-color-danger);
}
</style>
