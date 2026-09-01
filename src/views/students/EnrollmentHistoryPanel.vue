<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Camera } from '@element-plus/icons-vue'
import {
  createHeadcountSnapshot,
  getHeadcountChanges,
  getHeadcountHistory,
  getSnapshotMembers,
} from '@/api/studentEnrollment'
import type { Schema } from '@/api/_generated/typed'
import { useAcademicTermStore } from '@/stores/academicTerm'
import { hasPermission } from '@/utils/auth'
import { apiError } from '@/utils/error'
import { LineChart } from '@/composables/useChartJs'
import {
  buildComparisonRows,
  buildTrendChartData,
  classColumnNames,
  diffRosters,
  type RosterMemberDto,
  type SnapshotEntryDto,
} from '@/utils/enrollmentHistory'

// 生成型別（openapi-typescript）已含此形狀，不再重複宣告一份 local interface。
type ChangeEventDto = Schema<'HeadcountChangeEvent'>

const termStore = useAcademicTermStore()
const loading = ref(false)
const snapshots = ref<SnapshotEntryDto[]>([])
const selectedClasses = ref<string[]>([])
const canWrite = computed(() => hasPermission('STUDENTS_WRITE'))

const fetchHistory = async () => {
  loading.value = true
  try {
    const res = await getHeadcountHistory({
      school_year: termStore.school_year,
      semester: termStore.semester,
    })
    snapshots.value = res.data.snapshots
  } catch (e) {
    ElMessage.error(apiError(e, '載入人數變化失敗'))
  } finally {
    loading.value = false
  }
}

onMounted(fetchHistory)
watch(() => [termStore.school_year, termStore.semester], fetchHistory)

const columnNames = computed(() => classColumnNames(snapshots.value))
const tableRows = computed(() => buildComparisonRows(snapshots.value))
const chartData = computed(() => {
  const d = buildTrendChartData(snapshots.value, selectedClasses.value)
  return {
    labels: d.labels,
    datasets: d.datasets.map((ds, i) => ({
      ...ds,
      borderColor: ['#409eff', '#67c23a', '#e6a23c', '#f56c6c', '#909399'][i % 5],
      backgroundColor: 'transparent',
      tension: 0.2,
      spanGaps: false,
    })),
  }
})
const chartOptions = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: { legend: { position: 'top' as const } },
  scales: { y: { beginAtZero: true } },
} as unknown as Record<string, unknown>

// ── 區間明細 drawer ──────────────────────────────────────────────
const drawerVisible = ref(false)
const drawerLoading = ref(false)
const intervalLabel = ref('')
const events = ref<ChangeEventDto[]>([])
const rosterDiff = ref<ReturnType<typeof diffRosters> | null>(null)

const openInterval = async (rowIndex: number) => {
  if (rowIndex === 0) return
  const from = snapshots.value[rowIndex - 1].snapshot_date
  const to = snapshots.value[rowIndex].snapshot_date
  intervalLabel.value = `${from} → ${to}`
  drawerVisible.value = true
  drawerLoading.value = true
  try {
    const [changesRes, beforeRes, afterRes] = await Promise.all([
      getHeadcountChanges({ date_from: from, date_to: to }),
      getSnapshotMembers({ date: from }),
      getSnapshotMembers({ date: to }),
    ])
    events.value = changesRes.data.events
    const before: RosterMemberDto[] = beforeRes.data.members
    const after: RosterMemberDto[] = afterRes.data.members
    rosterDiff.value = diffRosters(before, after)
  } catch (e) {
    ElMessage.error(apiError(e, '載入異動明細失敗'))
  } finally {
    drawerLoading.value = false
  }
}

// ── 手動拍照 ────────────────────────────────────────────────────
const capturing = ref(false)
const captureToday = async () => {
  capturing.value = true
  try {
    await createHeadcountSnapshot({ overwrite: false })
    ElMessage.success('已建立今日快照')
    await fetchHistory()
  } catch (e: unknown) {
    const status = (e as { response?: { status?: number } }).response?.status
    if (status === 409) {
      try {
        await ElMessageBox.confirm('今日快照已存在，要重拍覆蓋嗎？', '重拍確認', {
          type: 'warning',
        })
        await createHeadcountSnapshot({ overwrite: true })
        ElMessage.success('已重拍今日快照')
        await fetchHistory()
      } catch {
        /* 使用者取消 */
      }
    } else {
      ElMessage.error(apiError(e, '建立快照失敗'))
    }
  } finally {
    capturing.value = false
  }
}

const rowClassName = ({ row }: { row: { snapshot_type: string } }) =>
  row.snapshot_type === 'semester_start' ? 'row-semester-start' : ''
const typeLabel = (t: string) =>
  t === 'semester_start' ? '學期初' : t === 'month_start' ? '月初' : '手動'
const deltaClass = (d: number | null) =>
  d == null || d === 0 ? '' : d > 0 ? 'delta-up' : 'delta-down'
const deltaText = (d: number | null) => (d == null ? '' : d > 0 ? `+${d}` : `${d}`)
</script>

<template>
  <div v-loading="loading" class="enrollment-history-panel">
    <div class="panel-actions">
      <el-select
        v-model="selectedClasses"
        multiple
        collapse-tags
        placeholder="疊加班級曲線"
        style="width: 260px"
      >
        <el-option v-for="n in columnNames" :key="n" :label="n" :value="n" />
      </el-select>
      <el-button
        v-if="canWrite"
        :icon="Camera"
        :loading="capturing"
        @click="captureToday"
      >
        手動拍照
      </el-button>
    </div>

    <el-card shadow="never" class="chart-card">
      <template #header><span class="card-header-title">在籍人數趨勢</span></template>
      <div class="chart-wrapper">
        <component
          :is="LineChart"
          v-if="snapshots.length"
          :data="chartData"
          :options="chartOptions"
        />
        <el-empty v-else-if="!loading" description="本學期尚無快照" :image-size="80" />
      </div>
    </el-card>

    <el-card shadow="never" class="table-card">
      <template #header>
        <span class="card-header-title">快照對照表</span>
        <span class="card-header-meta">點列查看與前一快照間的異動明細</span>
      </template>
      <el-table
        :data="tableRows"
        border
        style="width: 100%"
        :row-class-name="rowClassName"
      >
        <el-table-column label="快照日" min-width="130">
          <template #default="{ row, $index }">
            <el-link type="primary" :underline="false" @click="openInterval($index)">
              {{ row.snapshot_date }}
            </el-link>
            <el-tag v-if="row.source === 'backfill'" size="small" type="info">回推</el-tag>
            <el-tag v-if="row.snapshot_type === 'semester_start'" size="small" type="success">
              {{ typeLabel(row.snapshot_type) }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="全校" width="110" align="center">
          <template #default="{ row }">
            <span class="num-total">{{ row.school_total }}</span>
            <span :class="deltaClass(row.school_delta)" class="delta">
              {{ deltaText(row.school_delta) }}
            </span>
          </template>
        </el-table-column>
        <el-table-column
          v-for="name in columnNames"
          :key="name"
          :label="name"
          width="100"
          align="center"
        >
          <template #default="{ row }">
            <template v-if="row.cells[name]">
              {{ row.cells[name].total }}
              <span :class="deltaClass(row.cells[name].delta)" class="delta">
                {{ deltaText(row.cells[name].delta) }}
              </span>
            </template>
            <span v-else class="cell-empty">—</span>
          </template>
        </el-table-column>
      </el-table>
    </el-card>

    <el-drawer v-model="drawerVisible" :title="`異動明細 ${intervalLabel}`" size="46%">
      <div v-loading="drawerLoading">
        <template v-if="rosterDiff">
          <h4>名冊差集</h4>
          <p class="diff-line">
            新增 {{ rosterDiff.joined.length }} 人：
            {{ rosterDiff.joined.map((m) => m.student_name).join('、') || '—' }}
          </p>
          <p class="diff-line">
            離開 {{ rosterDiff.left.length }} 人：
            {{ rosterDiff.left.map((m) => m.student_name).join('、') || '—' }}
          </p>
          <p class="diff-line">
            轉班 {{ rosterDiff.moved.length }} 人：
            {{
              rosterDiff.moved
                .map((x) => `${x.member.student_name}（${x.fromClass ?? '未分班'}→${x.toClass ?? '未分班'}）`)
                .join('、') || '—'
            }}
          </p>
        </template>
        <h4>逐筆事件</h4>
        <el-table :data="events" size="small" border>
          <el-table-column prop="event_date" label="日期" width="110" />
          <el-table-column prop="event_kind" label="事件" width="90" />
          <el-table-column prop="student_name" label="學生" width="100" />
          <el-table-column label="班級" min-width="140">
            <template #default="{ row }">
              {{ row.from_classroom_name ?? '—' }} → {{ row.to_classroom_name ?? '—' }}
            </template>
          </el-table-column>
          <el-table-column prop="reason" label="事由" min-width="100">
            <template #default="{ row }">{{ row.reason ?? '—' }}</template>
          </el-table-column>
        </el-table>
        <el-empty v-if="!drawerLoading && !events.length" description="區間內無事件紀錄" :image-size="60" />
      </div>
    </el-drawer>
  </div>
</template>

<style scoped>
.panel-actions {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: var(--space-4, 16px);
}
.chart-card,
.table-card {
  margin-bottom: var(--space-4, 16px);
}
.card-header-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary);
}
.card-header-meta {
  margin-left: 8px;
  font-size: 12px;
  color: var(--text-tertiary);
}
.chart-wrapper {
  height: 320px;
  position: relative;
}
.num-total {
  font-weight: 600;
}
.delta {
  margin-left: 4px;
  font-size: 12px;
}
.delta-up {
  color: var(--color-success, #67c23a);
}
.delta-down {
  color: var(--color-danger, #f56c6c);
}
.cell-empty {
  color: var(--neutral-300);
}
.diff-line {
  font-size: 13px;
  color: var(--text-secondary);
  margin: 4px 0;
}
:deep(.row-semester-start) td {
  background-color: #f0f9eb !important;
}
</style>
