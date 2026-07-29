<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { getClassrooms } from '@/api/classrooms'
import { getGrowthBookBatchStatus, createGrowthBook } from '@/api/growthBooks'
// 成長報告族（下載／LINE 推播）沿用既有 src/api/studentGrowthReports.ts（Task 9 審查後定案），
// 不在 growthBooks.ts 重複這組 API surface。
import { sendGrowthReportToLine, downloadGrowthReportUrl } from '@/api/studentGrowthReports'
import { apiError } from '@/utils/error'
import { getCurrentAcademicTerm } from '@/utils/academic'
import { hasPermission } from '@/utils/auth'

// 後端 create_growth_book / send_growth_report_to_line 皆掛 Permission.PORTFOLIO_PUBLISH
// （非 PORTFOLIO_WRITE，對齊既有 GrowthReportTab.vue 的 canPublish 慣例）；
// 頁面進場僅需 PORTFOLIO_READ（見 router 權限規則），生成／推播動作額外收斂到 PUBLISH。
const canPublish = computed(() => hasPermission('PORTFOLIO_PUBLISH'))

// 輪詢間隔（後端 batch-status 一次呼叫約每生 8 個 query，過於頻繁會加重負載）
const POLL_INTERVAL_MS = 5000

interface MaterialSummary {
  observations: number
  work_samples: number
  photos: number
}

type GrowthBookStatus = 'none' | 'pending' | 'generating' | 'ready' | 'failed'

interface BatchStatusItem {
  student_id: number
  student_name: string
  status: GrowthBookStatus
  report_id: number | null
  line_sent_at: string | null
  material_summary: MaterialSummary
}

interface ClassroomOption {
  id: number
  name: string
}

const route = useRoute()
const router = useRouter()

const classrooms = ref<ClassroomOption[]>([])
const classroomId = ref<number | null>(
  route.query.classroom_id ? Number(route.query.classroom_id) : null,
)
const academicYear = ref<number>(
  route.query.academic_year ? Number(route.query.academic_year) : getCurrentAcademicTerm().school_year,
)
const periodLabel = ref('')
const items = ref<BatchStatusItem[]>([])
const loading = ref(false)

// 單筆按鈕 loading 防雙擊，以 student_id 為 key
const rowLoading = ref<Record<number, boolean>>({})

const batchGenerating = ref(false)
const batchSending = ref(false)
const generateProgress = ref<{ done: number; total: number } | null>(null)
const sendProgress = ref<{ done: number; total: number } | null>(null)

let pollTimer: ReturnType<typeof setInterval> | null = null

const STATUS_LABEL: Record<GrowthBookStatus, string> = {
  none: '尚未建立',
  pending: '生成中',
  generating: '生成中',
  ready: '可下載',
  failed: '失敗',
}
const STATUS_TAG_TYPE: Record<GrowthBookStatus, 'info' | 'warning' | 'success' | 'danger'> = {
  none: 'info',
  pending: 'warning',
  generating: 'warning',
  ready: 'success',
  failed: 'danger',
}

function statusLabel(status: GrowthBookStatus) {
  return STATUS_LABEL[status] ?? status
}
function statusTagType(status: GrowthBookStatus) {
  return STATUS_TAG_TYPE[status] ?? 'info'
}

async function loadClassrooms() {
  try {
    const r = await getClassrooms()
    // 後端未標 response_model 情境已由 schema 收斂為 ClassroomListItemOut[]，此處僅取需要欄位
    classrooms.value = (r.data ?? []) as unknown as ClassroomOption[]
  } catch {
    ElMessage.error('讀取班級列表失敗')
  }
}

function stopPolling() {
  if (pollTimer) {
    clearInterval(pollTimer)
    pollTimer = null
  }
}

function maybeStartPolling() {
  const hasActive = items.value.some(
    (i) => i.status === 'pending' || i.status === 'generating',
  )
  if (hasActive) {
    if (!pollTimer) {
      pollTimer = setInterval(() => { load() }, POLL_INTERVAL_MS)
    }
  } else {
    stopPolling()
  }
}

async function load() {
  if (!classroomId.value) return
  loading.value = true
  try {
    const r = await getGrowthBookBatchStatus({
      classroom_id: classroomId.value,
      academic_year: academicYear.value,
    })
    // 後端 GET /growth-books/batch-status 未標 response_model，型別退為 unknown，
    // 依 CLAUDE.md 慣例以本地 interface 明確標註等候補齊後端 schema。
    const data = r.data as unknown as { items: BatchStatusItem[]; period_label: string }
    items.value = data.items ?? []
    periodLabel.value = data.period_label ?? ''
    maybeStartPolling()
  } catch (e) {
    ElMessage.error(apiError(e, '讀取成長冊狀態失敗'))
  } finally {
    loading.value = false
  }
}

function onSearch() {
  router.push({
    query: {
      ...route.query,
      classroom_id: classroomId.value ?? undefined,
      academic_year: academicYear.value,
    },
  })
  load()
}

async function onGenerate(row: BatchStatusItem) {
  if (!canPublish.value) return
  if (rowLoading.value[row.student_id]) return
  rowLoading.value[row.student_id] = true
  try {
    await createGrowthBook(row.student_id, { academic_year: academicYear.value })
    ElMessage.success('已建立，生成中')
    await load()
  } catch (e) {
    ElMessage.error(apiError(e, '建立失敗'))
  } finally {
    rowLoading.value[row.student_id] = false
  }
}

function onDownload(row: BatchStatusItem) {
  if (row.report_id == null) return
  window.open(downloadGrowthReportUrl(row.student_id, row.report_id), '_blank', 'noopener')
}

async function onSendLine(row: BatchStatusItem) {
  if (!canPublish.value) return
  if (row.report_id == null) return
  if (rowLoading.value[row.student_id]) return
  rowLoading.value[row.student_id] = true
  try {
    const r = await sendGrowthReportToLine(row.student_id, row.report_id)
    ElMessage.success(`已推播${r.data?.sent_count != null ? ` ${r.data.sent_count} 位家長` : ''}`)
    await load()
  } catch (e) {
    ElMessage.error(apiError(e, '推播失敗'))
  } finally {
    rowLoading.value[row.student_id] = false
  }
}

async function onBatchGenerate() {
  if (!canPublish.value) return
  if (batchGenerating.value) return
  const targets = items.value.filter((i) => i.status === 'none')
  if (targets.length === 0) {
    ElMessage.info('目前沒有需要生成的學生')
    return
  }
  batchGenerating.value = true
  generateProgress.value = { done: 0, total: targets.length }
  let failCount = 0
  for (const row of targets) {
    try {
      await createGrowthBook(row.student_id, { academic_year: academicYear.value })
    } catch (e) {
      failCount += 1
      ElMessage.error(`${row.student_name}：${apiError(e, '建立失敗')}`)
    }
    generateProgress.value = { done: generateProgress.value.done + 1, total: targets.length }
  }
  batchGenerating.value = false
  generateProgress.value = null
  if (failCount === 0) ElMessage.success('批次生成完成')
  else ElMessage.warning(`批次生成完成，${failCount} 筆失敗`)
  await load()
}

async function onBatchSendLine() {
  if (!canPublish.value) return
  if (batchSending.value) return
  const targets = items.value.filter(
    (i) => i.status === 'ready' && i.report_id != null && !i.line_sent_at,
  )
  if (targets.length === 0) {
    ElMessage.info('目前沒有需要推播的學生')
    return
  }
  batchSending.value = true
  sendProgress.value = { done: 0, total: targets.length }
  let failCount = 0
  for (const row of targets) {
    try {
      await sendGrowthReportToLine(row.student_id, row.report_id as number)
    } catch (e) {
      failCount += 1
      ElMessage.error(`${row.student_name}：${apiError(e, '推播失敗')}`)
    }
    sendProgress.value = { done: sendProgress.value.done + 1, total: targets.length }
  }
  batchSending.value = false
  sendProgress.value = null
  if (failCount === 0) ElMessage.success('批次推播完成')
  else ElMessage.warning(`批次推播完成，${failCount} 筆失敗`)
  await load()
}

function progressPct(p: { done: number; total: number } | null) {
  if (!p || p.total === 0) return 0
  return Math.round((p.done / p.total) * 100)
}

onMounted(() => {
  loadClassrooms()
  if (classroomId.value) load()
})
onUnmounted(stopPolling)

// Expose for tests（<script setup> 預設不對外露出 setup 綁定）
defineExpose({ classroomId, academicYear, load, items, classrooms })
</script>

<template>
  <div class="growth-books-view">
    <div class="toolbar">
      <el-select v-model="classroomId" placeholder="選擇班級" style="width: 200px" clearable @change="onSearch">
        <el-option v-for="c in classrooms" :key="c.id" :label="c.name" :value="c.id" />
      </el-select>
      <el-input-number v-model="academicYear" :min="100" :max="150" :controls="false" style="width: 120px" />
      <el-button type="primary" :loading="loading" @click="onSearch">查詢</el-button>
      <span v-if="periodLabel" class="period-label">{{ periodLabel }}</span>

      <div v-if="canPublish" class="batch-actions">
        <el-button
          :disabled="!classroomId || items.length === 0"
          :loading="batchGenerating"
          @click="onBatchGenerate"
        >
          全班一鍵生成
          <span v-if="generateProgress">（{{ generateProgress.done }}/{{ generateProgress.total }}）</span>
        </el-button>
        <el-button
          :disabled="!classroomId || items.length === 0"
          :loading="batchSending"
          @click="onBatchSendLine"
        >
          全班推播
          <span v-if="sendProgress">（{{ sendProgress.done }}/{{ sendProgress.total }}）</span>
        </el-button>
      </div>
    </div>

    <el-progress
      v-if="generateProgress"
      :percentage="progressPct(generateProgress)"
      :stroke-width="10"
      class="batch-progress"
    />
    <el-progress
      v-if="sendProgress"
      :percentage="progressPct(sendProgress)"
      :stroke-width="10"
      class="batch-progress"
    />

    <el-table :data="items" v-loading="loading" class="growth-books-table">
      <el-table-column prop="student_name" label="姓名" width="120" />
      <el-table-column label="素材摘要" min-width="180">
        <template #default="{ row }">
          觀察 {{ row.material_summary.observations }}・作品 {{ row.material_summary.work_samples }}・照片 {{ row.material_summary.photos }}
        </template>
      </el-table-column>
      <el-table-column label="狀態" width="180">
        <template #default="{ row }">
          <el-tag :type="statusTagType(row.status)">{{ statusLabel(row.status) }}</el-tag>
          <el-tag v-if="row.line_sent_at" type="success" class="pushed-tag">已推播</el-tag>
        </template>
      </el-table-column>
      <el-table-column label="操作" width="280">
        <template #default="{ row }">
          <!-- TODO(Task 13): 點擊開啟策展抽屜（curation drawer），本 task 僅放 placeholder -->
          <el-button v-if="row.status === 'ready' || row.status === 'none'" size="small" link disabled>
            策展
          </el-button>
          <el-button
            v-if="canPublish && row.status === 'none'"
            size="small" link
            :loading="rowLoading[row.student_id]"
            @click="onGenerate(row)"
          >
            一鍵生成
          </el-button>
          <el-button
            v-if="row.status === 'ready'"
            size="small" link
            @click="onDownload(row)"
          >
            下載
          </el-button>
          <el-button
            v-if="canPublish && row.status === 'ready'"
            size="small" link
            :loading="rowLoading[row.student_id]"
            @click="onSendLine(row)"
          >
            推播 LINE
          </el-button>
        </template>
      </el-table-column>
    </el-table>
  </div>
</template>

<style scoped>
.growth-books-view {
  padding: 8px 0;
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.toolbar {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}
.period-label {
  color: var(--el-text-color-secondary);
  font-size: 13px;
}
.batch-actions {
  margin-left: auto;
  display: flex;
  gap: 8px;
}
.batch-progress {
  max-width: 320px;
}
.growth-books-table {
  width: 100%;
}
.pushed-tag {
  margin-left: 4px;
}
</style>
