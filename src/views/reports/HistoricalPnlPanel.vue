<script setup lang="ts">
import { computed, onBeforeUnmount, ref, shallowRef, watch } from 'vue'
import {
  getHistoricalPnl, importHistoricalPnl, previewHistoricalPnl,
  type HistoricalPnlImport, type HistoricalPnlPreview, type HistoricalPnlYear,
} from '@/api/historicalPnl'
import { hasPermission } from '@/utils/auth'
import { onAdminSessionReset } from '@/utils/adminSession'
import { HISTORICAL_PNL_FORMAT_ERROR, MAX_HISTORICAL_PNL_BYTES, parseHistoricalPnlImport } from './historicalPnlImport'

const props = defineProps<{ year: number }>()
const report = shallowRef<HistoricalPnlYear | null>(null)
const loading = ref(false)
const loadError = ref('')
const fileInput = ref<HTMLInputElement | null>(null)
const selected = shallowRef<HistoricalPnlImport | null>(null)
const preview = shallowRef<HistoricalPnlPreview | null>(null)
const preparing = ref(false)
const previewing = ref(false)
const importing = ref(false)
const importError = ref('')
const importResult = ref('')
let loadRevision = 0
let importRevision = 0

const canImport = computed(() =>
  hasPermission('REPORTS') && hasPermission('FEES_WRITE') && hasPermission('VENDOR_PAYMENT_WRITE'))
const canConfirm = computed(() => canImport.value && selected.value && preview.value?.can_import
  && preview.value.conflict_count === 0 && !preparing.value && !previewing.value && !importing.value)
const months = computed(() => [...(report.value?.months ?? [])].sort((a, b) => a.month - b.month))
const formatter = new Intl.NumberFormat('zh-TW', { maximumFractionDigits: 2 })
function money(value: string | number | null): string {
  return value === null ? '未填' : formatter.format(Number(value))
}
const flagLabels = {
  estimate: '推估', amortized: '攤提', full_nhi_amount: '健保全額', fixed_contribution_filled: '固定提撥補值',
} as const
const sectionLabels = { income: '收入', expense: '支出', profit: '損益', personnel_breakdown: '人事拆分' } as const
const statusLabels = { new: '新增', unchanged: '不變', conflict: '衝突' } as const

function resetImport() {
  importRevision++
  selected.value = null
  preview.value = null
  preparing.value = false
  previewing.value = false
  importing.value = false
  importError.value = ''
  importResult.value = ''
  if (fileInput.value) fileInput.value.value = ''
}
async function load() {
  const revision = ++loadRevision
  loading.value = true
  loadError.value = ''
  report.value = null
  try {
    const result = await getHistoricalPnl(props.year)
    if (revision === loadRevision) report.value = result.data
  } catch {
    if (revision === loadRevision) loadError.value = '歷史損益參考載入失敗，請重新載入。'
  } finally {
    if (revision === loadRevision) loading.value = false
  }
}

watch(() => props.year, () => {
  resetImport()
  void load()
}, { immediate: true })
const stopSessionReset = onAdminSessionReset(() => {
  loadRevision++
  report.value = null
  loading.value = false
  loadError.value = ''
  resetImport()
})
onBeforeUnmount(() => {
  loadRevision++
  importRevision++
  stopSessionReset()
})

async function selectFile(event: Event) {
  if (importing.value || !canImport.value) return
  const file = (event.target as HTMLInputElement).files?.[0]
  resetImport()
  if (!file) return
  if (file.size > MAX_HISTORICAL_PNL_BYTES) {
    importError.value = '檔案不可超過 1 MiB。'
    return
  }
  const revision = importRevision
  const year = props.year
  preparing.value = true
  try {
    const content = await file.text()
    if (revision !== importRevision) return
    selected.value = parseHistoricalPnlImport(content, year)
  } catch {
    if (revision === importRevision) importError.value = HISTORICAL_PNL_FORMAT_ERROR
  } finally {
    if (revision === importRevision) preparing.value = false
  }
}
function importFailure(error: unknown): string {
  const status = (error as { response?: { status?: number } } | null)?.response?.status
  if (status === 403) return '需要報表、學費寫入與廠商付款寫入權限，請洽管理員。'
  if (status === 409) return '資料已變更或有衝突，請重新預覽；本次不覆寫原有資料。'
  if (status === 422) return '檔案驗證未通過，請核對月份、科目合計與來源欄位。'
  return '操作未完成，請重新預覽確認資料狀態。'
}
async function runPreview() {
  if (!canImport.value || !selected.value || preparing.value || previewing.value || importing.value) return
  const revision = importRevision
  const payload = selected.value
  preview.value = null
  previewing.value = true
  importError.value = ''
  importResult.value = ''
  try {
    const result = await previewHistoricalPnl(payload)
    if (revision === importRevision) preview.value = result.data
  } catch (error) {
    if (revision === importRevision) importError.value = importFailure(error)
  } finally {
    if (revision === importRevision) previewing.value = false
  }
}
async function confirmImport() {
  if (!canConfirm.value || !selected.value) return
  const revision = importRevision
  const payload = selected.value
  importing.value = true
  importError.value = ''
  try {
    const result = await importHistoricalPnl(payload)
    if (revision !== importRevision) return
    importResult.value = `匯入完成：新增 ${result.data.created_months.length} 個月，原有資料不變 ${result.data.unchanged_months.length} 個月。`
    selected.value = null
    preview.value = null
    if (fileInput.value) fileInput.value.value = ''
    await load()
  } catch (error) {
    if (revision === importRevision) {
      importError.value = importFailure(error)
      // 網路中斷也可能已完成寫入；重試前必須再次向伺服器預覽。
      preview.value = null
    }
  } finally {
    if (revision === importRevision) importing.value = false
  }
}
</script>

<template>
  <section class="historical-pnl" aria-labelledby="historical-pnl-title">
    <header class="historical-pnl__header">
      <h3 id="historical-pnl-title">歷史損益參考</h3>
      <span>{{ year }} 年<span v-if="report && months.length"> · 已匯入 {{ months.length }} 個月</span></span>
    </header>
    <p class="historical-pnl__notice">原表可能含推估或攤提，現金實收實付尚未核對；以下數字僅供歷史參考，不計入現金收付報表。</p>

    <el-skeleton v-if="loading" :rows="3" animated />
    <div v-else-if="loadError" class="historical-pnl__message" role="alert">
      {{ loadError }}
      <el-button data-test="historical-retry" size="small" @click="load">重新載入</el-button>
    </div>
    <p v-else-if="report && !months.length" class="historical-pnl__empty">{{ year }} 年尚未匯入歷史損益參考。</p>
    <template v-else-if="report">
      <div class="historical-pnl__scroll" role="region" aria-label="歷史損益月份彙總" tabindex="0">
        <table class="historical-pnl__table">
          <caption class="sr-only">僅列已匯入月份，金額單位為新臺幣元</caption>
          <thead><tr><th scope="col">月份</th><th scope="col">收入</th><th scope="col">支出</th><th scope="col">損益</th></tr></thead>
          <tbody>
            <tr v-for="month in months" :key="month.month" data-test="historical-month">
              <th scope="row">{{ month.month }} 月</th><td>{{ money(month.revenue) }}</td><td>{{ money(month.expense) }}</td><td>{{ money(month.profit) }}</td>
            </tr>
          </tbody>
          <tfoot><tr data-test="historical-totals"><th scope="row">已匯入月份合計</th><td>{{ money(report.totals.revenue) }}</td><td>{{ money(report.totals.expense) }}</td><td>{{ money(report.totals.profit) }}</td></tr></tfoot>
        </table>
      </div>
      <details v-for="month in months" :key="month.month" class="historical-pnl__details">
        <summary>{{ month.month }} 月科目與來源</summary>
        <p class="historical-pnl__source">來源：{{ month.source_name }}<br>{{ month.basis_note }}</p>
        <div class="historical-pnl__scroll" role="region" :aria-label="`${month.month} 月歷史損益科目`" tabindex="0">
          <table class="historical-pnl__table historical-pnl__table--details">
            <thead><tr><th scope="col">分類</th><th scope="col">科目</th><th scope="col">金額</th><th scope="col">原表標記</th><th scope="col">來源儲存格</th></tr></thead>
            <tbody>
              <tr v-for="row in month.rows" :key="row.key" :data-row-key="row.key" :class="{ 'historical-pnl__total': row.role === 'total' }">
                <td>{{ sectionLabels[row.section] }}</td>
                <th scope="row" :class="{ 'historical-pnl__child': row.parent_key }">{{ row.label }}</th>
                <td>{{ money(row.amount) }}</td>
                <td><span v-for="flag in row.inclusive_flags" :key="flag" class="historical-pnl__flag">{{ flagLabels[flag] }}</span><span v-if="!row.inclusive_flags.length">—</span></td>
                <td>{{ row.source_cell }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </details>
    </template>

    <details v-if="canImport" class="historical-pnl__import" data-test="historical-import">
      <summary>匯入歷史損益參考</summary>
      <p class="historical-pnl__source">請選擇已整理且去除個人資料的損益 JSON（上限 1 MiB），先預覽，再確認匯入。</p>
      <label class="historical-pnl__file">選擇損益 JSON
        <input ref="fileInput" type="file" accept=".json,application/json" data-test="historical-file" :disabled="importing" @change="selectFile">
      </label>
      <p v-if="preparing" role="status">正在讀取檔案…</p>
      <p v-if="selected" class="historical-pnl__source">{{ selected.source_name }} · {{ selected.year }} 年 · {{ selected.months.length }} 個月<br>{{ selected.basis_note }}</p>
      <el-button data-test="historical-preview-button" :disabled="!selected || preparing || importing" :loading="previewing" @click="runPreview">預覽匯入</el-button>
      <p v-if="importError" class="historical-pnl__error" role="alert">{{ importError }}</p>
      <p v-if="importResult" class="historical-pnl__success" role="status">{{ importResult }}</p>
      <div v-if="preview" class="historical-pnl__preview">
        <p>新增 {{ preview.insert_count }} 個月 · 不變 {{ preview.replay_count }} 個月 · 衝突 {{ preview.conflict_count }} 個月</p>
        <p v-if="!preview.can_import || preview.conflict_count" class="historical-pnl__error">有衝突的資料不可匯入，請先核對來源；原有月份不會被覆寫。</p>
        <div class="historical-pnl__scroll" role="region" aria-label="歷史損益匯入預覽" tabindex="0">
          <table class="historical-pnl__table">
            <thead><tr><th scope="col">月份</th><th scope="col">收入</th><th scope="col">支出</th><th scope="col">損益</th><th scope="col">狀態</th></tr></thead>
            <tbody><tr v-for="month in preview.months" :key="month.month"><th scope="row">{{ month.month }} 月</th><td>{{ money(month.revenue) }}</td><td>{{ money(month.expense) }}</td><td>{{ money(month.profit) }}</td><td>{{ statusLabels[month.status] }}</td></tr></tbody>
            <tfoot><tr><th scope="row">本次來源合計</th><td>{{ money(preview.totals.revenue) }}</td><td>{{ money(preview.totals.expense) }}</td><td>{{ money(preview.totals.profit) }}</td><td /></tr></tfoot>
          </table>
        </div>
        <el-button type="primary" data-test="historical-confirm" :disabled="!canConfirm" :loading="importing" @click="confirmImport">確認匯入歷史參考</el-button>
      </div>
    </details>
  </section>
</template>

<style scoped>
.historical-pnl { margin-bottom: var(--space-4); padding: var(--space-4); border: 1px solid var(--el-border-color-lighter); border-radius: var(--radius-md); background: var(--surface-color); color: var(--text-primary); }
.historical-pnl__header { display: flex; flex-wrap: wrap; align-items: baseline; justify-content: space-between; gap: var(--space-2); }
.historical-pnl__header h3 { margin: 0; font-size: var(--text-base); }
.historical-pnl__header span, .historical-pnl__source, .historical-pnl__empty { font-size: var(--text-sm); color: var(--text-secondary); }
.historical-pnl__notice { padding: var(--space-3); background: var(--color-warning-soft); color: var(--color-warning-darker); border-radius: var(--radius-sm); font-size: var(--text-sm); line-height: 1.6; }
.historical-pnl__scroll { overflow-x: auto; }
.historical-pnl__table { width: 100%; border-collapse: collapse; font-size: var(--text-sm); font-variant-numeric: tabular-nums; }
.historical-pnl__table th, .historical-pnl__table td { padding: var(--space-2) var(--space-3); border-bottom: 1px solid var(--el-border-color-lighter); text-align: right; white-space: nowrap; }
.historical-pnl__table th:first-child { text-align: left; }
.historical-pnl__table tfoot { background: var(--color-neutral-50); font-weight: 600; }
.historical-pnl__table--details th, .historical-pnl__table--details td { text-align: left; }
.historical-pnl__table--details td:nth-child(3) { text-align: right; }
.historical-pnl__table .historical-pnl__child { padding-left: var(--space-5); font-weight: 400; }
.historical-pnl__total { background: var(--color-neutral-50); font-weight: 600; }
.historical-pnl__details, .historical-pnl__import { margin-top: var(--space-3); }
.historical-pnl__details summary, .historical-pnl__import summary { cursor: pointer; padding: var(--space-2) 0; font-size: var(--text-sm); font-weight: 600; }
.historical-pnl__flag { display: inline-block; padding: 0 var(--space-1); margin-right: var(--space-1); border-radius: var(--radius-sm); background: var(--color-warning-soft); color: var(--color-warning-darker); font-size: var(--text-xs); }
.historical-pnl__source { line-height: 1.6; overflow-wrap: anywhere; }
.historical-pnl__file { display: flex; flex-wrap: wrap; gap: var(--space-2); margin-bottom: var(--space-3); font-size: var(--text-sm); }
.historical-pnl__file input { max-width: 100%; }
.historical-pnl__error { color: var(--color-danger); font-size: var(--text-sm); }
.historical-pnl__success { color: var(--color-success-darker, var(--color-success)); font-size: var(--text-sm); }
.historical-pnl__preview { margin-top: var(--space-3); }
.historical-pnl__preview .el-button { margin-top: var(--space-3); }
.historical-pnl__message { display: flex; flex-wrap: wrap; align-items: center; gap: var(--space-2); font-size: var(--text-sm); }
.sr-only { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0, 0, 0, 0); white-space: nowrap; border: 0; }
</style>
