<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'

import {
  exportMonthlyReport,
  generateMonthlyReport,
  getMonthlyReport,
} from '@/api/govMoe'
import ClassroomSummaryTable from '@/components/gov-reports/ClassroomSummaryTable.vue'
import OverviewSummaryCard from '@/components/gov-reports/OverviewSummaryCard.vue'
import StudentDetailTable from '@/components/gov-reports/StudentDetailTable.vue'

const today = new Date()
// 預設「上個完整月份」
const defaultMonth = new Date(today.getFullYear(), today.getMonth() - 1, 1)
const year = ref(defaultMonth.getFullYear())
const month = ref(defaultMonth.getMonth() + 1)

const loading = ref(false)
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

const onGenerate = async () => {
  if (hasReport.value) {
    try {
      await ElMessageBox.confirm(
        `${year.value}-${String(month.value).padStart(2, '0')} 已產生過，確認覆寫並重算？`,
        '重算月報',
        { type: 'warning' },
      )
    } catch {
      return
    }
  }
  loading.value = true
  try {
    const resp = await generateMonthlyReport({ year: year.value, month: month.value })
    const body = (resp.data ?? resp) as { rows_generated: number }
    ElMessage.success(`已產生 ${body.rows_generated} 筆`)
    await fetchReport()
  } catch (err: unknown) {
    const e = err as { response?: { status?: number; data?: { detail?: string } } }
    if (e?.response?.status === 409) {
      ElMessage.warning('另一個產生請求進行中，請稍後再試')
    } else {
      ElMessage.error(e?.response?.data?.detail || '產生失敗')
    }
  } finally {
    loading.value = false
  }
}

const onExport = async () => {
  exporting.value = true
  try {
    const resp = await exportMonthlyReport({ year: year.value, month: month.value })
    const blob = new Blob([(resp as { data: BlobPart }).data], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `義華幼兒園_月報_${year.value}-${String(month.value).padStart(2, '0')}.xlsx`
    a.click()
    URL.revokeObjectURL(url)
  } catch (err: unknown) {
    const e = err as { response?: { data?: { detail?: string } } }
    ElMessage.error(e?.response?.data?.detail || '匯出失敗')
  } finally {
    exporting.value = false
  }
}

const onMonthChange = async () => {
  loading.value = true
  try {
    await fetchReport()
  } finally {
    loading.value = false
  }
}

const yearOptions = computed(() => {
  const now = new Date().getFullYear()
  return Array.from({ length: now - 2020 + 1 }, (_, i) => 2020 + i)
})
const monthOptions = Array.from({ length: 12 }, (_, i) => i + 1)

onMounted(() => { fetchReport() })
</script>

<template>
  <div class="monthly-report-view" v-loading="loading">
    <h2>月度幼生在園統計（教育部申報用）</h2>

    <div class="toolbar">
      <span>月份：</span>
      <el-select v-model="year" style="width: 100px" @change="onMonthChange">
        <el-option v-for="y in yearOptions" :key="y" :label="`${y} 年`" :value="y" />
      </el-select>
      <el-select v-model="month" style="width: 100px" @change="onMonthChange">
        <el-option v-for="m in monthOptions" :key="m" :label="`${m} 月`" :value="m" />
      </el-select>
      <el-button type="primary" :loading="loading" @click="onGenerate">
        {{ hasReport ? '重算本月' : '產生本月' }}
      </el-button>
      <el-tooltip :content="hasReport ? '' : '請先產生本月'" :disabled="hasReport">
        <el-button :disabled="!hasReport" :loading="exporting" @click="onExport">
          匯出 Excel
        </el-button>
      </el-tooltip>
    </div>

    <div v-if="report" class="meta">
      上次產生：{{ report.generated_at || '-' }}
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

    <el-empty v-else description="尚未產生本月月報" />

    <div class="footer-note">
      對照 ece.moe.edu.tw → 幼生通報 → 月報
    </div>
  </div>
</template>

<style scoped>
.monthly-report-view { padding: 16px; }
.toolbar { display: flex; gap: 8px; align-items: center; margin: 16px 0; }
.meta { color: #909399; font-size: 13px; margin-bottom: 12px; }
.tabs { margin-top: 16px; }
.footer-note {
  margin-top: 32px;
  color: #909399;
  font-size: 12px;
  text-align: center;
  padding-top: 16px;
  border-top: 1px solid #ebeef5;
}
</style>
