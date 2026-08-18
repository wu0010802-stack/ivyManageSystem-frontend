<script setup lang="ts">
/**
 * 總部「政府資料同步」：勞健保級距表與費率的版本查核與年度匯入。
 *
 * 這兩張是 GLOBAL 表（無 tenant_id、無 RLS policy），一改對**全平台所有租戶**
 * 生效，並把該年度所有未封存薪資標為需重算——所以匯入一律走
 * 「貼上 → 預覽逐列 diff → 填原因 → 二次確認」，不提供一鍵覆蓋。
 *
 * 讀取走 `/platform/gov-data`（總部專屬讀取面）；寫入走既有的
 * `PUT /insurance/brackets`——後者本就是 platform-only，且已內建 reason 驗證、
 * 封存月二次確認與跨租戶 stale 標記，不在此另造一份。
 */
import { ref, computed, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import PageHeader from '@/components/common/PageHeader.vue'
import { friendlyError } from '@/utils/errorMessages'
import { getGovData, previewGovBrackets, updateInsuranceBrackets } from '@/api/platform'
import type { Schema } from '@/api/_generated/typed'

type GovData = Schema<'GovDataOut'>
type BracketRow = Schema<'BracketRowOut'>
type BracketDiff = Schema<'BracketDiffOut'>
type DiffRow = Schema<'BracketDiffRowOut'>
type DiffStatus = 'added' | 'changed' | 'removed' | 'unchanged'
type TagType = 'primary' | 'success' | 'warning' | 'danger' | 'info'

/** 從 axios error 取 HTTP status，取不到回 null。 */
const statusOf = (e: unknown): number | null => {
  const status = (e as { response?: { status?: unknown } })?.response?.status
  return typeof status === 'number' ? status : null
}

/** 從 axios error 取後端 detail（帶行號的解析錯誤訊息），取不到回 null。 */
const detailOf = (e: unknown): string | null => {
  const detail = (e as { response?: { data?: { detail?: unknown } } })?.response?.data?.detail
  return typeof detail === 'string' ? detail : null
}

const loading = ref(false)
const data = ref<GovData | null>(null)
const year = ref<number>(new Date().getFullYear())

const runtime = computed(() => data.value?.runtime ?? null)
const fromDb = computed(() => runtime.value?.brackets_source === 'db')
const brackets = computed<BracketRow[]>(() => data.value?.brackets?.rows ?? [])
const effectiveYear = computed<number | null>(() => data.value?.brackets?.effective_year ?? null)
const rates = computed(() => data.value?.rates ?? null)
const builtinDiff = computed(() => data.value?.builtin_consistency?.summary ?? null)

const YEAR_OPTIONS = computed(() => {
  const current = new Date().getFullYear()
  // 錨定今年 ±2：級距一年一版，看太遠的年度沒有業務意義
  return [current + 1, current, current - 1, current - 2]
})

const fetchData = async () => {
  loading.value = true
  try {
    const res = await getGovData({ year: year.value })
    data.value = res.data
  } catch (e) {
    ElMessage.error(friendlyError('載入政府資料失敗', e))
  } finally {
    loading.value = false
  }
}

// ── 匯入流程 ───────────────────────────────────────────────────────────────

const importVisible = ref(false)
const importYear = ref<number>(new Date().getFullYear() + 1)
const importContent = ref('')
const importReason = ref('')
const importError = ref('')
const previewResult = ref<BracketDiff | null>(null)
const parsedRows = ref<BracketRow[]>([])
const previewing = ref(false)
const submitting = ref(false)

/** 後端硬性要求 reason ≥10 字；前端先擋，免得使用者填完整張表才被退。 */
const REASON_MIN = 10
const canSubmit = computed(
  () => !!previewResult.value && importReason.value.trim().length >= REASON_MIN,
)

const openImport = () => {
  importVisible.value = true
  importContent.value = ''
  importReason.value = ''
  importError.value = ''
  previewResult.value = null
  parsedRows.value = []
}

const runPreview = async () => {
  previewing.value = true
  importError.value = ''
  previewResult.value = null
  try {
    const res = await previewGovBrackets({
      effective_year: importYear.value,
      content: importContent.value,
    })
    const diff = res.data.diff
    previewResult.value = diff
    // 送出時直接用 preview 解析過的列，避免前端再解析一次而與後端規則分叉
    parsedRows.value = (diff.rows ?? [])
      .map(r => r.incoming)
      .filter((row): row is BracketRow => !!row)
  } catch (e: unknown) {
    // 後端訊息帶行號（「第 3 行有 5 欄」），照實顯示才有定位價值
    importError.value = detailOf(e) || friendlyError('解析失敗', e)
  } finally {
    previewing.value = false
  }
}

const summaryText = computed(() => {
  const s = previewResult.value?.summary
  if (!s) return ''
  return `新增 ${s.added}、變更 ${s.changed}、刪除 ${s.removed}、未變 ${s.unchanged}`
})

const submitImport = async () => {
  if (!canSubmit.value) {
    ElMessage.warning(`請填寫變更原因（至少 ${REASON_MIN} 字）`)
    return
  }
  try {
    await ElMessageBox.confirm(
      `即將寫入 ${importYear.value} 年度級距表（${summaryText.value}）。\n` +
        '此變更對全平台所有分校生效，並會把該年度所有未封存薪資標為需重算。',
      '確認匯入級距表',
      { type: 'warning', confirmButtonText: '確認寫入', cancelButtonText: '取消' },
    )
  } catch {
    return // 使用者取消
  }

  submitting.value = true
  try {
    await writeBrackets(false)
  } catch (e: unknown) {
    // 該年度已有封存月份 → 後端 409 要求二次審批（資安掃描 2026-05-07 P2）。
    // 封存月不會被重算，但同年中途改級距會讓半年／年度報表跨段用到不同級距值，
    // 必須讓操作者看到「影響幾個月」再決定，不可自動帶 acknowledge 繞過。
    if (statusOf(e) === 409) {
      try {
        await ElMessageBox.confirm(detailOf(e) || '該年度已有封存月份，是否仍要寫入？', '需要二次確認', {
          type: 'warning',
          confirmButtonText: '我了解影響，仍要寫入',
          cancelButtonText: '取消',
        })
      } catch {
        submitting.value = false
        return
      }
      try {
        await writeBrackets(true)
      } catch (retryError) {
        ElMessage.error(friendlyError('寫入級距表失敗', retryError))
      }
    } else {
      ElMessage.error(friendlyError('寫入級距表失敗', e))
    }
  } finally {
    submitting.value = false
  }
}

/** 實際寫入；`acknowledgeFinalized` 為封存月二次審批旗標。 */
const writeBrackets = async (acknowledgeFinalized: boolean) => {
  const res = await updateInsuranceBrackets({
    effective_year: importYear.value,
    brackets: parsedRows.value,
    replace_existing: true,
    reason: importReason.value.trim(),
    acknowledge_finalized_months: acknowledgeFinalized,
  })
  const body = res.data as { upserted?: number; stale_marked?: number }
  ElMessage.success(
    `已寫入 ${body.upserted ?? 0} 列；標記需重算 ${body.stale_marked ?? 0} 筆薪資紀錄`,
  )
  importVisible.value = false
  year.value = importYear.value
  await fetchData()
}

/** 費率百分比顯示；DB 欄位可為 NULL（沿用程式預設）時顯示破折號而非 NaN%。 */
const pct = (value: number | null | undefined, digits = 2) =>
  typeof value === 'number' ? `${(value * 100).toFixed(digits)}%` : '—'

const DIFF_STATUS_LABEL: Record<DiffStatus, string> = {
  added: '新增',
  changed: '變更',
  removed: '刪除',
  unchanged: '未變',
}
const DIFF_STATUS_TAG: Record<DiffStatus, TagType> = {
  added: 'success',
  changed: 'warning',
  removed: 'danger',
  unchanged: 'info',
}

/** el-table row-class-name：diff 狀態上色。必須是具名函式——template 屬性內的
 *  inline arrow 加型別註記 vue-tsc 解析不了（TS1005）。 */
const diffRowClass = ({ row }: { row: DiffRow }) => `diff-row--${row.status}`

const statusLabel = (row: DiffRow) => DIFF_STATUS_LABEL[row.status as DiffStatus] ?? row.status
const statusTag = (row: DiffRow): TagType => DIFF_STATUS_TAG[row.status as DiffStatus] ?? 'info'

const changedFieldsText = (row: DiffRow) =>
  Object.entries(row.changed_fields || {})
    .map(([field, v]) => `${field} ${v.from} → ${v.to}`)
    .join('、')

onMounted(fetchData)
</script>

<template>
  <div v-loading="loading" class="gov-data">
    <PageHeader title="政府資料同步" subtitle="勞健保級距表與費率的版本查核與年度匯入">
      <template #actions>
        <el-button data-testid="gov-data-refresh" @click="fetchData">重新整理</el-button>
        <el-button type="primary" data-testid="import-open" @click="openImport">
          匯入級距表
        </el-button>
      </template>
    </PageHeader>

    <el-alert
      type="warning"
      :closable="false"
      class="gov-data__alert"
      title="級距表與費率是全平台共用的法定資料"
    >
      <template #default>
        這兩張表沒有分校之分，一次變更對**所有分校**生效，並會把該年度所有未封存薪資標為需重算。
        資料來源為勞保局、健保署與勞動部的年度公告。
      </template>
    </el-alert>

    <!-- 實算生效版本 -->
    <el-card v-if="runtime" class="gov-data__card">
      <template #header><strong>目前實算生效的版本</strong></template>
      <el-descriptions :column="3" border size="small">
        <el-descriptions-item label="生效年度">{{ runtime.brackets_year }} 年</el-descriptions-item>
        <el-descriptions-item label="級距列數">{{ runtime.bracket_count }} 列</el-descriptions-item>
        <el-descriptions-item label="資料來源">
          <el-tag
            :type="fromDb ? 'success' : 'danger'"
            size="small"
            data-testid="bracket-source"
          >
            {{ fromDb ? 'DB（insurance_brackets）' : '程式內建 fallback' }}
          </el-tag>
        </el-descriptions-item>
      </el-descriptions>

      <el-alert
        v-if="!fromDb"
        type="error"
        :closable="false"
        class="gov-data__alert"
        title="資料庫無級距資料，全平台保費正以程式內建表計算"
      >
        <template #default>
          這通常表示全新部署或災難復原漏了 seed。請盡快匯入正確年度的級距表；
          在此之前所有分校的保費都以內建的 {{ runtime.brackets_year }} 年度表計算。
        </template>
      </el-alert>

      <el-alert
        v-else-if="builtinDiff && (builtinDiff.changed || builtinDiff.added || builtinDiff.removed)"
        type="info"
        :closable="false"
        class="gov-data__alert"
        title="資料庫級距與程式內建表有差異"
      >
        <template #default>
          新增 {{ builtinDiff.added }}、變更 {{ builtinDiff.changed }}、刪除 {{ builtinDiff.removed }} 列。
          換過新年度後本來就會不同；若年度未換卻出現差異，請核對是否有非預期的手動改動。
        </template>
      </el-alert>
    </el-card>

    <!-- 級距表 -->
    <el-card class="gov-data__card">
      <template #header>
        <div class="gov-data__card-header">
          <strong>級距表</strong>
          <el-select v-model="year" size="small" class="gov-data__year" @change="fetchData">
            <el-option v-for="y in YEAR_OPTIONS" :key="y" :label="`${y} 年`" :value="y" />
          </el-select>
        </div>
      </template>

      <el-alert
        v-if="effectiveYear !== null && effectiveYear !== year"
        type="info"
        :closable="false"
        class="gov-data__alert"
        :title="`${year} 年度尚無資料，以下顯示的是目前生效的 ${effectiveYear} 年度級距`"
      />
      <el-empty v-if="!brackets.length" description="查無級距資料" />
      <el-table v-else :data="brackets" border size="small" max-height="420">
        <el-table-column prop="amount" label="投保金額" width="120" align="right" />
        <el-table-column prop="labor_employee" label="勞保員工" width="110" align="right" />
        <el-table-column prop="labor_employer" label="勞保雇主" width="110" align="right" />
        <el-table-column prop="health_employee" label="健保員工" width="110" align="right" />
        <el-table-column prop="health_employer" label="健保雇主" width="110" align="right" />
        <el-table-column prop="pension" label="勞退提繳" width="110" align="right" />
      </el-table>
    </el-card>

    <!-- 費率 -->
    <el-card v-if="rates" class="gov-data__card">
      <template #header><strong>費率與投保上限（{{ rates.rate_year }} 年度）</strong></template>
      <el-descriptions :column="3" border size="small">
        <el-descriptions-item label="勞保＋就保費率">{{ pct(rates.labor_rate) }}</el-descriptions-item>
        <el-descriptions-item label="勞保負擔（員工／雇主）">
          {{ pct(rates.labor_employee_ratio, 0) }} ／ {{ pct(rates.labor_employer_ratio, 0) }}
        </el-descriptions-item>
        <el-descriptions-item label="健保費率">{{ pct(rates.health_rate) }}</el-descriptions-item>
        <el-descriptions-item label="健保負擔（員工／雇主）">
          {{ pct(rates.health_employee_ratio, 0) }} ／ {{ pct(rates.health_employer_ratio, 0) }}
        </el-descriptions-item>
        <el-descriptions-item label="勞退雇主提繳率">{{ pct(rates.pension_employer_rate, 0) }}</el-descriptions-item>
        <el-descriptions-item label="平均眷口數">{{ rates.average_dependents ?? '—' }}</el-descriptions-item>
        <el-descriptions-item label="勞保投保上限">{{ rates.labor_max_insured ?? '沿用程式預設' }}</el-descriptions-item>
        <el-descriptions-item label="健保投保上限">{{ rates.health_max_insured ?? '沿用程式預設' }}</el-descriptions-item>
        <el-descriptions-item label="勞退提繳上限">{{ rates.pension_max_insured ?? '沿用程式預設' }}</el-descriptions-item>
      </el-descriptions>
    </el-card>

    <!-- 匯入對話框 -->
    <el-dialog v-model="importVisible" title="匯入級距表" width="900px">
      <el-alert
        type="info"
        :closable="false"
        class="gov-data__alert"
        title="從勞保局／健保署下載後，把六欄資料貼進來"
      >
        <template #default>
          欄位順序：投保金額、勞保員工、勞保雇主、健保員工、健保雇主、勞退提繳。
          可直接貼上網頁表格（tab 分隔）或 CSV，容許千分位與標頭列。
        </template>
      </el-alert>

      <div class="gov-data__field">
        <span class="gov-data__label">適用年度</span>
        <el-select v-model="importYear" size="small" class="gov-data__year">
          <el-option v-for="y in YEAR_OPTIONS" :key="y" :label="`${y} 年`" :value="y" />
        </el-select>
      </div>

      <el-input
        v-model="importContent"
        type="textarea"
        :rows="8"
        data-testid="import-content"
        placeholder="30300,758,2651,470,1466,1818"
      />

      <div class="gov-data__actions">
        <el-button
          :loading="previewing"
          :disabled="!importContent.trim()"
          data-testid="import-preview"
          @click="runPreview"
        >
          預覽差異
        </el-button>
      </div>

      <el-alert
        v-if="importError"
        type="error"
        :closable="false"
        class="gov-data__alert"
        data-testid="import-error"
        :title="importError"
      />

      <template v-if="previewResult">
        <p class="gov-data__summary">{{ summaryText }}</p>
        <el-table
          :data="previewResult.rows ?? []"
          border
          size="small"
          max-height="320"
          :row-class-name="diffRowClass"
        >
          <el-table-column prop="amount" label="投保金額" width="120" align="right" />
          <el-table-column label="狀態" width="90">
            <template #default="{ row }: { row: DiffRow }">
              <el-tag size="small" :type="statusTag(row)">
                {{ statusLabel(row) }}
              </el-tag>
            </template>
          </el-table-column>
          <el-table-column label="變更內容" min-width="260">
            <template #default="{ row }: { row: DiffRow }">{{ changedFieldsText(row) || '—' }}</template>
          </el-table-column>
        </el-table>

        <div class="gov-data__field">
          <span class="gov-data__label">變更原因</span>
          <el-input
            v-model="importReason"
            data-testid="import-reason"
            :placeholder="`至少 ${REASON_MIN} 字，會寫入稽核紀錄（例：115 年度政府公告級距表更新）`"
          />
        </div>
      </template>

      <template #footer>
        <el-button @click="importVisible = false">取消</el-button>
        <el-button
          type="primary"
          :loading="submitting"
          :disabled="!canSubmit"
          data-testid="import-submit"
          @click="submitImport"
        >
          確認寫入
        </el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.gov-data__card { margin-bottom: 16px; }
.gov-data__alert { margin: 12px 0; }
.gov-data__card-header { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.gov-data__year { width: 120px; }
.gov-data__field { display: flex; align-items: center; gap: 12px; margin: 12px 0; }
.gov-data__label { flex: 0 0 auto; color: var(--el-text-color-regular); }
.gov-data__actions { margin: 12px 0; }
.gov-data__summary { margin: 12px 0 8px; font-weight: 600; }
:deep(.diff-row--added) { background: var(--el-color-success-light-9); }
:deep(.diff-row--changed) { background: var(--el-color-warning-light-9); }
:deep(.diff-row--removed) { background: var(--el-color-danger-light-9); }
</style>
