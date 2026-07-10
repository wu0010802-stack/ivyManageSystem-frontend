<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Refresh } from '@element-plus/icons-vue'
import { listAppraisalCycles, getAppraisalCycleExceptions } from '@/api/appraisal'
import { listYearEndCycles, getYearEndCycleExceptions } from '@/api/yearEnd'
import { apiError } from '@/utils/error'
import { formatTimeTW } from '@/utils/format'
import { hasPermission } from '@/utils/auth'
import { CYCLE_STATUS_LABEL, exceptionTypeLabel } from '@/constants/appraisalYearEnd'

// 例外中心 MVP：把後端兩支彙整端點（考核 / 年終）做成單一工作佇列頁——行政一頁看到
// 「這批還有什麼要人工處理」，逐筆「前往處理」深連結到修復介面。唯讀彙整，不建新表；
// 「處理」＝到源頭修復後對應項目自動消失（下次呼叫即不再出現，故本頁提供重新整理鈕）。

type Severity = 'blocking' | 'warning' | 'info'

interface ExceptionItem {
  type: string
  severity: Severity
  entity_type: string
  entity_id: string
  target_name: string
  reason: string
  impact: string
  suggested_action: string
  deep_link: string
}

interface ExceptionsData {
  cycle_id: number
  generated_at: string
  counts_by_type: Record<string, number>
  items: ExceptionItem[]
}

interface CycleOption {
  id: number
  academic_year: number
  status?: string
  semester?: number
  [key: string]: unknown
}

const SEVERITY_TAG_TYPE: Record<Severity, 'danger' | 'warning' | 'info'> = {
  blocking: 'danger',
  warning: 'warning',
  info: 'info',
}
const SEVERITY_LABEL: Record<Severity, string> = {
  blocking: '阻斷',
  warning: '警告',
  info: '提示',
}
type CycleFetcher = () => Promise<{ data: unknown }>
type ExceptionsFetcher = (cycleId: number) => Promise<{ data: unknown }>

/** URL query 修正片段：URL 週期值失效時由 loadCycles 回傳、onMounted 合併後單次 replace。 */
type QueryCorrection = Record<string, string>

const route = useRoute()
const router = useRouter()

/** 單一批次（考核／年終）的週期下拉 + 例外清單狀態，回傳單一 reactive 物件供 template 直接綁定。
 *  週期選擇同步進 URL query（`queryKey`：考核 acycle / 年終 ycycle），F5 / 分享連結可保留篩選狀態：
 *  初值讀 URL 優先；URL 值不在週期清單中（例如已刪除的週期）則 fallback 回預設「選最新」，並把
 *  需要的 URL 修正以回傳值交給 onMounted **合併成單次 replace**——兩組各自 fire-and-forget 併發
 *  replace 會被 vue-router pendingLocation 機制互相取消、後發起者的 spread 又是修正前快照，
 *  其中一組修正會被靜默還原，故不可在此各自 replace。 */
function useExceptionGroup(
  fetchCycles: CycleFetcher,
  fetchExceptions: ExceptionsFetcher,
  queryKey: 'acycle' | 'ycycle',
) {
  const cycles = ref<CycleOption[]>([])
  const cyclesLoading = ref(false)
  const selectedCycleId = ref<number | null>(null)
  const data = ref<ExceptionsData | null>(null)
  const loading = ref(false)
  const errorMsg = ref('')
  const typeFilter = ref<string>('all')

  const totalCount = computed(() => data.value?.items.length ?? 0)
  const typeCounts = computed(() => data.value?.counts_by_type ?? {})
  const filteredItems = computed(() => {
    const items = data.value?.items ?? []
    if (typeFilter.value === 'all') return items
    return items.filter((i) => i.type === typeFilter.value)
  })

  async function loadCycles(): Promise<QueryCorrection | null> {
    cyclesLoading.value = true
    try {
      const res = await fetchCycles()
      cycles.value = (res.data as CycleOption[]) ?? []
      if (cycles.value.length > 0 && selectedCycleId.value == null) {
        const queryRaw = route.query[queryKey]
        const queryId = typeof queryRaw === 'string' ? Number(queryRaw) : NaN
        const matched = cycles.value.find((c) => c.id === queryId)
        if (matched) {
          selectedCycleId.value = matched.id
        } else {
          // 預設選最新一筆：以 id 最大者為準（後端遞增主鍵，較大 id = 較晚建立）
          selectedCycleId.value = cycles.value.reduce((a, b) => (b.id > a.id ? b : a)).id
          if (queryRaw != null) {
            // URL 帶的週期值不在清單中（例如已刪除的週期）→ fallback 回預設，
            // 並回傳修正片段給 onMounted 合併成單次 replace（勿在此各自 replace，見上方註解）。
            return { [queryKey]: String(selectedCycleId.value) }
          }
        }
      }
      return null
    } catch (e) {
      errorMsg.value = apiError(e, '週期清單載入失敗')
      return null
    } finally {
      cyclesLoading.value = false
    }
  }

  async function loadExceptions() {
    if (selectedCycleId.value == null) return
    loading.value = true
    errorMsg.value = ''
    try {
      const res = await fetchExceptions(selectedCycleId.value)
      data.value = res.data as ExceptionsData
    } catch (e) {
      errorMsg.value = apiError(e, '例外清單載入失敗')
      data.value = null
    } finally {
      loading.value = false
    }
  }

  function onCycleChange() {
    typeFilter.value = 'all'
    loadExceptions()
    // 週期選擇變更 → 寫回 URL query，只動自己的 key、與其他 query 共存。
    router.replace({ query: { ...route.query, [queryKey]: String(selectedCycleId.value) } })
  }

  return reactive({
    cycles, cyclesLoading, selectedCycleId, data, loading, errorMsg, typeFilter,
    totalCount, typeCounts, filteredItems,
    loadCycles, loadExceptions, onCycleChange,
  })
}

const appraisal = useExceptionGroup(
  () => listAppraisalCycles(),
  (cycleId: number) => getAppraisalCycleExceptions(cycleId),
  'acycle',
)
const yearEnd = useExceptionGroup(
  () => listYearEndCycles(),
  (cycleId: number) => getYearEndCycleExceptions(cycleId),
  'ycycle',
)

function cycleLabel(c: CycleOption): string {
  const statusLabel = c.status ? `（${CYCLE_STATUS_LABEL[c.status] ?? c.status}）` : ''
  return `${c.academic_year} 學年度${statusLabel}`
}

const groups = computed(() => (
  [
    { key: 'appraisal', label: '考核批次', permission: 'APPRAISAL_READ', g: appraisal },
    { key: 'year-end', label: '年終批次', permission: 'YEAR_END_READ', g: yearEnd },
  ].filter((group) => hasPermission(group.permission))
))

async function bootGroup(
  group: ReturnType<typeof useExceptionGroup>,
  permission: string,
): Promise<QueryCorrection | null> {
  if (!hasPermission(permission)) return null
  const correction = await group.loadCycles()
  await group.loadExceptions()
  return correction
}

onMounted(async () => {
  const corrections = await Promise.all([
    bootGroup(appraisal, 'APPRAISAL_READ'),
    bootGroup(yearEnd, 'YEAR_END_READ'),
  ])
  // 合併兩組的 URL 修正（可能 0/1/2 個 key），有修正才做**一次** replace——
  // 併發兩次 replace 會經 vue-router pendingLocation 互相取消，其中一組修正被靜默還原。
  const merged: QueryCorrection = Object.assign({}, ...corrections.filter(Boolean))
  if (Object.keys(merged).length > 0) {
    router.replace({ query: { ...route.query, ...merged } })
  }
})
</script>

<template>
  <div class="exception-center">
    <div class="page-header">
      <h2>例外中心</h2>
      <p class="page-sub">一頁彙整這批還有什麼要人工處理，逐筆「前往處理」直達修復介面。</p>
    </div>

    <section
      v-for="group in groups"
      :key="group.key"
      class="exception-group"
      :data-test="`group-${group.key}`"
    >
      <div class="group-header">
        <span class="group-title">{{ group.label }}</span>
        <div class="group-header-actions">
          <el-select
            v-model="group.g.selectedCycleId"
            placeholder="選擇週期"
            style="width: 220px"
            :loading="group.g.cyclesLoading"
            :data-test="`${group.key}-cycle-select`"
            @change="group.g.onCycleChange"
          >
            <el-option
              v-for="c in group.g.cycles"
              :key="c.id"
              :label="cycleLabel(c)"
              :value="c.id"
            />
          </el-select>
          <span v-if="group.g.data" class="generated-at">
            彙整於 {{ formatTimeTW(group.g.data.generated_at) }}
          </span>
          <el-button
            :icon="Refresh"
            circle
            size="small"
            :loading="group.g.loading"
            :data-test="`${group.key}-refresh-button`"
            @click="group.g.loadExceptions()"
          />
        </div>
      </div>

      <el-alert
        v-if="group.g.errorMsg"
        :title="group.g.errorMsg"
        type="error"
        show-icon
        :closable="false"
        style="margin-bottom: var(--space-3)"
      />

      <template v-else-if="group.g.data">
        <div class="type-chips">
          <button
            type="button"
            class="type-chip"
            :class="{ 'type-chip--active': group.g.typeFilter === 'all' }"
            :data-test="`${group.key}-type-chip-all`"
            @click="group.g.typeFilter = 'all'"
          >
            全部
            <span class="type-chip__count">{{ group.g.totalCount }}</span>
          </button>
          <button
            v-for="(count, type) in group.g.typeCounts"
            :key="type"
            type="button"
            class="type-chip"
            :class="{ 'type-chip--active': group.g.typeFilter === type }"
            :data-test="`${group.key}-type-chip-${type}`"
            @click="group.g.typeFilter = type"
          >
            {{ exceptionTypeLabel(type) }}
            <span class="type-chip__count">{{ count }}</span>
          </button>
        </div>

        <el-empty
          v-if="group.g.totalCount === 0"
          description="本批次沒有待處理事項 ✓"
        />
        <div v-else-if="group.g.filteredItems.length === 0" class="no-match-hint">
          此分類目前無項目
        </div>
        <div v-else class="exception-list">
          <div
            v-for="item in group.g.filteredItems"
            :key="`${item.entity_type}-${item.entity_id}-${item.type}`"
            class="exception-row"
            :class="`exception-row--${item.severity}`"
          >
            <el-tag :type="SEVERITY_TAG_TYPE[item.severity]" size="small" class="severity-tag">
              {{ SEVERITY_LABEL[item.severity] }}
            </el-tag>
            <div class="exception-row__body">
              <div class="exception-row__title">
                <strong>{{ item.target_name }}</strong>
                <span class="exception-row__type">{{ exceptionTypeLabel(item.type) }}</span>
              </div>
              <div class="exception-row__reason">{{ item.reason }}</div>
              <div class="exception-row__impact">影響：{{ item.impact }}</div>
              <div class="exception-row__action">建議：{{ item.suggested_action }}</div>
            </div>
            <router-link :to="item.deep_link" class="exception-row__cta">前往處理 →</router-link>
          </div>
        </div>
      </template>

      <div v-else class="loading-placeholder" aria-busy="true">
        <el-skeleton :rows="3" animated />
      </div>
    </section>
  </div>
</template>

<style scoped>
.exception-center { padding: var(--space-4); }
.page-header { margin-bottom: var(--space-4); }
.page-header h2 { margin: 0 0 var(--space-1); font-size: 20px; font-weight: 600; }
.page-sub { margin: 0; font-size: 13px; color: var(--text-tertiary); }

.exception-group {
  background: var(--bg-color-overlay, #fff);
  border: 1px solid var(--border-color);
  border-radius: 8px;
  padding: var(--space-4);
  margin-bottom: var(--space-4);
}
.group-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: var(--space-2);
  margin-bottom: var(--space-3);
}
.group-title { font-size: 16px; font-weight: 600; }
.group-header-actions { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.generated-at { font-size: 12px; color: var(--text-tertiary); }

.type-chips { display: flex; gap: var(--space-2); flex-wrap: wrap; margin-bottom: var(--space-3); }
.type-chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: var(--space-1) var(--space-3);
  border-radius: 999px;
  border: 1px solid var(--border-color);
  background: transparent;
  font-size: 13px;
  cursor: pointer;
  color: var(--text-secondary);
}
.type-chip--active {
  border-color: var(--el-color-primary);
  color: var(--el-color-primary);
  background: var(--el-color-primary-light-9);
}
.type-chip__count { font-weight: 600; }

.no-match-hint { color: var(--text-tertiary); font-size: 13px; padding: var(--space-6) 0; text-align: center; }

.exception-list { display: flex; flex-direction: column; gap: var(--space-2); }
.exception-row {
  display: flex;
  align-items: flex-start;
  gap: var(--space-3);
  padding: var(--space-3);
  border-radius: 6px;
  border: 1px solid var(--border-color);
}
.exception-row--blocking { border-left: 3px solid var(--color-danger, #f56c6c); }
.exception-row--warning { border-left: 3px solid var(--color-warning, #e6a23c); }
.exception-row--info { border-left: 3px solid var(--color-info, #909399); }
.severity-tag { margin-top: 2px; flex-shrink: 0; }
.exception-row__body { flex: 1; min-width: 0; }
.exception-row__title { display: flex; align-items: baseline; gap: var(--space-2); margin-bottom: var(--space-1); }
.exception-row__type { font-size: 12px; color: var(--text-tertiary); }
.exception-row__reason { font-size: 13px; color: var(--text-primary); margin-bottom: 2px; }
.exception-row__impact,
.exception-row__action { font-size: 12px; color: var(--text-secondary); }
.exception-row__cta {
  flex-shrink: 0;
  font-size: 13px;
  font-weight: 600;
  color: var(--el-color-primary);
  white-space: nowrap;
  text-decoration: none;
}
</style>
