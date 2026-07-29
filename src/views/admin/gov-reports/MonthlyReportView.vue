<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'

import {
  exportMonthlyReport,
  generateMonthlyReport,
  getMonthlyReport,
} from '@/api/govMoe'
import PageHeader from '@/components/common/PageHeader.vue'
import ClassroomSummaryTable from '@/components/gov-reports/ClassroomSummaryTable.vue'
import OverviewSummaryCard from '@/components/gov-reports/OverviewSummaryCard.vue'
import StudentDetailTable from '@/components/gov-reports/StudentDetailTable.vue'
import { saveBlobResponse } from '@/utils/download'
import { getErrorMessage } from '@/utils/errorHandler'
import { formatDateTimeTW } from '@/utils/format'
import { PAGE_TERMS } from '@/constants/moduleTerms'

const today = new Date()
// 預設「上個完整月份」
const defaultMonth = new Date(today.getFullYear(), today.getMonth() - 1, 1)
const year = ref(defaultMonth.getFullYear())
const month = ref(defaultMonth.getMonth() + 1)

// 讀取遮整頁、產生只轉按鈕：兩者共用同一個 flag 時，按下「產生」會連整頁一起被蓋住
const loading = ref(false)
const generating = ref(false)
const exporting = ref(false)
const report = ref<null | {
  snapshot_date: string | null
  generated_at: string | null
  generated_by: string | null
  classroom_summary: unknown[]
  student_detail: unknown[]
  overview: unknown
}>(null)
const activeTab = ref<'classroom' | 'student' | 'overview'>('classroom')

const hasReport = computed(() => report.value !== null)
const periodLabel = computed(() => `${year.value}-${String(month.value).padStart(2, '0')}`)

// 404 代表該月尚未產生，屬正常狀態不是錯誤；其餘往上拋給 refresh 顯示
const fetchReport = async () => {
  try {
    const resp = await getMonthlyReport({ year: year.value, month: month.value })
    report.value = (resp.data ?? resp) as typeof report.value
  } catch (err: unknown) {
    if ((err as { response?: { status?: number } })?.response?.status === 404) {
      report.value = null
      return
    }
    throw err
  }
}

// 唯一的讀取入口：onMounted 與換月都走這裡，確保失敗一定有訊息而非靜默
const refresh = async () => {
  loading.value = true
  try {
    await fetchReport()
  } catch (err: unknown) {
    report.value = null
    ElMessage.error(getErrorMessage(err, '讀取月報失敗'))
  } finally {
    loading.value = false
  }
}

const onGenerate = async () => {
  if (hasReport.value) {
    try {
      await ElMessageBox.confirm(
        `${periodLabel.value} 已產生過，確認覆寫並重算？`,
        '重算月報',
        { type: 'warning' },
      )
    } catch {
      return
    }
  }
  generating.value = true
  try {
    const resp = await generateMonthlyReport({ year: year.value, month: month.value })
    const body = (resp.data ?? resp) as { rows_generated: number }
    ElMessage.success(`已產生 ${body.rows_generated} 筆`)
    await fetchReport()
  } catch (err: unknown) {
    if ((err as { response?: { status?: number } })?.response?.status === 409) {
      ElMessage.warning('另一個產生請求進行中，請稍後再試')
    } else {
      ElMessage.error(getErrorMessage(err, '產生失敗'))
    }
  } finally {
    generating.value = false
  }
}

const onExport = async () => {
  exporting.value = true
  try {
    const resp = await exportMonthlyReport({ year: year.value, month: month.value })
    // 後端已於 Content-Disposition 組好中文檔名，saveBlobResponse 會沿用；此處僅備援
    saveBlobResponse(resp, `月度幼生在園統計_${periodLabel.value}.xlsx`)
  } catch (err: unknown) {
    ElMessage.error(getErrorMessage(err, '匯出失敗'))
  } finally {
    exporting.value = false
  }
}

const yearOptions = computed(() => {
  const now = new Date().getFullYear()
  return Array.from({ length: now - 2020 + 1 }, (_, i) => 2020 + i)
})
const monthOptions = Array.from({ length: 12 }, (_, i) => i + 1)

onMounted(refresh)
</script>

<template>
  <div class="monthly-report-view" v-loading="loading">
    <PageHeader
      :title="PAGE_TERMS.govMonthly"
      subtitle="教育部申報用；對照 ece.moe.edu.tw → 幼生通報 → 月報"
    >
      <template #actions>
        <el-button type="primary" :loading="generating" @click="onGenerate">
          {{ hasReport ? '重算本月' : '產生本月' }}
        </el-button>
        <el-tooltip :content="hasReport ? '' : '請先產生本月'" :disabled="hasReport">
          <el-button :disabled="!hasReport" :loading="exporting" @click="onExport">
            匯出 Excel
          </el-button>
        </el-tooltip>
      </template>
      <template #filters>
        <span>月份：</span>
        <el-select v-model="year" style="width: 100px" @change="refresh">
          <el-option v-for="y in yearOptions" :key="y" :label="`${y} 年`" :value="y" />
        </el-select>
        <el-select v-model="month" style="width: 100px" @change="refresh">
          <el-option v-for="m in monthOptions" :key="m" :label="`${m} 月`" :value="m" />
        </el-select>
      </template>
    </PageHeader>

    <div v-if="report" class="meta">
      上次產生：{{ formatDateTimeTW(report.generated_at) || '-' }}
      <span v-if="report.generated_by"> by {{ report.generated_by }}</span>
    </div>

    <el-tabs v-if="report" v-model="activeTab" class="tabs">
      <el-tab-pane label="班級總表" name="classroom">
        <ClassroomSummaryTable :rows="report.classroom_summary as never" />
      </el-tab-pane>
      <el-tab-pane label="幼生明細" name="student">
        <StudentDetailTable :rows="report.student_detail as never" />
      </el-tab-pane>
      <el-tab-pane label="統計摘要" name="overview">
        <OverviewSummaryCard
          :overview="report.overview as never"
          :snapshot-date="report.snapshot_date"
          :generated-at="report.generated_at"
          :generated-by="report.generated_by"
        />
      </el-tab-pane>
    </el-tabs>

    <el-empty v-else :description="`${periodLabel} 尚未產生月報`" />
  </div>
</template>

<style scoped>
.monthly-report-view { padding: 16px; }
.meta { color: var(--text-tertiary); font-size: var(--text-sm); margin-bottom: 12px; }
.tabs { margin-top: 16px; }
</style>
