<script setup>
import { ref, onMounted, computed } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { hasPermission } from '@/utils/auth'
import {
  listMeasurements,
  fetchMeasurementChart,
  deleteMeasurement,
} from '@/api/studentMeasurements'
import MeasurementChart from '@/components/student/MeasurementChart.vue'
import MeasurementEditorDialog from '@/components/student/MeasurementEditorDialog.vue'

const props = defineProps({
  studentId: { type: Number, required: true },
})

const METRIC_OPTIONS = [
  { label: '身高', value: 'height' },
  { label: '體重', value: 'weight' },
  { label: '頭圍', value: 'head_circumference' },
  { label: '左眼視力', value: 'vision_left' },
  { label: '右眼視力', value: 'vision_right' },
]

const list = ref([])
const chart = ref({})
const loading = ref(false)
const dialogVisible = ref(false)
const editing = ref(null)
const metric = ref('height')

const canWrite = computed(() => hasPermission('PORTFOLIO_WRITE'))

async function reload() {
  loading.value = true
  try {
    const [listResp, chartResp] = await Promise.all([
      listMeasurements(props.studentId, { limit: 200 }),
      fetchMeasurementChart(props.studentId),
    ])
    list.value = listResp.data.items || []
    chart.value = chartResp.data || {}
  } catch (e) {
    const msg = e?.response?.data?.detail || '載入量測紀錄失敗'
    ElMessage.error(msg)
  } finally {
    loading.value = false
  }
}

function onAdd() {
  editing.value = null
  dialogVisible.value = true
}

function onEdit(row) {
  editing.value = { ...row }
  dialogVisible.value = true
}

async function onDelete(row) {
  try {
    await ElMessageBox.confirm('確定刪除這筆量測紀錄？', '刪除確認', { type: 'warning' })
    await deleteMeasurement(props.studentId, row.id)
    ElMessage.success('已刪除')
    await reload()
  } catch (e) {
    if (e !== 'cancel') {
      const msg = e?.response?.data?.detail || '刪除失敗'
      ElMessage.error(msg)
    }
  }
}

function formatNum(v) {
  if (v === null || v === undefined) return '—'
  return Number(v).toFixed(2)
}

onMounted(reload)
</script>

<template>
  <div class="measurements-section">
    <div class="toolbar">
      <el-button v-if="canWrite" type="primary" @click="onAdd">新增量測</el-button>
    </div>

    <div class="chart-area">
      <div class="metric-selector">
        <el-radio-group v-model="metric" size="small">
          <el-radio-button
            v-for="opt in METRIC_OPTIONS"
            :key="opt.value"
            :label="opt.value"
          >
            {{ opt.label }}
          </el-radio-button>
        </el-radio-group>
      </div>
      <MeasurementChart :data="chart" :metric="metric" />
    </div>

    <div v-loading="loading" class="list-area">
      <el-empty v-if="!loading && list.length === 0" description="尚無量測紀錄" />

      <el-table v-else :data="list" stripe size="small">
        <el-table-column label="量測日期" prop="measured_on" width="120" />
        <el-table-column label="身高 (cm)" width="110">
          <template #default="{ row }">{{ formatNum(row.height_cm) }}</template>
        </el-table-column>
        <el-table-column label="體重 (kg)" width="110">
          <template #default="{ row }">{{ formatNum(row.weight_kg) }}</template>
        </el-table-column>
        <el-table-column label="頭圍 (cm)" width="110">
          <template #default="{ row }">{{ formatNum(row.head_circumference_cm) }}</template>
        </el-table-column>
        <el-table-column label="左眼" width="80">
          <template #default="{ row }">{{ formatNum(row.vision_left) }}</template>
        </el-table-column>
        <el-table-column label="右眼" width="80">
          <template #default="{ row }">{{ formatNum(row.vision_right) }}</template>
        </el-table-column>
        <el-table-column label="備註" prop="note" min-width="120" show-overflow-tooltip />
        <el-table-column v-if="canWrite" label="操作" width="120" fixed="right">
          <template #default="{ row }">
            <el-button type="primary" link size="small" @click="onEdit(row)">編輯</el-button>
            <el-button type="danger" link size="small" @click="onDelete(row)">刪除</el-button>
          </template>
        </el-table-column>
      </el-table>
    </div>

    <MeasurementEditorDialog
      v-model="dialogVisible"
      :student-id="studentId"
      :measurement="editing"
      @saved="reload"
    />
  </div>
</template>

<style scoped>
.measurements-section {
  padding: 12px 0;
}

.toolbar {
  margin-bottom: 12px;
}

.chart-area {
  margin-bottom: 16px;
}

.metric-selector {
  margin-bottom: 8px;
}

.list-area {
  margin-top: 8px;
}
</style>
