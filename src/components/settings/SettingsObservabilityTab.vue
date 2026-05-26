<template>
  <div class="observability-tab">
    <div class="toolbar">
      <div class="worker-info" v-if="lastFetched">
        <span class="worker-chip" data-testid="worker-chip">
          PID {{ workerPid }} @ {{ hostname }}
        </span>
        <span class="fetched-at">最後刷新 {{ lastFetched }}</span>
      </div>
      <el-button
        type="primary"
        size="small"
        :loading="loading"
        @click="refresh"
        data-testid="refresh-btn"
      >
        重新整理
      </el-button>
    </div>

    <el-alert
      v-if="loadError"
      type="error"
      :closable="false"
      show-icon
      title="無法取得 scheduler 指標"
      :description="loadError"
      class="error-banner"
      data-testid="load-error"
    />

    <el-alert
      v-else-if="failingCount > 0"
      type="warning"
      :closable="false"
      show-icon
      :title="`${failingCount} 個排程連續失敗 ≥ ${ALERT_THRESHOLD} 次（已上報 Sentry）`"
      class="alert-banner"
      data-testid="failing-banner"
    />

    <el-empty
      v-if="!loadError && schedulerRows.length === 0 && !loading"
      description="此 worker 尚未執行任何排程（多 worker 部署時請刷新數次涵蓋全部 worker）"
      data-testid="empty-state"
    />

    <el-table
      v-else-if="!loadError"
      :data="schedulerRows"
      v-loading="loading"
      border
      data-testid="metrics-table"
    >
      <el-table-column prop="name" label="排程名稱" min-width="220" sortable />
      <el-table-column label="連續失敗" width="110" align="center" sortable :sort-by="'consecutive_failures'">
        <template #default="{ row }">
          <el-tag
            v-if="row.consecutive_failures >= ALERT_THRESHOLD"
            type="danger"
            data-testid="failure-tag-danger"
          >
            {{ row.consecutive_failures }}
          </el-tag>
          <el-tag
            v-else-if="row.consecutive_failures > 0"
            type="warning"
          >
            {{ row.consecutive_failures }}
          </el-tag>
          <span v-else class="muted">0</span>
        </template>
      </el-table-column>
      <el-table-column label="最後成功" min-width="180">
        <template #default="{ row }">
          <span v-if="row.last_success_at">{{ row.last_success_at }}</span>
          <span v-else class="muted">—</span>
        </template>
      </el-table-column>
      <el-table-column label="最後失敗" min-width="180">
        <template #default="{ row }">
          <span v-if="row.last_failure_at">{{ row.last_failure_at }}</span>
          <span v-else class="muted">—</span>
        </template>
      </el-table-column>
      <el-table-column label="最後筆數" width="110" align="right" prop="last_rows_processed" sortable />
      <el-table-column label="總筆數" width="110" align="right" prop="total_rows_processed" sortable />
      <el-table-column label="總執行" width="100" align="right" prop="total_runs" sortable />
      <el-table-column label="總失敗" width="100" align="right" prop="total_failures" sortable />
      <el-table-column label="最後錯誤訊息" min-width="240">
        <template #default="{ row }">
          <span v-if="row.last_error_message" class="error-text">{{ row.last_error_message }}</span>
          <span v-else class="muted">—</span>
        </template>
      </el-table-column>
    </el-table>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import {
  ElAlert,
  ElButton,
  ElEmpty,
  ElTable,
  ElTableColumn,
  ElTag,
} from 'element-plus'
import { getSchedulerMetrics } from '@/api/internalMetrics'
import type { ApiResponse } from '@/api/_generated/typed'

// 與後端 utils/scheduler_observability.ALERT_THRESHOLD 對齊；變動時兩端一起改
const ALERT_THRESHOLD = 3

type MetricsResponse = ApiResponse<'/internal/metrics', 'get'>
type SchedulerMetric = MetricsResponse['schedulers'][string]
interface SchedulerRow extends SchedulerMetric {
  name: string
}

const loading = ref(false)
const loadError = ref<string | null>(null)
const workerPid = ref<number | null>(null)
const hostname = ref<string>('')
const lastFetched = ref<string>('')
const schedulerRows = ref<SchedulerRow[]>([])

const failingCount = computed(() =>
  schedulerRows.value.filter((r) => r.consecutive_failures >= ALERT_THRESHOLD).length,
)

async function refresh(): Promise<void> {
  loading.value = true
  loadError.value = null
  try {
    const resp = await getSchedulerMetrics()
    const data = resp.data as MetricsResponse
    workerPid.value = data.worker_pid
    hostname.value = data.hostname
    schedulerRows.value = Object.entries(data.schedulers)
      .map(([name, metric]) => ({ name, ...metric }))
      .sort((a, b) => a.name.localeCompare(b.name))
    lastFetched.value = new Date().toLocaleTimeString()
  } catch (err) {
    loadError.value = err instanceof Error ? err.message : String(err)
  } finally {
    loading.value = false
  }
}

onMounted(refresh)

defineExpose({ refresh, schedulerRows, failingCount })
</script>

<style scoped>
.observability-tab {
  padding: 8px 0;
}
.toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
  gap: 12px;
}
.worker-info {
  display: flex;
  align-items: center;
  gap: 12px;
  font-size: 13px;
  color: var(--el-text-color-regular);
}
.worker-chip {
  padding: 2px 8px;
  background: var(--el-fill-color-light);
  border-radius: 4px;
  font-family: ui-monospace, SFMono-Regular, monospace;
}
.fetched-at {
  color: var(--el-text-color-secondary);
}
.error-banner,
.alert-banner {
  margin-bottom: 12px;
}
.muted {
  color: var(--el-text-color-placeholder);
}
.error-text {
  color: var(--el-color-danger);
  font-family: ui-monospace, SFMono-Regular, monospace;
  font-size: 12px;
}
</style>
