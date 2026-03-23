<template>
  <div class="page-container">
    <div class="page-header">
      <h2 class="page-title">政府申報匯出</h2>
      <p class="page-subtitle">產生勞保局、健保局、國稅局、勞退提繳等申報格式檔案</p>
    </div>

    <!-- 雇主基本資料 -->
    <el-card class="section-card" shadow="never">
      <template #header><span class="card-title">雇主基本資料</span></template>
      <el-form :model="employer" label-width="120px" inline>
        <el-form-item label="機構名稱">
          <el-input v-model="employer.name" placeholder="例：○○幼兒園" style="width:220px" />
        </el-form-item>
        <el-form-item label="統一編號 / 代碼">
          <el-input v-model="employer.code" placeholder="8 位數統一編號" style="width:180px" />
        </el-form-item>
      </el-form>
    </el-card>

    <!-- 申報項目卡片 -->
    <el-row :gutter="20" class="report-grid">

      <!-- 勞保投保薪資申報 -->
      <el-col :xs="24" :sm="12" :lg="6">
        <el-card class="report-card" shadow="never">
          <div class="report-icon labor">
            <el-icon :size="28"><Document /></el-icon>
          </div>
          <div class="report-title">勞保投保薪資申報</div>
          <div class="report-desc">每月員工勞保費分攤明細（20% / 70% / 10%）</div>

          <el-form label-width="60px" size="small" class="report-form">
            <el-form-item label="年月">
              <el-date-picker
                v-model="labor.period"
                type="month"
                format="YYYY年MM月"
                value-format="YYYY-MM"
                placeholder="選擇月份"
                style="width:150px"
              />
            </el-form-item>
            <el-form-item label="格式">
              <el-radio-group v-model="labor.fmt">
                <el-radio value="xlsx">Excel</el-radio>
                <el-radio value="txt">TXT</el-radio>
              </el-radio-group>
            </el-form-item>
          </el-form>

          <el-button
            type="primary" :loading="loading.labor"
            :disabled="!labor.period"
            @click="download('labor')"
            class="download-btn"
          >下載申報表</el-button>
        </el-card>
      </el-col>

      <!-- 健保被保險人名冊 -->
      <el-col :xs="24" :sm="12" :lg="6">
        <el-card class="report-card" shadow="never">
          <div class="report-icon health">
            <el-icon :size="28"><FirstAidKit /></el-icon>
          </div>
          <div class="report-title">健保被保險人名冊</div>
          <div class="report-desc">每月員工健保費分攤明細（30% / 60%）及眷屬人數</div>

          <el-form label-width="60px" size="small" class="report-form">
            <el-form-item label="年月">
              <el-date-picker
                v-model="health.period"
                type="month"
                format="YYYY年MM月"
                value-format="YYYY-MM"
                placeholder="選擇月份"
                style="width:150px"
              />
            </el-form-item>
          </el-form>

          <el-button
            type="primary" :loading="loading.health"
            :disabled="!health.period"
            @click="download('health')"
            class="download-btn"
          >下載申報表</el-button>
        </el-card>
      </el-col>

      <!-- 扣繳憑單 -->
      <el-col :xs="24" :sm="12" :lg="6">
        <el-card class="report-card" shadow="never">
          <div class="report-icon tax">
            <el-icon :size="28"><Money /></el-icon>
          </div>
          <div class="report-title">扣繳憑單（年度）</div>
          <div class="report-desc">全年薪資所得總額與估計扣繳稅額（財政部格式）</div>

          <el-form label-width="60px" size="small" class="report-form">
            <el-form-item label="年度">
              <el-date-picker
                v-model="withholding.year"
                type="year"
                format="YYYY年"
                value-format="YYYY"
                placeholder="選擇年度"
                style="width:140px"
              />
            </el-form-item>
            <el-form-item label="扣繳單位">
              <el-input v-model="withholding.employerId" placeholder="統一編號" style="width:150px" />
            </el-form-item>
          </el-form>

          <el-button
            type="primary" :loading="loading.withholding"
            :disabled="!withholding.year"
            @click="download('withholding')"
            class="download-btn"
          >下載申報表</el-button>
        </el-card>
      </el-col>

      <!-- 勞退提繳明細 -->
      <el-col :xs="24" :sm="12" :lg="6">
        <el-card class="report-card" shadow="never">
          <div class="report-icon pension">
            <el-icon :size="28"><Wallet /></el-icon>
          </div>
          <div class="report-title">勞退提繳明細</div>
          <div class="report-desc">每月雇主 6% 提繳與員工自提金額對帳表</div>

          <el-form label-width="60px" size="small" class="report-form">
            <el-form-item label="年月">
              <el-date-picker
                v-model="pension.period"
                type="month"
                format="YYYY年MM月"
                value-format="YYYY-MM"
                placeholder="選擇月份"
                style="width:150px"
              />
            </el-form-item>
          </el-form>

          <el-button
            type="primary" :loading="loading.pension"
            :disabled="!pension.period"
            @click="download('pension')"
            class="download-btn"
          >下載申報表</el-button>
        </el-card>
      </el-col>

    </el-row>

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

<script setup>
import { ref, reactive } from 'vue'
import { ElMessage } from 'element-plus'
import { Document, Money, Wallet } from '@element-plus/icons-vue'
import { getLaborInsurance, getHealthInsurance, getWithholding, getPension } from '@/api/govReports'

// 補 Element Plus 未直接 export 的 icon
import { FirstAidKit } from '@element-plus/icons-vue'

const employer = reactive({ name: '', code: '' })

const labor = reactive({ period: null, fmt: 'xlsx' })
const health = reactive({ period: null })
const withholding = reactive({ year: null, employerId: '' })
const pension = reactive({ period: null })

const loading = reactive({ labor: false, health: false, withholding: false, pension: false })

function _parsePeriod(period) {
  const [y, m] = period.split('-')
  return { year: parseInt(y), month: parseInt(m) }
}

function _triggerDownload(blob, filename) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

async function download(type) {
  loading[type] = true
  try {
    let res, filename

    if (type === 'labor') {
      const { year, month } = _parsePeriod(labor.period)
      res = await getLaborInsurance({
        year, month,
        fmt: labor.fmt,
        employer_name: employer.name || undefined,
        employer_code: employer.code || undefined,
      })
      const ext = labor.fmt === 'txt' ? 'txt' : 'xlsx'
      filename = `勞保投保薪資申報_${year}${String(month).padStart(2,'0')}.${ext}`

    } else if (type === 'health') {
      const { year, month } = _parsePeriod(health.period)
      res = await getHealthInsurance({
        year, month,
        employer_name: employer.name || undefined,
        employer_code: employer.code || undefined,
      })
      filename = `健保被保險人名冊_${year}${String(month).padStart(2,'0')}.xlsx`

    } else if (type === 'withholding') {
      res = await getWithholding({
        year: parseInt(withholding.year),
        employer_name: employer.name || undefined,
        employer_id: withholding.employerId || undefined,
      })
      filename = `扣繳憑單_${withholding.year}.xlsx`

    } else if (type === 'pension') {
      const { year, month } = _parsePeriod(pension.period)
      res = await getPension({
        year, month,
        employer_name: employer.name || undefined,
        employer_code: employer.code || undefined,
      })
      filename = `勞退提繳明細_${year}${String(month).padStart(2,'0')}.xlsx`
    }

    _triggerDownload(res.data, filename)
    ElMessage.success('下載成功')
  } catch (err) {
    const status = err.response?.status
    if (status === 429) {
      ElMessage.warning('匯出過於頻繁，請稍後再試')
    } else {
      ElMessage.error('下載失敗，請稍後再試')
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

.page-header {
  margin-bottom: 24px;
}

.page-title {
  font-size: 22px;
  font-weight: 700;
  margin: 0 0 6px;
  color: var(--el-text-color-primary);
}

.page-subtitle {
  margin: 0;
  color: var(--el-text-color-secondary);
  font-size: 14px;
}

.section-card {
  margin-bottom: 20px;
  border-radius: 10px;
}

.card-title {
  font-weight: 600;
  font-size: 15px;
}

.report-grid {
  margin-bottom: 20px;
}

.report-card {
  height: 100%;
  border-radius: 10px;
  text-align: center;
  padding: 8px 0;
  margin-bottom: 16px;
}

.report-icon {
  width: 56px;
  height: 56px;
  border-radius: 14px;
  display: flex;
  align-items: center;
  justify-content: center;
  margin: 12px auto 14px;
  color: #fff;
}

.report-icon.labor  { background: linear-gradient(135deg, #3b82f6, #2563eb); }
.report-icon.health { background: linear-gradient(135deg, #10b981, #059669); }
.report-icon.tax    { background: linear-gradient(135deg, #f59e0b, #d97706); }
.report-icon.pension{ background: linear-gradient(135deg, #8b5cf6, #7c3aed); }

.report-title {
  font-size: 15px;
  font-weight: 700;
  margin-bottom: 6px;
  color: var(--el-text-color-primary);
}

.report-desc {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  line-height: 1.5;
  min-height: 36px;
  margin-bottom: 14px;
  padding: 0 8px;
}

.report-form {
  text-align: left;
  margin-bottom: 14px;
}

.report-form :deep(.el-form-item) {
  margin-bottom: 8px;
}

.download-btn {
  width: 100%;
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
