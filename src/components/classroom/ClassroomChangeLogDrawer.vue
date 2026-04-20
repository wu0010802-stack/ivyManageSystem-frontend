<script setup>
import { ref, computed, watch, defineAsyncComponent } from 'vue'
import { ElMessage } from 'element-plus'
import { Download } from '@element-plus/icons-vue'
import { useAcademicTermStore } from '@/stores/academicTerm'
import { getCurrentAcademicTerm } from '@/utils/academic'
import {
  getChangeLogs,
  getChangeLogsSummary,
  exportChangeLogs,
} from '@/api/studentChangeLogs'
import { getCommunications } from '@/api/studentCommunications'
import { getClassroomEnrollmentComposition } from '@/api/classrooms'
import { apiError } from '@/utils/error'

const props = defineProps({
  visible: { type: Boolean, default: false },
  classroom: { type: Object, default: null },
})
const emit = defineEmits(['update:visible'])
const updateVisible = (v) => emit('update:visible', v)

// ── 學期 ───────────────────────────────────────
const termStore = useAcademicTermStore()
const currentTerm = getCurrentAcademicTerm()
const semLabel = (s) => (s === 1 ? '上學期' : '下學期')
const makeTerm = (sy, sem) => ({
  key: `${sy}-${sem}`,
  school_year: sy,
  semester: sem,
  label: `${sy}學年度 ${semLabel(sem)}`,
})

const termOptions = computed(() => {
  const { school_year: cy, semester: cs } = currentTerm
  const prev = cs === 1 ? { school_year: cy - 1, semester: 2 } : { school_year: cy, semester: 1 }
  const next = cs === 1 ? { school_year: cy, semester: 2 } : { school_year: cy + 1, semester: 1 }
  return [
    makeTerm(prev.school_year, prev.semester),
    { ...makeTerm(cy, cs), label: `${cy}學年度 ${semLabel(cs)}（本學期）` },
    makeTerm(next.school_year, next.semester),
  ]
})

const selectedTermKey = computed({
  get: () => `${termStore.school_year}-${termStore.semester}`,
  set: (val) => {
    const [y, s] = val.split('-').map(Number)
    termStore.setTerm(y, s)
  },
})

// ── Tabs ──────────────────────────────────────
const activeTab = ref('timeline')

// ── 異動時間軸 ─────────────────────────────────
const EVENT_TYPES = ['入學', '復學', '退學', '轉出', '轉入', '畢業', '休學']
const filterEventTypes = ref([])
const logs = ref([])
const logsLoading = ref(false)
const summary = ref(null)
const logsTotal = ref(0)
const logsPage = ref(1)
const LOGS_PAGE_SIZE = 50

const eventTagType = (type) => {
  const map = { 入學: 'success', 復學: 'success', 退學: 'danger', 轉出: 'warning', 轉入: 'primary', 畢業: 'info', 休學: 'info' }
  return map[type] || ''
}

const termParams = () => ({
  school_year: termStore.school_year,
  semester: termStore.semester,
  classroom_id: props.classroom?.id,
})

const fetchLogs = async () => {
  if (!props.classroom?.id) return
  logsLoading.value = true
  try {
    const params = {
      ...termParams(),
      page: logsPage.value,
      page_size: LOGS_PAGE_SIZE,
    }
    if (filterEventTypes.value.length) params.event_type = filterEventTypes.value
    const res = await getChangeLogs(params)
    logs.value = res.data.items
    logsTotal.value = res.data.total
  } catch (e) {
    ElMessage.error(apiError(e, '載入異動紀錄失敗'))
  } finally {
    logsLoading.value = false
  }
}

const fetchSummary = async () => {
  if (!props.classroom?.id) return
  try {
    const res = await getChangeLogsSummary(termParams())
    summary.value = res.data.summary
  } catch {
    summary.value = null
  }
}

const statsCards = computed(() => {
  const s = summary.value || {}
  const enter = (s['入學'] || 0) + (s['復學'] || 0) + (s['轉入'] || 0)
  const leave = (s['退學'] || 0) + (s['轉出'] || 0) + (s['畢業'] || 0) + (s['休學'] || 0)
  const base = props.classroom?.students?.length ?? 0
  const retention = base > 0 ? Math.round(((base - leave) / base) * 100) : null
  return { enter, leave, net: enter - leave, retention }
})

const eventText = (log) => {
  const name = log.student_name || '—'
  switch (log.event_type) {
    case '入學':
    case '復學':
      return `${name} ${log.event_type}${log.classroom_name ? `（${log.classroom_name}）` : ''}`
    case '轉出':
      return `${name} 轉出到 ${log.to_classroom_name || '—'}`
    case '轉入':
      return `${name} 從 ${log.from_classroom_name || '—'} 轉入`
    case '退學':
    case '休學':
    case '畢業':
      return `${name} ${log.event_type}`
    default:
      return `${name} ${log.event_type}`
  }
}

const handleExport = async () => {
  try {
    const params = { ...termParams() }
    if (filterEventTypes.value.length) params.event_type = filterEventTypes.value
    const res = await exportChangeLogs(params)
    const blob = new Blob([res.data], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${props.classroom?.name || 'classroom'}_異動紀錄.csv`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  } catch (e) {
    ElMessage.error(apiError(e, '匯出失敗'))
  }
}

// ── 家長溝通 ─────────────────────────────────
const communications = ref([])
const commsLoading = ref(false)

const fetchCommunications = async () => {
  if (!props.classroom?.id) return
  commsLoading.value = true
  try {
    const today = new Date()
    const from = new Date(today)
    from.setDate(today.getDate() - 30)
    const fmt = (d) => d.toISOString().slice(0, 10)
    const res = await getCommunications({
      classroom_id: props.classroom.id,
      date_from: fmt(from),
      date_to: fmt(today),
      page_size: 100,
    })
    communications.value = res.data.items
  } catch (e) {
    ElMessage.error(apiError(e, '載入家長溝通紀錄失敗'))
  } finally {
    commsLoading.value = false
  }
}

// ── 身分比例 ─────────────────────────────────
let _chartReady = null
const ensureChartReady = () => {
  if (!_chartReady) {
    _chartReady = import('chart.js').then(({
      Chart, ArcElement, Tooltip, Legend,
    }) => {
      Chart.register(ArcElement, Tooltip, Legend)
    })
  }
  return _chartReady
}
const DoughnutChart = defineAsyncComponent(() =>
  ensureChartReady().then(() => import('vue-chartjs').then(m => m.Doughnut))
)

const composition = ref(null)
const compLoading = ref(false)
const fetchComposition = async () => {
  if (!props.classroom?.id) return
  compLoading.value = true
  try {
    const res = await getClassroomEnrollmentComposition(props.classroom.id)
    composition.value = res.data
  } catch (e) {
    ElMessage.error(apiError(e, '載入身分比例失敗'))
  } finally {
    compLoading.value = false
  }
}

const doughnutData = computed(() => {
  if (!composition.value) return null
  const counts = composition.value.counts || {}
  const total = composition.value.total ?? 0
  const tagged = Object.values(counts).reduce((a, b) => a + b, 0)
  const normal = Math.max(total - tagged, 0)
  return {
    labels: ['一般', '新生', '不足齡', '特教生', '原住民'],
    datasets: [
      {
        data: [normal, counts['新生'] || 0, counts['不足齡'] || 0, counts['特教生'] || 0, counts['原住民'] || 0],
        backgroundColor: [
          'rgba(148, 163, 184, 0.7)',
          'rgba(16, 185, 129, 0.8)',
          'rgba(245, 158, 11, 0.8)',
          'rgba(139, 92, 246, 0.8)',
          'rgba(59, 130, 246, 0.8)',
        ],
      },
    ],
  }
})

const doughnutOptions = { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom' } } }

// ── drawer 開關時 / 學期切換 / filter 變化 → 重新載入 ──
const reloadAll = () => {
  logsPage.value = 1
  fetchLogs()
  fetchSummary()
  if (activeTab.value === 'comms') fetchCommunications()
  if (activeTab.value === 'composition') fetchComposition()
}

watch(
  () => [props.visible, props.classroom?.id],
  ([vis, id]) => {
    if (vis && id) reloadAll()
  },
)
watch(selectedTermKey, () => {
  if (props.visible) reloadAll()
})
watch(filterEventTypes, () => {
  if (props.visible) {
    logsPage.value = 1
    fetchLogs()
  }
})
watch(activeTab, (tab) => {
  if (!props.visible) return
  if (tab === 'comms' && !communications.value.length) fetchCommunications()
  if (tab === 'composition' && !composition.value) fetchComposition()
})
</script>

<template>
  <el-drawer
    :model-value="visible"
    :title="`${classroom?.name ?? '班級'} 異動紀錄`"
    direction="rtl"
    size="680px"
    @update:model-value="updateVisible"
  >
    <el-tabs v-model="activeTab" style="margin-top: -8px;">
      <!-- ════ Tab 1: 異動時間軸 ════ -->
      <el-tab-pane label="異動時間軸" name="timeline">
        <!-- 統計卡 -->
        <el-row :gutter="8" class="stats-row">
          <el-col :span="6">
            <div class="stat-card stat-enter">
              <div class="stat-value">{{ statsCards.enter }}</div>
              <div class="stat-label">收 入</div>
            </div>
          </el-col>
          <el-col :span="6">
            <div class="stat-card stat-leave">
              <div class="stat-value">{{ statsCards.leave }}</div>
              <div class="stat-label">離 班</div>
            </div>
          </el-col>
          <el-col :span="6">
            <div class="stat-card stat-net">
              <div class="stat-value">{{ statsCards.net >= 0 ? `+${statsCards.net}` : statsCards.net }}</div>
              <div class="stat-label">淨異動</div>
            </div>
          </el-col>
          <el-col :span="6">
            <div class="stat-card stat-ratio">
              <div class="stat-value">{{ statsCards.retention !== null ? `${statsCards.retention}%` : '—' }}</div>
              <div class="stat-label">保留率</div>
            </div>
          </el-col>
        </el-row>

        <!-- Toolbar -->
        <div class="toolbar">
          <el-select v-model="selectedTermKey" size="small" style="width: 220px;">
            <el-option v-for="t in termOptions" :key="t.key" :label="t.label" :value="t.key" />
          </el-select>
          <el-select
            v-model="filterEventTypes"
            multiple
            collapse-tags
            collapse-tags-tooltip
            placeholder="類型"
            size="small"
            style="width: 200px;"
          >
            <el-option v-for="et in EVENT_TYPES" :key="et" :label="et" :value="et" />
          </el-select>
          <el-button size="small" :icon="Download" @click="handleExport">匯出 CSV</el-button>
        </div>

        <!-- Timeline -->
        <div v-loading="logsLoading" class="timeline-wrap">
          <el-empty v-if="!logsLoading && !logs.length" description="本學期無異動紀錄" />
          <el-timeline v-else>
            <el-timeline-item
              v-for="log in logs"
              :key="log.id"
              :timestamp="log.event_date"
              placement="top"
              :type="eventTagType(log.event_type) || 'primary'"
            >
              <div class="event-line">
                <el-tag :type="eventTagType(log.event_type)" size="small" effect="light">
                  {{ log.event_type }}
                </el-tag>
                <span class="event-main">{{ eventText(log) }}</span>
              </div>
              <div v-if="log.reason" class="event-meta">原因：{{ log.reason }}</div>
              <div v-if="log.notes" class="event-meta event-notes">{{ log.notes }}</div>
            </el-timeline-item>
          </el-timeline>
        </div>

        <el-pagination
          v-if="logsTotal > LOGS_PAGE_SIZE"
          class="pager"
          :current-page="logsPage"
          :page-size="LOGS_PAGE_SIZE"
          :total="logsTotal"
          layout="prev, pager, next, total"
          @current-change="(p) => { logsPage = p; fetchLogs() }"
        />
      </el-tab-pane>

      <!-- ════ Tab 2: 家長溝通 ════ -->
      <el-tab-pane label="家長溝通（近 30 天）" name="comms">
        <div v-loading="commsLoading">
          <el-empty v-if="!commsLoading && !communications.length" description="近 30 天無溝通紀錄" />
          <el-timeline v-else>
            <el-timeline-item
              v-for="c in communications"
              :key="c.id"
              :timestamp="c.communication_date"
              placement="top"
            >
              <div class="event-line">
                <el-tag size="small">{{ c.communication_type }}</el-tag>
                <span class="event-main">{{ c.student_name }}</span>
                <span v-if="c.topic" class="comm-topic">— {{ c.topic }}</span>
              </div>
              <div class="event-meta comm-content">{{ c.content }}</div>
              <div v-if="c.follow_up" class="event-meta comm-followup">後續：{{ c.follow_up }}</div>
            </el-timeline-item>
          </el-timeline>
        </div>
      </el-tab-pane>

      <!-- ════ Tab 3: 身分比例 ════ -->
      <el-tab-pane label="身分比例" name="composition">
        <div v-loading="compLoading" class="comp-wrap">
          <el-empty v-if="!compLoading && !doughnutData" description="尚無資料" />
          <template v-else>
            <div class="comp-chart">
              <component :is="DoughnutChart" v-if="doughnutData" :data="doughnutData" :options="doughnutOptions" />
            </div>
            <div class="comp-summary">
              <div>在籍總人數：<b>{{ composition?.total ?? 0 }}</b></div>
              <div v-for="(v, k) in (composition?.counts || {})" :key="k">
                {{ k }}：<b>{{ v }}</b>
                <span class="comp-ratio">（{{ composition?.total ? Math.round(v / composition.total * 100) : 0 }}%）</span>
              </div>
            </div>
            <div class="comp-hint">目前為當下快照；時間軸回放功能尚待實作</div>
          </template>
        </div>
      </el-tab-pane>
    </el-tabs>
  </el-drawer>
</template>

<style scoped>
.stats-row { margin-bottom: 12px; }
.stat-card {
  text-align: center;
  border: 1px solid #e5e7eb;
  border-radius: 6px;
  padding: 8px 4px;
  background: #fff;
}
.stat-value { font-size: 20px; font-weight: 700; line-height: 1.2; }
.stat-label { font-size: 12px; color: #64748b; margin-top: 2px; }
.stat-enter .stat-value { color: #16a34a; }
.stat-leave .stat-value { color: #dc2626; }
.stat-net .stat-value { color: #2563eb; }
.stat-ratio .stat-value { color: #7c3aed; }

.toolbar { display: flex; gap: 8px; margin-bottom: 12px; flex-wrap: wrap; }
.timeline-wrap { min-height: 120px; }
.event-line { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.event-main { font-weight: 500; color: #1e293b; }
.event-meta { margin-top: 4px; color: #64748b; font-size: 12px; }
.event-notes { color: #94a3b8; }
.pager { margin-top: 12px; text-align: right; }

.comm-topic { color: #475569; font-size: 13px; }
.comm-content { color: #334155; }
.comm-followup { color: #2563eb; }

.comp-wrap { padding: 8px 0; }
.comp-chart { height: 240px; margin-bottom: 16px; }
.comp-summary { font-size: 14px; line-height: 1.9; padding: 8px 12px; background: #f8fafc; border-radius: 6px; }
.comp-summary b { color: #1e293b; }
.comp-ratio { color: #94a3b8; font-size: 12px; }
.comp-hint { margin-top: 12px; font-size: 12px; color: #94a3b8; text-align: center; }
</style>
