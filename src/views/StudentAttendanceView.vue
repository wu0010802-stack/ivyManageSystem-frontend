<script setup>
import { ref, reactive, computed, watch } from 'vue'
import { getClassrooms } from '@/api/classrooms'
import { getDailyAttendance, batchSaveAttendance, getMonthlySummary } from '@/api/studentAttendance'
import { ElMessage } from 'element-plus'

const STATUS_OPTIONS = ['出席', '缺席', '病假', '事假', '遲到']
const STATUS_TYPE = { 出席: 'success', 缺席: 'danger', 病假: 'warning', 事假: 'info', 遲到: '' }

// ── 共用 ──────────────────────────────────────────────
const classrooms = ref([])
const selectedClassroom = ref(null)
const activeTab = ref('daily')

// ── 每日點名 ──────────────────────────────────────────
const selectedDate = ref(new Date().toISOString().slice(0, 10))
const dailyRecords = ref([])
const dailyLoading = ref(false)
const saving = ref(false)

const allPresent = computed(() =>
  dailyRecords.value.length > 0 &&
  dailyRecords.value.every(r => r.status === '出席')
)

const fetchDaily = async () => {
  if (!selectedClassroom.value || !selectedDate.value) return
  dailyLoading.value = true
  try {
    const res = await getDailyAttendance({
      date: selectedDate.value,
      classroom_id: selectedClassroom.value,
    })
    // 未點名的預設填「出席」
    dailyRecords.value = res.data.records.map(r => ({
      ...r,
      status: r.status ?? '出席',
      remark: r.remark ?? '',
    }))
  } catch {
    ElMessage.error('載入出席資料失敗')
  } finally {
    dailyLoading.value = false
  }
}

const markAll = (status) => {
  dailyRecords.value.forEach(r => { r.status = status })
}

const saveDaily = async () => {
  if (!dailyRecords.value.length) return
  saving.value = true
  try {
    await batchSaveAttendance({
      date: selectedDate.value,
      entries: dailyRecords.value.map(r => ({
        student_id: r.student_id,
        status: r.status,
        remark: r.remark || null,
      })),
    })
    ElMessage.success('點名儲存成功')
  } catch (e) {
    ElMessage.error(e.response?.data?.detail ?? '儲存失敗')
  } finally {
    saving.value = false
  }
}

// ── 月統計 ─────────────────────────────────────────────
const monthPicker = ref(new Date().toISOString().slice(0, 7))
const monthlyData = ref([])
const monthlyLoading = ref(false)

const fetchMonthly = async () => {
  if (!selectedClassroom.value || !monthPicker.value) return
  const [year, month] = monthPicker.value.split('-')
  monthlyLoading.value = true
  try {
    const res = await getMonthlySummary({
      classroom_id: selectedClassroom.value,
      year: Number(year),
      month: Number(month),
    })
    monthlyData.value = res.data.students
  } catch {
    ElMessage.error('載入月統計失敗')
  } finally {
    monthlyLoading.value = false
  }
}

// ── 切換班級/日期自動重新載入 ─────────────────────────
watch([selectedClassroom, selectedDate], () => {
  if (activeTab.value === 'daily') fetchDaily()
})
watch([selectedClassroom, monthPicker], () => {
  if (activeTab.value === 'monthly') fetchMonthly()
})
watch(activeTab, (tab) => {
  if (tab === 'daily') fetchDaily()
  else fetchMonthly()
})

// ── 初始化 ─────────────────────────────────────────────
;(async () => {
  try {
    const res = await getClassrooms()
    classrooms.value = res.data
    if (classrooms.value.length) {
      selectedClassroom.value = classrooms.value[0].id
    }
  } catch {
    ElMessage.error('載入班級失敗')
  }
})()
</script>

<template>
  <div class="sa-page">
    <div class="page-header">
      <h2>學生出席紀錄</h2>
    </div>

    <!-- 班級選擇 -->
    <div class="toolbar">
      <el-select v-model="selectedClassroom" placeholder="選擇班級" style="width: 160px">
        <el-option v-for="c in classrooms" :key="c.id" :label="c.name" :value="c.id" />
      </el-select>
    </div>

    <el-tabs v-model="activeTab" style="margin-top: 16px">
      <!-- ── 每日點名 ── -->
      <el-tab-pane label="每日點名" name="daily">
        <div class="daily-toolbar">
          <el-date-picker
            v-model="selectedDate"
            type="date"
            value-format="YYYY-MM-DD"
            placeholder="選擇日期"
            style="width: 150px"
          />
          <el-button-group style="margin-left: 12px">
            <el-button size="small" type="success" @click="markAll('出席')">全部出席</el-button>
            <el-button size="small" type="danger"  @click="markAll('缺席')">全部缺席</el-button>
          </el-button-group>
          <el-button
            type="primary"
            style="margin-left: auto"
            :loading="saving"
            :disabled="!dailyRecords.length"
            @click="saveDaily"
          >儲存點名</el-button>
        </div>

        <el-table
          v-loading="dailyLoading"
          :data="dailyRecords"
          stripe
          style="width: 100%; margin-top: 12px"
          max-height="520"
        >
          <el-table-column prop="student_no" label="學號" width="90" />
          <el-table-column prop="name" label="姓名" width="110" />
          <el-table-column label="出席狀態" width="320">
            <template #default="{ row }">
              <el-radio-group v-model="row.status" size="small">
                <el-radio-button
                  v-for="s in STATUS_OPTIONS"
                  :key="s"
                  :value="s"
                >{{ s }}</el-radio-button>
              </el-radio-group>
            </template>
          </el-table-column>
          <el-table-column label="備註">
            <template #default="{ row }">
              <el-input v-model="row.remark" placeholder="選填" size="small" clearable />
            </template>
          </el-table-column>
        </el-table>

        <div v-if="!dailyLoading && !dailyRecords.length" class="empty-hint">
          請先選擇班級與日期
        </div>
      </el-tab-pane>

      <!-- ── 月統計 ── -->
      <el-tab-pane label="月統計" name="monthly">
        <div class="daily-toolbar">
          <el-date-picker
            v-model="monthPicker"
            type="month"
            value-format="YYYY-MM"
            placeholder="選擇月份"
            style="width: 150px"
          />
        </div>

        <el-table
          v-loading="monthlyLoading"
          :data="monthlyData"
          stripe
          style="width: 100%; margin-top: 12px"
          max-height="520"
        >
          <el-table-column prop="student_no" label="學號" width="90" />
          <el-table-column prop="name" label="姓名" width="110" />
          <el-table-column prop="出席" label="出席" width="70" align="center">
            <template #default="{ row }">
              <el-tag type="success" size="small">{{ row['出席'] }}</el-tag>
            </template>
          </el-table-column>
          <el-table-column prop="缺席" label="缺席" width="70" align="center">
            <template #default="{ row }">
              <el-tag v-if="row['缺席']" type="danger" size="small">{{ row['缺席'] }}</el-tag>
              <span v-else class="text-muted">0</span>
            </template>
          </el-table-column>
          <el-table-column prop="病假" label="病假" width="70" align="center">
            <template #default="{ row }">
              <el-tag v-if="row['病假']" type="warning" size="small">{{ row['病假'] }}</el-tag>
              <span v-else class="text-muted">0</span>
            </template>
          </el-table-column>
          <el-table-column prop="事假" label="事假" width="70" align="center">
            <template #default="{ row }">
              <el-tag v-if="row['事假']" type="info" size="small">{{ row['事假'] }}</el-tag>
              <span v-else class="text-muted">0</span>
            </template>
          </el-table-column>
          <el-table-column prop="遲到" label="遲到" width="70" align="center">
            <template #default="{ row }">
              <el-tag v-if="row['遲到']" size="small">{{ row['遲到'] }}</el-tag>
              <span v-else class="text-muted">0</span>
            </template>
          </el-table-column>
          <el-table-column prop="未點名" label="未點名" width="80" align="center">
            <template #default="{ row }">
              <span :style="row['未點名'] ? 'color: #f56c6c' : ''">{{ row['未點名'] }}</span>
            </template>
          </el-table-column>
        </el-table>

        <div v-if="!monthlyLoading && !monthlyData.length" class="empty-hint">
          請先選擇班級與月份
        </div>
      </el-tab-pane>
    </el-tabs>
  </div>
</template>

<style scoped>
.toolbar {
  display: flex;
  align-items: center;
  gap: 12px;
}
.daily-toolbar {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
}
.empty-hint {
  text-align: center;
  color: #999;
  padding: 40px 0;
}
</style>
