<script setup lang="ts">
import { computed, onMounted, onBeforeUnmount, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { friendlyError } from '@/utils/errorMessages'
import { hasPermission } from '@/utils/auth'
import {
  listGrowthReports, deleteGrowthReport, sendGrowthReportToLine,
  downloadGrowthReportUrl,
} from '@/api/studentGrowthReports'
import GrowthReportGenerateDialog from '@/components/student/GrowthReportGenerateDialog.vue'
import { apiError } from '@/utils/error'

const props = defineProps<{
  studentId: number
}>()

const canPublish = computed(() => hasPermission('PORTFOLIO_PUBLISH'))

const items = ref<Record<string, unknown>[]>([])
const loading = ref(false)
const dialogVisible = ref(false)
let pollTimer: ReturnType<typeof setInterval> | null = null

async function reload() {
  loading.value = true
  try {
    const r = await listGrowthReports(props.studentId)
    items.value = (r.data?.items ?? []) as unknown as Record<string, unknown>[]
  } catch (e) {
    ElMessage.error(friendlyError('載入成長報告列表失敗', e))
  } finally {
    loading.value = false
  }
}

function startPolling() {
  if (pollTimer) return
  pollTimer = setInterval(() => {
    const hasPending = items.value.some(
      (i) => i.status === 'pending' || i.status === 'generating',
    )
    if (hasPending) reload()
    else stopPolling()
  }, 3000)
}
function stopPolling() {
  if (pollTimer) {
    clearInterval(pollTimer)
    pollTimer = null
  }
}

function onCreated() {
  reload()
  startPolling()
}

function onDownload(row: Record<string, unknown>) {
  window.open(downloadGrowthReportUrl(props.studentId, row.id as number), '_blank', 'noopener')
}

async function onSendLine(row: Record<string, unknown>) {
  try {
    await ElMessageBox.confirm(
      `確定要 LINE 推送「${row.period_label}」報告給家長？`,
      '推送確認', { type: 'warning' },
    )
  } catch { return }
  try {
    const r = await sendGrowthReportToLine(props.studentId, row.id as number)
    ElMessage.success(`已推送 ${r.data?.sent_count} 位家長`)
    reload()
  } catch (e) {
    ElMessage.error(apiError(e, '推送失敗'))
  }
}

async function onDelete(row: Record<string, unknown>) {
  try {
    await ElMessageBox.confirm(
      `確定要刪除「${row.period_label}」報告？此操作不可復原`,
      '確認刪除', { type: 'warning' },
    )
  } catch { return }
  try {
    await deleteGrowthReport(props.studentId, row.id as number)
    ElMessage.success('已刪除')
    reload()
  } catch (e) {
    ElMessage.error(friendlyError('刪除成長報告失敗', e))
  }
}

const STATUS_LABEL: Record<string, string> = {
  pending: '排隊中',
  generating: '生成中',
  ready: '已完成',
  failed: '失敗',
}
const STATUS_TYPE: Record<string, string> = {
  pending: 'info',
  generating: 'warning',
  ready: 'success',
  failed: 'danger',
}

type ElTagType = 'primary' | 'success' | 'warning' | 'info' | 'danger'
function statusLabel(s: unknown) { return STATUS_LABEL[String(s ?? '')] || String(s ?? '') }
function statusType(s: unknown): ElTagType | undefined { return (STATUS_TYPE[String(s ?? '')] as ElTagType) || undefined }

onMounted(() => {
  reload().then(() => startPolling())
})
onBeforeUnmount(stopPolling)
</script>

<template>
  <div class="growth-report-tab">
    <div class="toolbar">
      <h4>成長報告</h4>
      <el-button v-if="canPublish" type="primary" @click="dialogVisible = true">
        ➕ 生成新報告
      </el-button>
    </div>

    <el-empty v-if="!loading && items.length === 0" description="尚無報告" />

    <el-table v-else :data="items" v-loading="loading" class="report-table">
      <el-table-column prop="period_label" label="期間" width="160" />
      <el-table-column label="期間範圍" width="200">
        <template #default="{ row }">
          {{ row.period_start }} ~ {{ row.period_end }}
        </template>
      </el-table-column>
      <el-table-column label="狀態" width="100">
        <template #default="{ row }">
          <el-tag :type="statusType(row.status)">{{ statusLabel(row.status) }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column label="生成時間" width="160">
        <template #default="{ row }">
          {{ row.generated_at ? new Date(row.generated_at).toLocaleString() : '—' }}
        </template>
      </el-table-column>
      <el-table-column label="LINE 已推送" width="140">
        <template #default="{ row }">
          <span v-if="row.line_sent_at">{{ new Date(row.line_sent_at).toLocaleString() }}</span>
          <span v-else>未推送</span>
        </template>
      </el-table-column>
      <el-table-column label="家長已看" width="100">
        <template #default="{ row }">
          {{ row.parent_view_count }} 次
        </template>
      </el-table-column>
      <el-table-column label="操作" width="240">
        <template #default="{ row }">
          <el-button v-if="row.status === 'ready'" size="small" link @click="onDownload(row)">下載</el-button>
          <el-button v-if="canPublish && row.status === 'ready'" size="small" link @click="onSendLine(row)">
            LINE 推送
          </el-button>
          <el-button v-if="canPublish" size="small" type="danger" link @click="onDelete(row)">刪除</el-button>
        </template>
      </el-table-column>
    </el-table>

    <GrowthReportGenerateDialog
      v-model="dialogVisible"
      :student-id="studentId"
      @created="onCreated"
    />
  </div>
</template>

<style scoped>
.growth-report-tab { display: flex; flex-direction: column; gap: 12px; }
.toolbar { display: flex; justify-content: space-between; align-items: center; }
.toolbar > h4 { margin: 0; }
.report-table { width: 100%; }
</style>
