<template>
  <div class="page-container">
    <PageHeader title="政府申報匯出" subtitle="產生勞保局、健保局、國稅局、勞退提繳等申報格式檔案" />

    <!-- 雇主基本資料 -->
    <el-card class="section-card" shadow="never">
      <template #header><span class="card-title">雇主基本資料</span></template>
      <el-form :model="employer" label-width="120px" inline>
        <el-form-item label="機構名稱">
          <el-input v-model="employer.name" placeholder="例：○○幼兒園" style="width:220px" />
        </el-form-item>
        <el-form-item label="統一編號 / 代碼">
          <el-input v-model="employer.code" placeholder="8 位數統一編號" maxlength="8" style="width:180px" />
        </el-form-item>
      </el-form>
    </el-card>

    <!-- 申報項目 tabs（取代原 4 張 identical-card-grid 反射） -->
    <el-tabs v-model="activeReport" type="card" class="report-tabs">
      <el-tab-pane name="labor">
        <template #label>
          <span class="report-tab-label"><el-icon><Document /></el-icon>勞保投保薪資</span>
        </template>
        <p class="report-desc">每月員工勞保費分攤明細（20% / 70% / 10%）</p>
        <el-form label-width="80px" size="small" class="report-form" inline>
          <el-form-item label="年月">
            <el-date-picker
              v-model="labor.period"
              type="month"
              format="YYYY年MM月"
              value-format="YYYY-MM"
              placeholder="選擇月份"
              style="width:160px"
            />
          </el-form-item>
          <el-form-item label="格式">
            <el-radio-group v-model="labor.fmt">
              <el-radio value="xlsx">Excel</el-radio>
              <el-radio value="txt">TXT</el-radio>
            </el-radio-group>
          </el-form-item>
          <el-form-item>
            <el-button
              type="primary" :loading="loading.labor"
              :disabled="!labor.period"
              @click="download('labor')"
            >下載申報表</el-button>
          </el-form-item>
        </el-form>
      </el-tab-pane>

      <el-tab-pane name="health">
        <template #label>
          <span class="report-tab-label"><el-icon><FirstAidKit /></el-icon>健保名冊</span>
        </template>
        <p class="report-desc">每月員工健保費分攤明細（30% / 60%）及眷屬人數</p>
        <el-form label-width="80px" size="small" class="report-form" inline>
          <el-form-item label="年月">
            <el-date-picker
              v-model="health.period"
              type="month"
              format="YYYY年MM月"
              value-format="YYYY-MM"
              placeholder="選擇月份"
              style="width:160px"
            />
          </el-form-item>
          <el-form-item>
            <el-button
              type="primary" :loading="loading.health"
              :disabled="!health.period"
              @click="download('health')"
            >下載申報表</el-button>
          </el-form-item>
        </el-form>
      </el-tab-pane>

      <el-tab-pane name="withholding">
        <template #label>
          <span class="report-tab-label"><el-icon><Money /></el-icon>扣繳憑單</span>
        </template>
        <p class="report-desc">全年薪資所得總額與估計扣繳稅額（財政部格式）</p>
        <el-form label-width="80px" size="small" class="report-form" inline>
          <el-form-item label="年度">
            <el-date-picker
              v-model="withholding.year"
              type="year"
              format="YYYY年"
              value-format="YYYY"
              placeholder="選擇年度"
              style="width:150px"
            />
          </el-form-item>
          <el-form-item label="扣繳單位">
            <el-input v-model="withholding.employerId" placeholder="預設同上方統一編號" maxlength="8" style="width:180px" />
          </el-form-item>
          <el-form-item>
            <el-button
              type="primary" :loading="loading.withholding"
              :disabled="!withholding.year"
              @click="download('withholding')"
            >下載申報表</el-button>
          </el-form-item>
        </el-form>
      </el-tab-pane>

      <el-tab-pane name="pension">
        <template #label>
          <span class="report-tab-label"><el-icon><Wallet /></el-icon>勞退提繳</span>
        </template>
        <p class="report-desc">每月雇主 6% 提繳與員工自提金額對帳表</p>
        <el-form label-width="80px" size="small" class="report-form" inline>
          <el-form-item label="年月">
            <el-date-picker
              v-model="pension.period"
              type="month"
              format="YYYY年MM月"
              value-format="YYYY-MM"
              placeholder="選擇月份"
              style="width:160px"
            />
          </el-form-item>
          <el-form-item>
            <el-button
              type="primary" :loading="loading.pension"
              :disabled="!pension.period"
              @click="download('pension')"
            >下載申報表</el-button>
          </el-form-item>
        </el-form>
      </el-tab-pane>
    </el-tabs>

    <!-- 注意事項 -->
    <el-alert
      title="注意事項"
      type="warning"
      :closable="false"
      show-icon
      class="notice-alert"
    >
      <template #default>
        <ul class="notice-list">
          <li>扣繳稅額為系統<strong>估算值</strong>，依免稅額 428,000 + 5% 稅率計算，實際申報請依財政部最新規定核算。</li>
          <li>勞保 / 健保投保薪資以員工 <code>insurance_salary_level</code> 欄位為準；若無薪資紀錄，以底薪估算級距。</li>
          <li>正式申報前請逐筆核對員工身分證字號、出生日期等基本資料。</li>
        </ul>
      </template>
    </el-alert>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, watch } from 'vue'
import { ElMessage } from 'element-plus'
import type { AxiosResponse } from 'axios'
import { Document, Money, Wallet } from '@element-plus/icons-vue'
import { getLaborInsurance, getHealthInsurance, getWithholding, getPension } from '@/api/govReports'

// 補 Element Plus 未直接 export 的 icon
import { FirstAidKit } from '@element-plus/icons-vue'
import PageHeader from '@/components/common/PageHeader.vue'

type ReportType = 'labor' | 'health' | 'withholding' | 'pension'

// 雇主基本資料屬「填一次、長期不變」的設定，記在 localStorage 免每次進頁重填
const EMPLOYER_STORAGE_KEY = 'gov-reports.employer'
const TAX_ID_RE = /^\d{8}$/

function _loadEmployer(): { name: string; code: string } {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(EMPLOYER_STORAGE_KEY) ?? '{}')
    if (parsed && typeof parsed === 'object') {
      const p = parsed as Record<string, unknown>
      return {
        name: typeof p.name === 'string' ? p.name : '',
        code: typeof p.code === 'string' ? p.code : '',
      }
    }
  } catch {
    // 壞資料視同未儲存
  }
  return { name: '', code: '' }
}

const employer = reactive(_loadEmployer())

watch(employer, () => {
  localStorage.setItem(EMPLOYER_STORAGE_KEY, JSON.stringify({ name: employer.name, code: employer.code }))
})

// 目前作用中的申報項目（取代原 4 張並排 card 的 identical-grid 視覺）
const activeReport = ref('labor')

// 申報常態：月報表報上個月、扣繳憑單報去年，預設帶好省去每次點選
function _lastMonthPeriod(): string {
  const d = new Date()
  d.setDate(1)
  d.setMonth(d.getMonth() - 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

const labor = reactive<{ period: string | null; fmt: string }>({ period: _lastMonthPeriod(), fmt: 'xlsx' })
const health = reactive<{ period: string | null }>({ period: _lastMonthPeriod() })
const withholding = reactive<{ year: string | null; employerId: string }>({
  year: String(new Date().getFullYear() - 1),
  employerId: '',
})
const pension = reactive<{ period: string | null }>({ period: _lastMonthPeriod() })

const loading = reactive<Record<ReportType, boolean>>({ labor: false, health: false, withholding: false, pension: false })

function _parsePeriod(period: string) {
  const [y, m] = period.split('-')
  return { year: parseInt(y), month: parseInt(m) }
}

function _triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

const _ym = (year: number, month: number) => `${year}${String(month).padStart(2, '0')}`

function _employerParams() {
  return {
    employer_name: employer.name || undefined,
    employer_code: employer.code || undefined,
  }
}

// 各申報項目的請求與檔名組法；period/year 由按鈕 :disabled 保證非空
const REPORT_BUILDERS: Record<ReportType, () => { request: Promise<AxiosResponse<Blob>>; filename: string }> = {
  labor: () => {
    const { year, month } = _parsePeriod(labor.period!)
    const ext = labor.fmt === 'txt' ? 'txt' : 'xlsx'
    return {
      request: getLaborInsurance({ year, month, fmt: labor.fmt, ..._employerParams() }),
      filename: `勞保投保薪資申報_${_ym(year, month)}.${ext}`,
    }
  },
  health: () => {
    const { year, month } = _parsePeriod(health.period!)
    return {
      request: getHealthInsurance({ year, month, ..._employerParams() }),
      filename: `健保被保險人名冊_${_ym(year, month)}.xlsx`,
    }
  },
  withholding: () => ({
    request: getWithholding({
      year: parseInt(withholding.year!),
      employer_name: employer.name || undefined,
      // 扣繳單位未另填時沿用上方統一編號，免重複輸入
      employer_id: withholding.employerId || employer.code || undefined,
    }),
    filename: `扣繳憑單_${withholding.year}.xlsx`,
  }),
  pension: () => {
    const { year, month } = _parsePeriod(pension.period!)
    return {
      request: getPension({ year, month, ..._employerParams() }),
      filename: `勞退提繳明細_${_ym(year, month)}.xlsx`,
    }
  },
}

function _validTaxId(value: string, label: string): boolean {
  if (value && !TAX_ID_RE.test(value)) {
    ElMessage.warning(`${label}需為 8 位數字`)
    return false
  }
  return true
}

// responseType: 'blob' 下後端 4xx 的 JSON detail 也會被包成 Blob，需解開才能給出具體訊息
async function _blobErrorDetail(err: unknown): Promise<string | null> {
  const data = (err as { response?: { data?: unknown } }).response?.data
  if (data instanceof Blob && data.type.includes('application/json')) {
    try {
      const parsed: unknown = JSON.parse(await data.text())
      const detail = (parsed as { detail?: unknown }).detail
      if (typeof detail === 'string') return detail
    } catch {
      // 非 JSON 內容，交給通用訊息
    }
  }
  return null
}

async function download(type: ReportType) {
  if (!_validTaxId(employer.code, '統一編號')) return
  if (type === 'withholding' && !_validTaxId(withholding.employerId, '扣繳單位統編')) return

  loading[type] = true
  try {
    const { request, filename } = REPORT_BUILDERS[type]()
    const res = await request
    _triggerDownload(res.data, filename)
    ElMessage.success('下載成功')
  } catch (err) {
    const status = (err as { response?: { status?: number } }).response?.status
    if (status === 429) {
      ElMessage.warning('匯出過於頻繁，請稍後再試')
    } else {
      ElMessage.error((await _blobErrorDetail(err)) ?? '下載失敗，請稍後再試')
    }
  } finally {
    loading[type] = false
  }
}
</script>

<style scoped>
.page-container {
  padding: 24px;
  max-width: 1400px;
}

.section-card {
  margin-bottom: 20px;
  border-radius: 10px;
}

.card-title {
  font-weight: 600;
  font-size: 15px;
}

/* Phase B：4 張並排 identical-card-grid → el-tabs，與 ReportsView 一致
   tabs 結構，避免 SaaS-cliché 反射；icon 仍隨 tab label 出現傳達語意 */
.report-tabs {
  margin-bottom: 20px;
}
.report-tabs :deep(.el-tabs__item) {
  font-weight: 600;
}
.report-tabs :deep(.el-tabs__content) {
  padding: 8px 0;
}
.report-tab-label {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.report-desc {
  font-size: 13px;
  color: var(--el-text-color-secondary);
  line-height: 1.6;
  margin: 4px 0 16px;
  padding: 0;
}

.report-form :deep(.el-form-item) {
  margin-bottom: 8px;
}

.notice-alert {
  border-radius: 10px;
}

.notice-list {
  margin: 6px 0 0;
  padding-left: 18px;
  font-size: 13px;
  line-height: 1.9;
}

.notice-list code {
  background: rgba(0,0,0,0.06);
  padding: 1px 5px;
  border-radius: 4px;
  font-size: 12px;
}
</style>
