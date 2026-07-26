<template>
  <div class="data-quality-view">
    <header class="header">
      <div class="header__title">
        <h2>資料品質報告</h2>
        <p class="header__hint">
          系統每日自動檢查資料是否互相矛盾（例如已離職的員工仍列為在職）。
          <span v-if="lastRunText" class="header__lastrun">最後檢查：{{ lastRunText }}</span>
        </p>
      </div>

      <div class="header__actions">
        <div class="counters">
          <el-tag
            v-for="s in SEVERITY_FILTER_OPTIONS"
            :key="s.value"
            :type="SEVERITY_TAG_TYPES[s.value]"
            data-testid="severity-counter"
          >
            {{ s.label }}：{{ openCount(s.value) }}
          </el-tag>
        </div>
        <el-button
          v-if="canWrite"
          type="primary"
          :loading="running"
          data-testid="run-now"
          @click="onRunNow"
        >
          立即檢查
        </el-button>
      </div>
    </header>

    <div class="filters">
      <el-select
        v-model="filters.status"
        data-testid="status-filter"
        placeholder="狀態"
        clearable
        @change="applyFilters"
      >
        <el-option
          v-for="o in STATUS_FILTER_OPTIONS"
          :key="o.value"
          :label="o.label"
          :value="o.value"
        />
      </el-select>

      <el-select
        v-model="filters.severity"
        data-testid="severity-filter"
        placeholder="嚴重度"
        clearable
        @change="applyFilters"
      >
        <el-option
          v-for="o in SEVERITY_FILTER_OPTIONS"
          :key="o.value"
          :label="o.label"
          :value="o.value"
        />
      </el-select>

      <el-select
        v-model="filters.rule_code"
        data-testid="rule-filter"
        placeholder="規則"
        clearable
        class="filters__rule"
        @change="applyFilters"
      >
        <el-option
          v-for="o in RULE_FILTER_OPTIONS"
          :key="o.value"
          :label="o.label"
          :value="o.value"
        />
      </el-select>
    </div>

    <el-table :data="rows" v-loading="loading" data-testid="report-table">
      <template #empty>
        <div class="empty" data-testid="empty-state">
          <template v-if="loadError">
            <p class="empty__title">載入失敗</p>
            <p class="empty__hint">請稍後再試，或聯繫工程人員。</p>
          </template>
          <template v-else-if="isDefaultFilter">
            <p class="empty__title">目前沒有待處理的資料品質問題</p>
            <p class="empty__hint">
              <span v-if="lastRunText">最後檢查：{{ lastRunText }}</span>
              <span v-else>尚未執行過檢查。</span>
            </p>
          </template>
          <template v-else>
            <p class="empty__title">找不到符合條件的紀錄</p>
            <p class="empty__hint">試著放寬上方的篩選條件。</p>
          </template>
        </div>
      </template>

      <el-table-column label="偵測時間" width="170">
        <template #default="{ row }">{{ formatDateTimeTW(row.detected_at) }}</template>
      </el-table-column>

      <el-table-column label="嚴重度" width="90">
        <template #default="{ row }">
          <el-tag :type="SEVERITY_TAG_TYPES[row.severity]" size="small">
            {{ row.severity }} {{ SEVERITY_LABELS[row.severity] ?? '' }}
          </el-tag>
        </template>
      </el-table-column>

      <el-table-column label="問題" min-width="220">
        <template #default="{ row }">
          <RuleExplainPopover :rule-code="row.rule_code" />
        </template>
      </el-table-column>

      <el-table-column label="對象" width="160">
        <template #default="{ row }">
          <router-link
            v-if="entityRoute(row)"
            :to="entityRoute(row)!"
            class="entity-link"
          >
            {{ getEntityMeta(row.entity_type).label }} #{{ row.entity_id }}
          </router-link>
          <span v-else>
            {{ getEntityMeta(row.entity_type).label }} #{{ row.entity_id }}
          </span>
        </template>
      </el-table-column>

      <el-table-column label="偵測訊息" prop="summary" min-width="240" />

      <el-table-column label="狀態" width="100">
        <template #default="{ row }">
          <el-tag :type="STATUS_TAG_TYPES[row.status]" size="small" effect="plain">
            {{ STATUS_LABELS[row.status] ?? row.status }}
          </el-tag>
        </template>
      </el-table-column>

      <el-table-column v-if="canWrite" label="操作" width="260">
        <template #default="{ row }">
          <el-button v-if="row.status === 'open'" size="small" @click="onAck(row)">
            確認
          </el-button>
          <el-button
            v-if="row.status !== 'fixed'"
            size="small"
            type="success"
            @click="onResolve(row)"
          >
            標記已修正
          </el-button>
          <el-button
            v-if="row.status === 'open'"
            size="small"
            type="info"
            @click="onIgnore(row)"
          >
            忽略
          </el-button>
        </template>
      </el-table-column>
    </el-table>

    <el-pagination
      v-model:current-page="filters.page"
      v-model:page-size="filters.page_size"
      :total="total"
      :page-sizes="[20, 50, 100]"
      layout="total, sizes, prev, pager, next"
      @current-change="changePage"
      @size-change="changePageSize"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'

import type { DataQualityReportRow } from '@/api/dataQuality'
import RuleExplainPopover from '@/components/dataQuality/RuleExplainPopover.vue'
import { useDataQualityReports } from '@/composables/useDataQualityReports'
import {
  RULE_FILTER_OPTIONS,
  SEVERITY_FILTER_OPTIONS,
  SEVERITY_LABELS,
  SEVERITY_TAG_TYPES,
  STATUS_FILTER_OPTIONS,
  STATUS_LABELS,
  STATUS_TAG_TYPES,
  getEntityMeta,
} from '@/constants/dataQualityRules'
import { hasPermission } from '@/utils/auth'
import { formatDateTimeTW } from '@/utils/format'

const {
  filters,
  rows,
  total,
  summary,
  loading,
  running,
  loadError,
  init,
  applyFilters,
  changePage,
  changePageSize,
  acknowledge,
  resolve,
  ignore,
  triggerRunNow,
} = useDataQualityReports()

const canWrite = computed(() => hasPermission('DATA_QUALITY_WRITE'))

/** 統計來自獨立端點，未載入時顯示「—」而非誤導性的 0。 */
function openCount(severity: string): number | string {
  return summary.value?.open_by_severity?.[severity] ?? '—'
}

const lastRunText = computed(() => summary.value?.last_run_at ?? '')

/** 空表格的文案要分辨「真的沒問題」與「篩選篩掉了」。 */
const isDefaultFilter = computed(
  () => filters.status === 'open' && !filters.severity && !filters.rule_code,
)

function entityRoute(row: DataQualityReportRow): string | null {
  const meta = getEntityMeta(row.entity_type)
  return meta.toRoute ? meta.toRoute(row.entity_id) : null
}

/** 取消輸入回 null（與空字串區分：空字串是「確實沒填備註」）。 */
async function promptNote(title: string): Promise<string | null> {
  try {
    const res = await ElMessageBox.prompt(title, '備註', {
      confirmButtonText: '確定',
      cancelButtonText: '取消',
    })
    return (res as { value?: string }).value ?? ''
  } catch {
    return null
  }
}

async function onAck(row: DataQualityReportRow) {
  const note = await promptNote('確認已知悉這筆問題（備註選填）')
  if (note === null) return
  if (await acknowledge(row.id, note)) ElMessage.success('已標記為確認')
}

async function onResolve(row: DataQualityReportRow) {
  const note = await promptNote('請說明如何修正的（必填）')
  if (!note) return
  if (await resolve(row.id, note)) ElMessage.success('已標記為修正')
}

async function onIgnore(row: DataQualityReportRow) {
  const note = await promptNote('請說明忽略原因（必填）')
  if (!note) return
  if (await ignore(row.id, note)) ElMessage.success('已標記為忽略')
}

async function onRunNow() {
  const result = await triggerRunNow()
  if (!result) return
  ElMessage.success(
    `檢查完成：共偵測 ${result.detected ?? 0} 筆，其中 ${result.new_open ?? 0} 筆是新出現的`,
  )
}

onMounted(init)
</script>

<style scoped>
.data-quality-view {
  padding: 16px;
}
.header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 16px;
  flex-wrap: wrap;
}
.header__title h2 {
  margin: 0 0 4px;
}
.header__hint {
  margin: 0;
  font-size: 13px;
  color: var(--el-text-color-secondary);
}
.header__lastrun {
  margin-left: 8px;
}
.header__actions {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}
.counters {
  display: flex;
  gap: 8px;
}
.filters {
  display: flex;
  gap: 8px;
  margin-bottom: 12px;
  flex-wrap: wrap;
}
.filters__rule {
  min-width: 240px;
}
.entity-link {
  color: var(--el-color-primary);
  text-decoration: none;
}
.entity-link:hover {
  text-decoration: underline;
}
.empty {
  padding: 24px 0;
}
.empty__title {
  margin: 0 0 4px;
  font-size: 15px;
  color: var(--el-text-color-primary);
}
.empty__hint {
  margin: 0;
  font-size: 13px;
  color: var(--el-text-color-secondary);
}
</style>
