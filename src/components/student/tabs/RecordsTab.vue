<script setup lang="ts">
import { ref, reactive, computed, watch, onUnmounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Plus, Refresh } from '@element-plus/icons-vue'
import { getStudentRecordsTimeline } from '@/api/studentRecords'
import { useStudentRecordsStore } from '@/stores/studentRecords'
import { domainBus, RECORD_EVENTS, STUDENT_EVENTS } from '@/utils/domainBus'
import { hasPermission } from '@/utils/auth'
import { apiError } from '@/utils/error'
import {
  INCIDENT_TYPE_TAG,
  SEVERITY_TAG,
  RATING_TAG,
} from '@/constants/studentRecords'
import IncidentEditorDialog from '@/components/student/IncidentEditorDialog.vue'
import AssessmentEditorDialog from '@/components/student/AssessmentEditorDialog.vue'
import ChangeLogEditorDialog from '@/components/student/ChangeLogEditorDialog.vue'
import SummaryCards from '@/components/student/tabs/academic/SummaryCards.vue'
import LeaveSection from '@/components/student/tabs/academic/LeaveSection.vue'

const props = withDefaults(defineProps<{
  studentId: number
  classroomId?: number | null
  active?: boolean
}>(), {
  classroomId: null,
  active: true,
})

const emit = defineEmits<{
  'jump-tab': [payload: string | { tab: string; query?: Record<string, string> }]
}>()

const canWrite = hasPermission('STUDENTS_WRITE')

const TYPE_TAG_COLOR = { incident: 'danger', assessment: 'success', change_log: 'warning' }
const TYPE_LABEL = { incident: '事件', assessment: '評量', change_log: '異動' }

const items = ref<Record<string, unknown>[]>([])
const loading = ref(false)
const loaded = ref(false)
const viewMode = ref('timeline') // 'timeline' | 'table'
const tableTab = ref('incident')
const dateRange = ref<string[]>([])
const filterFrom = ref<string | null>(null)
const filterTo = ref<string | null>(null)

const incidentDialog = reactive<{ visible: boolean; mode: string; initial: Record<string, unknown> | null }>({ visible: false, mode: 'create', initial: null })
const assessmentDialog = reactive<{ visible: boolean; mode: string; initial: Record<string, unknown> | null }>({ visible: false, mode: 'create', initial: null })
const changeLogDialog = reactive<{ visible: boolean; mode: string; initial: Record<string, unknown> | null }>({ visible: false, mode: 'create', initial: null })

const grouped = computed(() => {
  const g: Record<string, Record<string, unknown>[]> = { incident: [], assessment: [], change_log: [] }
  for (const it of items.value) if (g[it.record_type as string]) g[it.record_type as string].push(it)
  return g
})

async function fetchData() {
  if (!props.studentId) return
  loading.value = true
  try {
    const params: Record<string, unknown> = { student_id: props.studentId, page: 1, page_size: 100 }
    if (filterFrom.value) params.date_from = filterFrom.value
    if (filterTo.value) params.date_to = filterTo.value
    const res = await getStudentRecordsTimeline(params)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    items.value = (res as any).data?.items || []
    loaded.value = true
  } catch (e) {
    ElMessage.error(apiError(e, '載入紀錄失敗'))
  } finally {
    loading.value = false
  }
}

watch(
  () => [props.active, props.studentId],
  ([active]) => {
    if (active && !loaded.value) fetchData()
  },
  { immediate: true },
)

const onBusRefresh = () => { if (props.active) fetchData() }
const busEvents = [RECORD_EVENTS.CREATED, RECORD_EVENTS.UPDATED, RECORD_EVENTS.DELETED, STUDENT_EVENTS.LIFECYCLE_CHANGED]
busEvents.forEach((e) => domainBus.on(e, onBusRefresh))
onUnmounted(() => busEvents.forEach((e) => domainBus.off(e, onBusRefresh)))

const handleDateRangeChange = (v: string[] | null) => {
  filterFrom.value = v?.[0] || null
  filterTo.value = v?.[1] || null
  fetchData()
}

const resetFilters = () => {
  dateRange.value = []
  filterFrom.value = null
  filterTo.value = null
  fetchData()
}

const isMutable = (row: Record<string, unknown>) => {
  if (row?.record_type !== 'change_log') return true
  return ((row.payload as Record<string, unknown>)?.source || 'manual') === 'manual'
}

const openCreate = (type: string) => {
  if (type === 'incident') {
    incidentDialog.initial = null
    incidentDialog.mode = 'create'
    incidentDialog.visible = true
  } else if (type === 'assessment') {
    assessmentDialog.initial = null
    assessmentDialog.mode = 'create'
    assessmentDialog.visible = true
  } else if (type === 'change_log') {
    changeLogDialog.initial = null
    changeLogDialog.mode = 'create'
    changeLogDialog.visible = true
  }
}

const openEdit = (row: Record<string, unknown>) => {
  const p = (row.payload as Record<string, unknown>) || {}
  if (row.record_type === 'incident') {
    incidentDialog.initial = {
      id: row.record_id,
      student_id: row.student_id,
      student_name: row.student_name,
      classroom_id: row.classroom_id,
      incident_type: p.incident_type,
      severity: p.severity,
      occurred_at: row.occurred_at,
      description: p.description,
      action_taken: p.action_taken,
      parent_notified: p.parent_notified,
    }
    incidentDialog.mode = 'edit'
    incidentDialog.visible = true
  } else if (row.record_type === 'assessment') {
    assessmentDialog.initial = {
      id: row.record_id,
      student_id: row.student_id,
      student_name: row.student_name,
      classroom_id: row.classroom_id,
      semester: p.semester,
      assessment_type: p.assessment_type,
      domain: p.domain,
      rating: p.rating,
      content: p.content,
      suggestions: p.suggestions,
      assessment_date: p.assessment_date,
    }
    assessmentDialog.mode = 'edit'
    assessmentDialog.visible = true
  } else if (row.record_type === 'change_log') {
    changeLogDialog.initial = {
      id: row.record_id,
      student_id: row.student_id,
      student_name: row.student_name,
      school_year: p.school_year,
      semester: p.semester,
      event_type: p.event_type,
      event_date: p.event_date,
      reason: p.reason,
      notes: p.notes,
    }
    changeLogDialog.mode = 'edit'
    changeLogDialog.visible = true
  }
}

const handleDelete = async (row: Record<string, unknown>) => {
  const recType = row.record_type as string
  const msg = `確定要刪除這筆${(TYPE_LABEL as Record<string, string>)[recType]}紀錄？`
  try {
    await ElMessageBox.confirm(msg, '確認刪除', { type: 'warning' })
    const store = useStudentRecordsStore()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await store.deleteRecord(recType as any, row.record_id as number, { student_id: row.student_id as number })
    ElMessage.success('刪除成功')
    fetchData()
  } catch (e) {
    if (e !== 'cancel') ElMessage.error(apiError(e, '刪除失敗'))
  }
}

const formatTimestamp = (iso: unknown) => {
  if (!iso) return '-'
  const s = String(iso)
  return s.length >= 16 ? s.slice(0, 16).replace('T', ' ') : s
}

const truncate = (text: string | null | undefined, len = 60) => {
  if (!text) return ''
  return text.length > len ? text.slice(0, len) + '…' : text
}

// template helper: look up tag types from unknown-typed row fields
const TYPE_TAG_COLOR_MAP: Record<string, string> = TYPE_TAG_COLOR
const TYPE_LABEL_MAP: Record<string, string> = TYPE_LABEL
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const INCIDENT_TYPE_TAG_MAP: Record<string, string> = INCIDENT_TYPE_TAG as any
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const SEVERITY_TAG_MAP: Record<string, string> = SEVERITY_TAG as any
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const RATING_TAG_MAP: Record<string, string> = RATING_TAG as any

type ElTagType = 'primary' | 'success' | 'warning' | 'info' | 'danger'
function rowTypeTagColor(v: unknown): ElTagType { return (TYPE_TAG_COLOR_MAP[String(v ?? '')] as ElTagType) || 'primary' }
function rowTypeTagColorOrEmpty(v: unknown): ElTagType | undefined { return (TYPE_TAG_COLOR_MAP[String(v ?? '')] as ElTagType) || undefined }
function rowTypeLabel(v: unknown) { return TYPE_LABEL_MAP[String(v ?? '')] || String(v ?? '') }
function incidentTypeTag(v: unknown): ElTagType | undefined { return (INCIDENT_TYPE_TAG_MAP[String(v ?? '')] as ElTagType) || undefined }
function severityTag(v: unknown): ElTagType | undefined { return (SEVERITY_TAG_MAP[String(v ?? '')] as ElTagType) || undefined }
function ratingTag(v: unknown): ElTagType | undefined { return (RATING_TAG_MAP[String(v ?? '')] as ElTagType) || undefined }
function rowPayload(row: Record<string, unknown>) { return (row.payload as Record<string, unknown>) || {} }

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const summaryRef = ref<any>(null)

function handleJumpSection(section: string) {
  viewMode.value = 'table'
  tableTab.value = section
}

function handleJumpAttendance(payload: Record<string, string>) {
  emit('jump-tab', { tab: 'attendance', query: payload })
}

defineExpose({
  refresh: () => {
    fetchData()
    summaryRef.value?.refresh?.()
  },
})
</script>

<template>
  <div class="records-tab">
    <SummaryCards
      ref="summaryRef"
      :student-id="studentId"
      :active="active"
      @jump-tab="(tab) => emit('jump-tab', { tab })"
      @jump-section="handleJumpSection"
    />
    <div class="filter-bar">
      <el-date-picker
        v-model="dateRange"
        type="daterange"
        size="small"
        range-separator="至"
        start-placeholder="開始日期"
        end-placeholder="結束日期"
        value-format="YYYY-MM-DD"
        style="width: 280px"
        @change="handleDateRangeChange"
      />
      <el-radio-group v-model="viewMode" size="small">
        <el-radio-button value="timeline">時間軸</el-radio-button>
        <el-radio-button value="table">分類表格</el-radio-button>
      </el-radio-group>
      <el-button size="small" text @click="resetFilters">清除篩選</el-button>
      <div class="stat-row">
        <el-tag type="danger" size="small">事件 {{ grouped.incident.length }}</el-tag>
        <el-tag type="success" size="small">評量 {{ grouped.assessment.length }}</el-tag>
        <el-tag type="warning" size="small">異動 {{ grouped.change_log.length }}</el-tag>
      </div>
      <el-dropdown
        v-if="canWrite"
        trigger="click"
        @command="openCreate"
      >
        <el-button type="primary" size="small" :icon="Plus">新增 ▾</el-button>
        <template #dropdown>
          <el-dropdown-menu>
            <el-dropdown-item command="incident">事件紀錄</el-dropdown-item>
            <el-dropdown-item command="assessment">學期評量</el-dropdown-item>
            <el-dropdown-item command="change_log">異動補登</el-dropdown-item>
          </el-dropdown-menu>
        </template>
      </el-dropdown>
      <el-button size="small" :icon="Refresh" @click="fetchData">重新整理</el-button>
    </div>

    <!-- 時間軸 -->
    <div v-if="viewMode === 'timeline'" v-loading="loading" class="timeline-wrap">
      <el-empty v-if="!loading && !items.length" description="目前沒有紀錄" />
      <el-timeline v-else>
        <el-timeline-item
          v-for="row in items"
          :key="`${row.record_type}-${row.record_id}`"
          :type="rowTypeTagColor(row.record_type)"
          :timestamp="formatTimestamp(row.occurred_at)"
          placement="top"
        >
          <div class="record-card">
            <div class="record-head">
              <el-tag :type="rowTypeTagColorOrEmpty(row.record_type)" size="small">
                {{ rowTypeLabel(row.record_type) }}
              </el-tag>
              <template v-if="row.record_type === 'incident'">
                <el-tag v-if="rowPayload(row).incident_type" size="small" :type="incidentTypeTag(rowPayload(row).incident_type)">
                  {{ rowPayload(row).incident_type }}
                </el-tag>
                <el-tag v-if="rowPayload(row).severity" size="small" :type="severityTag(rowPayload(row).severity)">
                  {{ rowPayload(row).severity }}
                </el-tag>
                <el-tag v-if="rowPayload(row).parent_notified" type="success" size="small">已通知家長</el-tag>
              </template>
              <template v-else-if="row.record_type === 'assessment'">
                <el-tag v-if="rowPayload(row).domain" size="small">{{ rowPayload(row).domain }}</el-tag>
                <el-tag v-if="rowPayload(row).rating" size="small" :type="ratingTag(rowPayload(row).rating)">
                  {{ rowPayload(row).rating }}
                </el-tag>
                <el-tag v-if="rowPayload(row).assessment_type" type="info" size="small">{{ rowPayload(row).assessment_type }}</el-tag>
              </template>
              <template v-else-if="row.record_type === 'change_log'">
                <el-tag v-if="rowPayload(row).event_type" size="small" type="warning">{{ rowPayload(row).event_type }}</el-tag>
                <el-tag v-if="rowPayload(row).source === 'lifecycle'" size="small" type="info">系統</el-tag>
                <el-tag v-else size="small" effect="plain">補登</el-tag>
              </template>
              <div class="record-actions">
                <template v-if="isMutable(row) && canWrite">
                  <el-button size="small" link @click="openEdit(row)">編輯</el-button>
                  <el-button size="small" link type="danger" @click="handleDelete(row)">刪除</el-button>
                </template>
                <el-tooltip
                  v-else-if="!isMutable(row)"
                  content="系統自動產生的稽核紀錄不可修改"
                  placement="top"
                >
                  <el-text type="info" size="small" style="margin-left: 6px">稽核保護</el-text>
                </el-tooltip>
              </div>
            </div>
            <div class="record-body">
              <template v-if="row.record_type === 'incident'">
                <div>{{ rowPayload(row).description }}</div>
                <div v-if="rowPayload(row).action_taken" class="sub">處理：{{ rowPayload(row).action_taken }}</div>
              </template>
              <template v-else-if="row.record_type === 'assessment'">
                <div>{{ rowPayload(row).content }}</div>
                <div v-if="rowPayload(row).suggestions" class="sub">建議：{{ rowPayload(row).suggestions }}</div>
              </template>
              <template v-else-if="row.record_type === 'change_log'">
                <div v-if="rowPayload(row).reason">原因：{{ rowPayload(row).reason }}</div>
                <div v-if="rowPayload(row).notes" class="sub">備註：{{ rowPayload(row).notes }}</div>
              </template>
            </div>
          </div>
        </el-timeline-item>
      </el-timeline>
    </div>

    <!-- 分類表格 -->
    <el-tabs v-else v-model="tableTab" v-loading="loading" class="table-tabs">
      <el-tab-pane :label="`事件（${grouped.incident.length}）`" name="incident">
        <el-table :data="grouped.incident" stripe size="small" max-height="500">
          <el-table-column label="發生時間" width="150">
            <template #default="{ row }">{{ formatTimestamp(row.occurred_at) }}</template>
          </el-table-column>
          <el-table-column label="類型" width="100">
            <template #default="{ row }">
              <el-tag v-if="rowPayload(row).incident_type" :type="incidentTypeTag(rowPayload(row).incident_type)" size="small">
                {{ rowPayload(row).incident_type }}
              </el-tag>
            </template>
          </el-table-column>
          <el-table-column label="嚴重度" width="90">
            <template #default="{ row }">
              <el-tag v-if="rowPayload(row).severity" :type="severityTag(rowPayload(row).severity)" size="small">
                {{ rowPayload(row).severity }}
              </el-tag>
              <span v-else class="sub">-</span>
            </template>
          </el-table-column>
          <el-table-column label="描述" min-width="220">
            <template #default="{ row }">
              <el-tooltip :content="String(rowPayload(row).description || '')" placement="top" :show-after="500">
                <span>{{ truncate(rowPayload(row).description as string | null) }}</span>
              </el-tooltip>
            </template>
          </el-table-column>
          <el-table-column label="處理" min-width="160">
            <template #default="{ row }">
              <el-tooltip :content="String(rowPayload(row).action_taken || '')" placement="top" :show-after="500">
                <span>{{ truncate(rowPayload(row).action_taken as string | null) }}</span>
              </el-tooltip>
            </template>
          </el-table-column>
          <el-table-column label="家長" width="80" align="center">
            <template #default="{ row }">
              <el-tag v-if="rowPayload(row).parent_notified" type="success" size="small">已通知</el-tag>
              <span v-else class="sub">-</span>
            </template>
          </el-table-column>
          <el-table-column v-if="canWrite" label="操作" width="130" fixed="right">
            <template #default="{ row }">
              <el-button size="small" text @click="openEdit(row)">編輯</el-button>
              <el-button size="small" text type="danger" @click="handleDelete(row)">刪除</el-button>
            </template>
          </el-table-column>
        </el-table>
      </el-tab-pane>

      <el-tab-pane :label="`評量（${grouped.assessment.length}）`" name="assessment">
        <el-table :data="grouped.assessment" stripe size="small" max-height="500">
          <el-table-column label="日期" width="110">
            <template #default="{ row }">{{ rowPayload(row).assessment_date || '-' }}</template>
          </el-table-column>
          <el-table-column label="學期" width="100">
            <template #default="{ row }">{{ rowPayload(row).semester || '-' }}</template>
          </el-table-column>
          <el-table-column label="類型" width="90">
            <template #default="{ row }">
              <el-tag v-if="rowPayload(row).assessment_type" type="info" size="small">{{ rowPayload(row).assessment_type }}</el-tag>
            </template>
          </el-table-column>
          <el-table-column label="領域" width="130">
            <template #default="{ row }">{{ rowPayload(row).domain || '-' }}</template>
          </el-table-column>
          <el-table-column label="評等" width="80">
            <template #default="{ row }">
              <el-tag v-if="rowPayload(row).rating" :type="ratingTag(rowPayload(row).rating)" size="small">
                {{ rowPayload(row).rating }}
              </el-tag>
              <span v-else class="sub">-</span>
            </template>
          </el-table-column>
          <el-table-column label="內容" min-width="220">
            <template #default="{ row }">
              <el-tooltip :content="String(rowPayload(row).content || '')" placement="top" :show-after="500">
                <span>{{ truncate(rowPayload(row).content as string | null) }}</span>
              </el-tooltip>
            </template>
          </el-table-column>
          <el-table-column label="建議" min-width="160">
            <template #default="{ row }">
              <el-tooltip :content="String(rowPayload(row).suggestions || '')" placement="top" :show-after="500">
                <span>{{ truncate(rowPayload(row).suggestions as string | null) }}</span>
              </el-tooltip>
            </template>
          </el-table-column>
          <el-table-column v-if="canWrite" label="操作" width="130" fixed="right">
            <template #default="{ row }">
              <el-button size="small" text @click="openEdit(row)">編輯</el-button>
              <el-button size="small" text type="danger" @click="handleDelete(row)">刪除</el-button>
            </template>
          </el-table-column>
        </el-table>
      </el-tab-pane>

      <el-tab-pane label="請假" name="leave">
        <LeaveSection
          :student-id="studentId"
          :active="active && tableTab === 'leave'"
          @jump-attendance="handleJumpAttendance"
        />
      </el-tab-pane>

      <el-tab-pane :label="`異動（${grouped.change_log.length}）`" name="change_log">
        <el-table :data="grouped.change_log" stripe size="small" max-height="500">
          <el-table-column label="異動日期" width="110">
            <template #default="{ row }">{{ rowPayload(row).event_date || '-' }}</template>
          </el-table-column>
          <el-table-column label="學年" width="80">
            <template #default="{ row }">{{ rowPayload(row).school_year || '-' }}</template>
          </el-table-column>
          <el-table-column label="學期" width="70">
            <template #default="{ row }">
              <span v-if="rowPayload(row).semester">{{ rowPayload(row).semester === 1 ? '上' : '下' }}</span>
              <span v-else class="sub">-</span>
            </template>
          </el-table-column>
          <el-table-column label="異動類型" width="110">
            <template #default="{ row }">
              <el-tag v-if="rowPayload(row).event_type" type="warning" size="small">{{ rowPayload(row).event_type }}</el-tag>
            </template>
          </el-table-column>
          <el-table-column label="來源" width="80">
            <template #default="{ row }">
              <el-tag v-if="rowPayload(row).source === 'lifecycle'" size="small" type="info">系統</el-tag>
              <el-tag v-else size="small" effect="plain">補登</el-tag>
            </template>
          </el-table-column>
          <el-table-column label="原因" min-width="160">
            <template #default="{ row }">
              <el-tooltip :content="String(rowPayload(row).reason || '')" placement="top" :show-after="500">
                <span>{{ truncate(rowPayload(row).reason as string | null) }}</span>
              </el-tooltip>
            </template>
          </el-table-column>
          <el-table-column label="備註" min-width="160">
            <template #default="{ row }">
              <el-tooltip :content="String(rowPayload(row).notes || '')" placement="top" :show-after="500">
                <span>{{ truncate(rowPayload(row).notes as string | null) }}</span>
              </el-tooltip>
            </template>
          </el-table-column>
          <el-table-column v-if="canWrite" label="操作" width="130" fixed="right">
            <template #default="{ row }">
              <template v-if="isMutable(row)">
                <el-button size="small" text @click="openEdit(row)">編輯</el-button>
                <el-button size="small" text type="danger" @click="handleDelete(row)">刪除</el-button>
              </template>
              <el-tooltip v-else content="系統自動紀錄，稽核保護" placement="top">
                <el-text type="info" size="small">—</el-text>
              </el-tooltip>
            </template>
          </el-table-column>
        </el-table>
      </el-tab-pane>
    </el-tabs>

    <IncidentEditorDialog
      v-model:visible="incidentDialog.visible"
      :mode="incidentDialog.mode"
      :initial="incidentDialog.initial"
      :lock-student="true"
      :default-student-id="studentId"
      :default-classroom-id="classroomId"
      @submitted="fetchData"
    />
    <AssessmentEditorDialog
      v-model:visible="assessmentDialog.visible"
      :mode="assessmentDialog.mode"
      :initial="assessmentDialog.initial"
      :lock-student="true"
      :default-student-id="studentId"
      :default-classroom-id="classroomId"
      @submitted="fetchData"
    />
    <ChangeLogEditorDialog
      v-model:visible="changeLogDialog.visible"
      :mode="changeLogDialog.mode"
      :initial="changeLogDialog.initial"
      :lock-student="true"
      :default-student-id="studentId"
      @submitted="fetchData"
    />
  </div>
</template>

<style scoped>
.filter-bar {
  display: flex;
  gap: 10px;
  align-items: center;
  flex-wrap: wrap;
  margin-bottom: 14px;
}
.stat-row {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
  margin-left: auto;
}
.timeline-wrap {
  max-height: 580px;
  overflow-y: auto;
  padding-right: 6px;
}
.table-tabs :deep(.el-tabs__header) {
  margin-bottom: 8px;
}
.record-card {
  padding: 4px 0;
}
.record-head {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
  margin-bottom: 6px;
}
.record-actions {
  margin-left: auto;
}
.record-body {
  color: var(--el-text-color-regular);
  line-height: 1.5;
}
.sub {
  color: var(--el-text-color-secondary);
  font-size: 0.85em;
}
</style>
