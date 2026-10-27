<script setup lang="ts">
import { ref, reactive, computed, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { CircleCheck } from '@element-plus/icons-vue'
import { getAnomalies, confirmAnomaly as confirmAnomalyApi } from '@/api/portal'
import { apiError } from '@/utils/error'
import PortalPageHeader from '@/components/portal/PortalPageHeader.vue'
import EmptyState from '@/components/common/EmptyState.vue'
import { usePortalDashboardStore } from '@/stores/portalDashboard'

interface AnomalyEntry { id: number; type?: string; confirmed?: boolean; date?: string; weekday?: string; type_label?: string; detail?: string; estimated_deduction?: number | string; selected_action?: string; remark?: string; submitting?: boolean; [key: string]: unknown }
const loading = ref(false)
const anomalies = ref<AnomalyEntry[]>([])

// 首頁「異常待確認」badge 統計的是全期間，但本頁只查單月。若不讀網址帶進來的年月，
// 舊月份的待確認異常就永遠走不到，badge 數字也永遠消不掉（UI 完全沒提示該翻哪個月）。
const route = useRoute()
const now = new Date()
const _queryInt = (v: unknown, fallback: number) => {
  const n = Number(Array.isArray(v) ? v[0] : v)
  return Number.isInteger(n) && n > 0 ? n : fallback
}
const query = reactive({
  year: _queryInt(route.query.year, now.getFullYear()),
  month: _queryInt(route.query.month, now.getMonth() + 1),
})
const hasQueryMonth = route.query.year != null && route.query.month != null

// 側欄與「我要申請」選單直連本頁不帶年月；只有首頁格子會帶最早待確認月份。
// 為了讓三個入口落點一致，沒帶年月時自己去讀首頁摘要（store 有 60s 快取，
// 從首頁點進來不會多打一次）決定落在哪個月。
interface PendingMonth { year: number; month: number }
const dashboardStore = usePortalDashboardStore()
const pendingTotal = ref(0)
const earliestPending = ref<PendingMonth | null>(null)

async function loadPendingSummary() {
  try {
    const summary = (await dashboardStore.fetchSummary()) as { actions?: Record<string, unknown> } | null
    const actions = summary?.actions ?? {}
    pendingTotal.value = Number(actions.pending_anomaly_confirms) || 0
    const e = actions.pending_anomaly_earliest as Partial<PendingMonth> | null | undefined
    earliestPending.value = e && Number.isInteger(e.year) && Number.isInteger(e.month)
      ? { year: e.year as number, month: e.month as number }
      : null
  } catch {
    // 摘要讀不到不影響本頁：維持網址或當月
  }
}

const showJumpToEarliest = computed(() => {
  const e = earliestPending.value
  return pendingTotal.value > 0 && !!e && (e.year !== query.year || e.month !== query.month)
})

function jumpToEarliest() {
  const e = earliestPending.value
  if (!e) return
  query.year = e.year
  query.month = e.month
  fetchAnomalies()
}
// 動態年份（避免硬編 [2024..2027] 於 2028 斷頭）
const yearOptions = computed(() => {
  const y = now.getFullYear()
  return [y - 2, y - 1, y, y + 1]
})

const fetchAnomalies = async () => {
  loading.value = true
  try {
    const res = await getAnomalies({ year: query.year, month: query.month })
    anomalies.value = (res.data as Record<string, unknown>[]).map((a) => ({ ...a, selected_action: '', remark: '', submitting: false }) as AnomalyEntry)
  } catch (error) {
    ElMessage.error('載入失敗')
  } finally {
    loading.value = false
  }
}

// 送出後後端冪等回傳、不能改選（api/portal/anomalies.py），先講清楚各選項的實際後果
function buildAnomalyConfirm(a: AnomalyEntry): string {
  const what = `${a.date ?? ''} ${a.type_label ?? '異常'}`.trim()
  const tail = '送出後這筆不能再改選其他方式。'
  if (a.selected_action === 'use_pto') {
    return `會送出一張 ${a.date ?? '當天'} 整天（8 小時）的特休假單給主管核准，核准後抵銷「${what}」的扣款。${tail}`
  }
  if (a.selected_action === 'accept') {
    return `確認接受「${what}」的預估扣款 NT$ ${a.estimated_deduction ?? 0}？${tail}`
  }
  return `送出「${what}」的申訴，由行政審核。${tail}`
}

async function confirmAction(a: AnomalyEntry): Promise<boolean> {
  return ElMessageBox.confirm(buildAnomalyConfirm(a), '確認處理方式', {
    type: 'warning',
    confirmButtonText: '確認送出',
    cancelButtonText: '再想想',
  }).then(() => true, () => false)
}

const confirmAnomaly = async (anomaly: AnomalyEntry) => {
  if (!anomaly.selected_action) {
    ElMessage.warning('請選擇處理方式')
    return
  }
  // 申訴理由是唯一會送進後端稽核軌跡的自由文字，空白送出等於提交一筆管理員無從處理的申訴
  if (anomaly.selected_action === 'dispute' && !anomaly.remark?.trim()) {
    ElMessage.warning('請說明申訴原因')
    return
  }

  if (!(await confirmAction(anomaly))) return

  anomaly.submitting = true
  try {
    // 必須帶 anomaly_type：同一天最多 4 個異常項目，只帶 attendance_id 會讓後端
    // 把整天標成已處理（老師從未處理過其他項目，也無法只針對早退申訴）。
    const res = await confirmAnomalyApi(
      anomaly.id,
      anomaly.selected_action,
      anomaly.remark?.trim() || undefined,
      anomaly.type as string,
    )
    // 後端缺 response_model，res.data 為 unknown，narrow 取回應訊息。
    ElMessage.success((res.data as { message: string }).message)
    anomaly.confirmed = true
  } catch (error) {
    ElMessage.error(apiError(error, '處理失敗'))
  } finally {
    anomaly.submitting = false
  }
}

const pendingCount = computed(() => anomalies.value.filter(a => !a.confirmed).length)

onMounted(async () => {
  await loadPendingSummary()
  if (!hasQueryMonth && pendingTotal.value > 0 && earliestPending.value) {
    query.year = earliestPending.value.year
    query.month = earliestPending.value.month
  }
  await fetchAnomalies()
})
</script>

<template>
  <div class="portal-anomaly">
    <PortalPageHeader title="出勤異常確認">
      <template #actions>
        <div class="query-row">
          <el-select v-model="query.year" style="width: 100px;" @change="fetchAnomalies">
            <el-option v-for="y in yearOptions" :key="y" :label="`${y}年`" :value="y" />
          </el-select>
          <el-select v-model="query.month" style="width: 100px;" @change="fetchAnomalies">
            <el-option v-for="m in 12" :key="m" :label="`${m}月`" :value="m" />
          </el-select>
        </div>
      </template>
    </PortalPageHeader>

    <el-alert
      v-if="pendingCount > 0"
      :title="`您有 ${pendingCount} 筆出勤異常需要確認`"
      type="warning"
      :closable="false"
      show-icon
      style="margin-bottom: 16px;"
    />

    <div v-loading="loading">
      <el-card
        v-for="anomaly in anomalies"
        :key="`${anomaly.id}-${anomaly.type}`"  
        class="anomaly-card"
        :class="{ confirmed: anomaly.confirmed }"
      >
        <div class="anomaly-header">
          <div class="anomaly-date">
            <span class="date-text">{{ anomaly.date }}</span>
            <el-tag size="small" type="info">星期{{ anomaly.weekday }}</el-tag>
          </div>
          <el-tag :type="anomaly.type === 'late' ? 'warning' : 'danger'" size="default">
            {{ anomaly.type_label }}
          </el-tag>
        </div>

        <div class="anomaly-detail">
          <p class="detail-text">{{ anomaly.detail }}</p>
          <p class="deduction-text">
            預估扣款: <strong>NT$ {{ anomaly.estimated_deduction }}</strong>
          </p>
        </div>

        <template v-if="!anomaly.confirmed">
          <el-divider />
          <div class="anomaly-actions">
            <p style="margin: 0 0 8px 0; font-weight: 600;">請選擇處理方式：</p>
            <el-radio-group v-model="anomaly.selected_action">
              <el-radio value="use_pto">使用特休抵銷（送整天特休假單）</el-radio>
              <el-radio value="accept">接受扣款</el-radio>
              <el-radio value="dispute">提出申訴</el-radio>
            </el-radio-group>

            <el-input
              v-if="anomaly.selected_action === 'dispute'"
              v-model="anomaly.remark"
              type="textarea"
              :rows="2"
              placeholder="請說明申訴原因"
              style="margin-top: 8px;"
            />

            <el-button
              type="primary"
              size="default"
              :loading="anomaly.submitting"
              style="margin-top: 12px;"
              @click="confirmAnomaly(anomaly)"
            >
              確認送出
            </el-button>
          </div>
        </template>

        <div v-else class="confirmed-badge">
          <el-tag type="success" effect="dark">已處理</el-tag>
        </div>
      </el-card>

      <EmptyState
        v-if="!loading && anomalies.length === 0 && showJumpToEarliest"
        variant="mobile"
        :icon="CircleCheck"
        :title="`${query.month} 月沒有出勤異常`"
        :description="`其他月份還有 ${pendingTotal} 筆待確認`"
      >
        <template #action>
          <el-button type="primary" data-test="anomaly-jump-earliest" @click="jumpToEarliest">
            前往 {{ earliestPending?.year }} 年 {{ earliestPending?.month }} 月
          </el-button>
        </template>
      </EmptyState>
      <EmptyState
        v-else-if="!loading && anomalies.length === 0"
        variant="mobile"
        :icon="CircleCheck"
        :title="`${query.month} 月沒有出勤異常`"
      />
    </div>
  </div>
</template>

<style scoped>
.query-row {
  display: flex;
  gap: 8px;
}

.anomaly-card {
  margin-bottom: var(--space-4);
  transition: opacity 0.3s;
}

.anomaly-card.confirmed {
  opacity: 0.6;
}

.anomaly-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: var(--space-3);
}

.anomaly-date {
  display: flex;
  align-items: center;
  gap: 8px;
}

.date-text {
  font-size: var(--text-lg);
  font-weight: 600;
}

.anomaly-detail {
  background: var(--bg-color-soft);
  padding: var(--space-3) var(--space-4);
  border-radius: 6px;
}

.detail-text {
  margin: 0 0 4px 0;
  font-size: var(--text-base);
}

.deduction-text {
  margin: 0;
  color: var(--color-danger);
  font-size: var(--text-base);
}

.confirmed-badge {
  margin-top: var(--space-3);
  text-align: right;
}
</style>
