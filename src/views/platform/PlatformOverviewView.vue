<template>
  <div class="platform-overview">
    <PageHeader title="總部總覽" :subtitle="subtitle">
      <template #actions>
        <el-button :loading="pending" data-testid="overview-refresh" @click="refreshAll">重新整理</el-button>
      </template>
    </PageHeader>

    <el-alert
      v-if="errorText"
      type="error"
      :closable="false"
      data-testid="overview-error"
      :title="errorText"
      class="platform-overview__alert"
    />

    <div class="summary" data-testid="overview-summary">
      <div class="summary__item">
        <span class="summary__label">分校數（啟用中）</span>
        <span class="summary__value" data-testid="summary-active">{{ activeCount }}</span>
      </div>
      <div class="summary__item">
        <span class="summary__label">學生總數</span>
        <span class="summary__value" data-testid="summary-students">{{ totalStudents }}</span>
      </div>
      <div class="summary__item">
        <span class="summary__label">員工總數</span>
        <span class="summary__value" data-testid="summary-employees">{{ totalEmployees }}</span>
      </div>
      <div class="summary__item">
        <span class="summary__label">待完成 onboarding</span>
        <span class="summary__value" data-testid="summary-onboarding">{{ pendingOnboarding }}</span>
      </div>
    </div>

    <div v-if="schools.length" class="cards" data-testid="overview-cards">
      <article v-for="t in schools" :key="t.id" class="tenant-card" :data-testid="`tenant-card-${t.id}`">
        <header class="tenant-card__head">
          <router-link class="tenant-card__name" :to="`/platform/tenants/${t.id}`">
            {{ t.display_name || t.name }}
          </router-link>
          <el-tag :type="tenantStatusTagType(t.status)" size="small">{{ tenantStatusLabel(t.status) }}</el-tag>
        </header>
        <p class="tenant-card__slug">{{ t.slug }}</p>
        <dl class="tenant-card__stats">
          <div>
            <dt>學生</dt>
            <dd>{{ t.student_count ?? '—' }}</dd>
          </div>
          <div>
            <dt>員工</dt>
            <dd>{{ t.employee_count ?? '—' }}</dd>
          </div>
        </dl>
        <div v-if="metricsOf(t.id)" class="tenant-card__metrics">
          <div v-for="[key, value] in metricsOf(t.id)" :key="key" class="metric">
            <span class="metric__label">{{ metricLabel(key) }}</span>
            <div class="metric__value">
              <MetricValue :metric-key="key" :value="value" />
            </div>
          </div>
        </div>
        <p v-else-if="errorOf(t.id)" class="tenant-card__error" :data-testid="`tenant-card-error-${t.id}`">
          本月數據取得失敗：{{ errorOf(t.id) }}
        </p>
      </article>
    </div>
    <EmptyState
      v-else-if="!pending"
      title="沒有分校"
      description="尚未建立任何分校，或後端總部功能未開通（PLATFORM_ENABLED）。"
    />
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import PageHeader from '@/components/common/PageHeader.vue'
import EmptyState from '@/components/common/EmptyState.vue'
import { useCachedAsync } from '@/composables/useCachedAsync'
import { platformCacheKey } from '@/composables/useActingTenant'
import { getErrorMessage } from '@/utils/errorHandler'
import { getPlatformReport, type PlatformReport } from '@/api/platform'
import { usePlatformTenants } from './usePlatformTenants'
import { tenantStatusLabel, tenantStatusTagType } from './tenantDisplay'
import { metricLabel } from './reportFormat'
import MetricValue from './MetricValue.vue'

const now = new Date()
const year = now.getFullYear()
const month = now.getMonth() + 1

const subtitle = `${year} 年 ${month} 月`

const { tenants, error: listError, pending: listPending, refresh: refreshList } = usePlatformTenants()

// 卡片牆的月度數字走 overview 報表（逐校 builder + 合併，後端 platform_ 快取）。
// key 帶年月；acting tenant 由 platformCacheKey 補上。
const {
  data: report,
  error: reportError,
  pending: reportPending,
  refresh: refreshReport,
} = useCachedAsync<PlatformReport | null>(
  platformCacheKey(`reports:overview:${year}-${month}`),
  async () => {
    const res = await getPlatformReport('overview', { year, month })
    return res.data ?? null
  },
  { ttl: 5 * 60_000 },
)

const schools = computed(() => tenants.value.filter((t) => t.kind === 'school'))
const activeCount = computed(() => schools.value.filter((t) => t.status === 'active').length)
const totalStudents = computed(() =>
  schools.value.reduce((sum, t) => sum + (t.student_count ?? 0), 0),
)
const totalEmployees = computed(() =>
  schools.value.reduce((sum, t) => sum + (t.employee_count ?? 0), 0),
)
/**
 * 清單端點不回 onboarding 缺口（那是詳情端點的欄位），這裡只能以「有無 public_origin」
 * 這個總部真的看得到的訊號估算——沒有對外網址的分校連登入連結都發不出去。
 * 精確的 onboarding 待辦在詳情頁（`missing_config_keys` / `missing_brand_keys`）。
 */
const pendingOnboarding = computed(
  () => schools.value.filter((t) => !t.public_origin).length,
)

const pending = computed(() => listPending.value || reportPending.value)
const errorText = computed(() => {
  const err = listError.value || reportError.value
  return err ? getErrorMessage(err, '總覽載入失敗') : null
})

const rowsById = computed(() => {
  const map = new Map<number, { data?: Record<string, unknown>; error?: string | null }>()
  for (const row of report.value?.tenants ?? []) map.set(row.tenant_id, row)
  return map
})

function metricsOf(tenantId: number): [string, unknown][] | null {
  const row = rowsById.value.get(tenantId)
  if (!row || row.error) return null
  const entries = Object.entries(row.data ?? {})
  // 卡片只放前四個指標，其餘去報表頁看——卡片牆的價值是掃視，不是完整報表。
  return entries.length ? entries.slice(0, 4) : null
}

function errorOf(tenantId: number): string | null {
  return rowsById.value.get(tenantId)?.error ?? null
}

function refreshAll(): void {
  refreshList(true).catch(() => {})
  refreshReport(true).catch(() => {})
}
</script>

<style scoped>
.platform-overview__alert {
  margin: var(--space-3) 0;
}

.summary {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
  gap: var(--space-3);
  margin-bottom: var(--space-5);
}

.summary__item {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
  padding: var(--space-3) var(--space-4);
  border: 1px solid var(--el-border-color-lighter);
  border-radius: var(--radius-md);
}

.summary__label {
  font-size: var(--text-xs);
  color: var(--text-tertiary);
}

.summary__value {
  font-size: var(--text-2xl);
  font-weight: 700;
}

.cards {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
  gap: var(--space-4);
}

.tenant-card {
  padding: var(--space-4);
  border: 1px solid var(--el-border-color-lighter);
  border-radius: var(--radius-lg);
  background: var(--el-bg-color-overlay, #fff);
}

.tenant-card__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-2);
}

.tenant-card__name {
  font-weight: 700;
  color: var(--el-color-primary);
  text-decoration: none;
}

.tenant-card__slug {
  margin: 0 0 var(--space-3);
  font-size: var(--text-xs);
  color: var(--text-tertiary);
}

.tenant-card__stats {
  display: flex;
  gap: var(--space-5);
  margin: 0 0 var(--space-3);
}

.tenant-card__stats dt {
  font-size: var(--text-xs);
  color: var(--text-tertiary);
}

.tenant-card__stats dd {
  margin: 0;
  font-size: var(--text-lg);
  font-weight: 600;
}

.tenant-card__metrics {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
  border-top: 1px dashed var(--el-border-color-lighter);
  padding-top: var(--space-2);
}

.metric {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: var(--space-2);
  font-size: var(--text-sm);
}

.metric__label {
  color: var(--text-tertiary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  min-width: 0;
}

/* 數字優先權比標籤高：擠不下時標籤截斷、金額一律完整顯示（不換行/不截斷）。 */
.metric__value {
  flex-shrink: 0;
}

.tenant-card__error {
  margin: 0;
  font-size: var(--text-xs);
  color: var(--el-color-danger);
}
</style>
