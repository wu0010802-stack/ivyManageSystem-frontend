<template>
  <div class="parent-monitor-view">
    <PageHeader title="家長端監控" subtitle="LINE 家長 portal 服務健康狀態一覽（SPEC-023）">
      <template #actions>
        <el-button :loading="loading" data-testid="monitor-refresh" @click="() => fetchOverview()">
          重新整理
        </el-button>
      </template>
    </PageHeader>

    <div v-if="loading && overview === null" data-testid="monitor-loading" class="parent-monitor-view__loading">
      載入中…
    </div>

    <div v-else-if="errorMessage" data-testid="monitor-error" class="parent-monitor-view__error">
      <p>{{ errorMessage }}</p>
    </div>

    <div v-else-if="enabled === false" data-testid="monitor-disabled" class="parent-monitor-view__disabled">
      <EmptyState
        title="家長端監控尚未啟用"
        description="此環境尚未開啟家長端監控功能。"
      />
      <p class="parent-monitor-view__hint">
        請洽維運人員設定環境變數 <code>PARENT_MONITOR_ENABLED=true</code> 以啟用本頁監控。
      </p>
    </div>

    <template v-else-if="enabled === true">
      <section data-testid="lights-board" class="lights-board">
        <div
          data-testid="overall-light"
          class="lights-board__overall"
          :class="`lights-board__overall--${overview?.overall ?? 'gray'}`"
        >
          <span class="lights-board__overall-label">整體狀態</span>
          <span class="lights-board__overall-value">{{ levelLabel(overview?.overall) }}</span>
        </div>

        <div class="lights-board__grid">
          <div
            v-for="light in lights"
            :key="light.key"
            :data-testid="`light-${light.key}`"
            class="light-card"
            :class="`light-card--${light.level}`"
          >
            <span class="light-card__label">{{ LIGHT_LABELS[light.key] ?? light.key }}</span>
            <span class="light-card__level">{{ levelLabel(light.level) }}</span>
            <span class="light-card__reason">{{ light.reason }}</span>
            <span v-if="light.metric != null" class="light-card__metric">{{ light.metric }}</span>
          </div>
        </div>

        <p v-if="overview?.generated_at" class="lights-board__generated-at">
          更新時間：{{ overview.generated_at }}
        </p>
      </section>

      <el-tabs v-model="activeTab" class="parent-monitor-view__tabs">
        <el-tab-pane label="探針與設定健檢" name="probes">
          <!-- Task 14 填內容：探針可用率、config-check -->
        </el-tab-pane>
        <el-tab-pane label="家長行為" name="activity">
          <!-- Task 15 填內容：家長行為稽核 -->
        </el-tab-pane>
      </el-tabs>
    </template>
  </div>
</template>

<script setup lang="ts">
/**
 * 家長端監控頁殼（SPEC-023 批次 1，Task 12）。
 *
 * 總開關（`PARENT_MONITOR_ENABLED`）關閉時後端回 `200 {enabled: false}`，
 * 本頁對應整頁 EmptyState，不是錯誤畫面——「功能沒開」與「查詢失敗」是
 * 兩種不同狀態，不能共用同一個錯誤分支。
 *
 * 燈板在此檔內放最小版（九燈 + 總燈），Task 13 才抽成 LightsBoard 元件；
 * 兩個分頁（探針健檢／家長行為）先是空殼，內容由 Task 14／15 填入。
 *
 * ⚠ 未收集的訊號（`metric: null`）一律不顯示 0——`traffic_1h`／
 * `client_events_24h` 批次 1 恆為 null，顯示 0 會被誤讀成「零錯誤」，
 * 是本頁最核心的防呆規則。
 */
import { onMounted, onUnmounted, ref } from 'vue'

import PageHeader from '@/components/common/PageHeader.vue'
import EmptyState from '@/components/common/EmptyState.vue'
import { getParentMonitorOverview } from '@/api/parentMonitor'
import { getErrorMessage } from '@/utils/errorHandler'

type OverviewData = Awaited<ReturnType<typeof getParentMonitorOverview>>['data']
type LightItem = NonNullable<OverviewData['lights']>[number]

const REFRESH_INTERVAL_MS = 60_000

const LIGHT_LABELS: Record<string, string> = {
  login_channel: '家長登入通道',
  tenant_entry: '租戶入口',
  line_push: 'LINE 推播',
  storage: '儲存服務',
  db_rls: '資料庫 / RLS',
  schedulers: '排程',
  api_errors: 'API 錯誤率',
  silence: '流量沉默偵測',
  client_events: '前端錯誤事件',
}

const LEVEL_LABELS: Record<string, string> = {
  green: '正常',
  yellow: '警示',
  red: '異常',
  gray: '未知',
}

function levelLabel(level: string | null | undefined): string {
  if (!level) return LEVEL_LABELS.gray
  return LEVEL_LABELS[level] ?? level
}

const loading = ref(true)
const errorMessage = ref<string | null>(null)
const enabled = ref<boolean | null>(null)
const overview = ref<OverviewData | null>(null)
const lights = ref<LightItem[]>([])
const activeTab = ref<'probes' | 'activity'>('probes')

let timerId: ReturnType<typeof setInterval> | null = null

async function fetchOverview(): Promise<void> {
  if (typeof document !== 'undefined' && document.hidden) return
  loading.value = true
  try {
    const res = await getParentMonitorOverview()
    overview.value = res.data
    enabled.value = res.data.enabled
    lights.value = res.data.lights ?? []
    errorMessage.value = null
  } catch (e) {
    errorMessage.value = getErrorMessage(e, '家長端監控資料載入失敗，請稍後再試')
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  void fetchOverview()
  timerId = setInterval(() => void fetchOverview(), REFRESH_INTERVAL_MS)
})

onUnmounted(() => {
  if (timerId) {
    clearInterval(timerId)
    timerId = null
  }
})
</script>

<style scoped>
.parent-monitor-view__disabled {
  padding: 24px 0;
}

.parent-monitor-view__hint {
  text-align: center;
  color: var(--el-text-color-secondary, #909399);
  margin-top: 8px;
}

.parent-monitor-view__hint code {
  background: var(--el-fill-color-light, #f5f7fa);
  padding: 2px 6px;
  border-radius: 4px;
}

.lights-board {
  margin-bottom: 20px;
}

.lights-board__overall {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 8px 16px;
  border-radius: 8px;
  margin-bottom: 12px;
  font-weight: 600;
}

.lights-board__overall--green {
  background: var(--el-color-success-light-9, #f0f9eb);
  color: var(--el-color-success, #67c23a);
}

.lights-board__overall--yellow {
  background: var(--el-color-warning-light-9, #fdf6ec);
  color: var(--el-color-warning, #e6a23c);
}

.lights-board__overall--red {
  background: var(--el-color-danger-light-9, #fef0f0);
  color: var(--el-color-danger, #f56c6c);
}

.lights-board__overall--gray {
  background: var(--el-fill-color-light, #f5f7fa);
  color: var(--el-text-color-secondary, #909399);
}

.lights-board__grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
  gap: 12px;
}

.light-card {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 12px;
  border-radius: 8px;
  border: 1px solid var(--el-border-color-lighter, #ebeef5);
}

.light-card--green {
  border-left: 4px solid var(--el-color-success, #67c23a);
}

.light-card--yellow {
  border-left: 4px solid var(--el-color-warning, #e6a23c);
}

.light-card--red {
  border-left: 4px solid var(--el-color-danger, #f56c6c);
}

.light-card--gray {
  border-left: 4px solid var(--el-border-color, #dcdfe6);
}

.light-card__label {
  font-weight: 600;
}

.light-card__level {
  font-size: 12px;
  color: var(--el-text-color-secondary, #909399);
}

.light-card__reason {
  font-size: 13px;
}

.light-card__metric {
  font-size: 12px;
  color: var(--el-text-color-secondary, #909399);
}

.lights-board__generated-at {
  margin-top: 8px;
  font-size: 12px;
  color: var(--el-text-color-secondary, #909399);
}
</style>
