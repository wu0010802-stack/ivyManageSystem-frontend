<script setup>
import { ref, computed, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import {
  getMyStudents,
  getMyClassAttendance,
  batchSaveClassAttendance,
  getMyClassAttendanceMonthly,
} from '@/api/portal'

const STATUSES = ['出席', '缺席', '病假', '事假', '遲到']

const STATUS_TAG = {
  出席: 'success',
  缺席: 'danger',
  病假: 'warning',
  事假: 'info',
  遲到: '',
}

// ── 班級資料 ──────────────────────────────────────────
const classrooms = ref([])
const classLoading = ref(false)

// ── Tab（每日點名 / 月統計）────────────────────────────
const activeTab = ref('daily')

// ── 每日點名 ──────────────────────────────────────────
const dailyDate = ref(new Date().toISOString().slice(0, 10))
const dailyClassroomId = ref(null)
const dailyRecords = ref([])
const dailyLoading = ref(false)
const saveLoading = ref(false)

// ── 月統計 ────────────────────────────────────────────
const monthlyClassroomId = ref(null)
const monthlyYear = ref(new Date().getFullYear())
const monthlyMonth = ref(new Date().getMonth() + 1)
const monthlyData = ref(null)
const monthlyLoading = ref(false)

// ── 班級下拉選項 ──────────────────────────────────────
const classroomOptions = computed(() =>
  classrooms.value.map((c) => ({ label: c.classroom_name, value: c.classroom_id }))
)

const fetchClassrooms = async () => {
  classLoading.value = true
  try {
    const res = await getMyStudents()
    classrooms.value = res.data.classrooms || []
    if (classrooms.value.length > 0) {
      dailyClassroomId.value = classrooms.value[0].classroom_id
      monthlyClassroomId.value = classrooms.value[0].classroom_id
    }
  } catch {
    ElMessage.error('載入班級資料失敗')
  } finally {
    classLoading.value = false
  }
}

// ── 每日點名操作 ──────────────────────────────────────
const fetchDailyAttendance = async () => {
  if (!dailyClassroomId.value || !dailyDate.value) return
  dailyLoading.value = true
  try {
    const res = await getMyClassAttendance({
      date: dailyDate.value,
      classroom_id: dailyClassroomId.value,
    })
    // 若尚未點名，預設為「出席」以便快速儲存
    dailyRecords.value = res.data.records.map((r) => ({
      ...r,
      status: r.status || '出席',
      remark: r.remark || '',
    }))
  } catch (e) {
    ElMessage.error(e.response?.data?.detail || '載入點名資料失敗')
  } finally {
    dailyLoading.value = false
  }
}

const setAllStatus = (status) => {
  dailyRecords.value.forEach((r) => (r.status = status))
}

const saveDailyAttendance = async () => {
  if (!dailyClassroomId.value || dailyRecords.value.length === 0) return
  saveLoading.value = true
  try {
    await batchSaveClassAttendance({
      date: dailyDate.value,
      classroom_id: dailyClassroomId.value,
      entries: dailyRecords.value.map((r) => ({
        student_id: r.student_id,
        status: r.status,
        remark: r.remark || null,
      })),
    })
    ElMessage.success('點名儲存成功')
  } catch (e) {
    ElMessage.error(e.response?.data?.detail || '儲存失敗')
  } finally {
    saveLoading.value = false
  }
}

// ── 月統計操作 ────────────────────────────────────────
const fetchMonthly = async () => {
  if (!monthlyClassroomId.value) return
  monthlyLoading.value = true
  try {
    const res = await getMyClassAttendanceMonthly({
      classroom_id: monthlyClassroomId.value,
      year: monthlyYear.value,
      month: monthlyMonth.value,
    })
    monthlyData.value = res.data
  } catch (e) {
    ElMessage.error(e.response?.data?.detail || '載入月統計失敗')
  } finally {
    monthlyLoading.value = false
  }
}

const monthOptions = Array.from({ length: 12 }, (_, i) => ({ label: `${i + 1} 月`, value: i + 1 }))
const yearOptions = Array.from({ length: 5 }, (_, i) => {
  const y = new Date().getFullYear() - 2 + i
  return { label: `${y} 年`, value: y }
})

onMounted(async () => {
  await fetchClassrooms()
  fetchDailyAttendance()
})
</script>

<template>
  <div>
    <div class="page-header">
      <h3>學生點名</h3>
    </div>

    <el-tabs v-model="activeTab">
      <!-- ── 每日點名 Tab ── -->
      <el-tab-pane label="每日點名" name="daily">
        <el-row :gutter="12" style="margin-bottom: 16px; align-items: flex-end">
          <el-col :xs="24" :sm="8">
            <div class="filter-label">日期</div>
            <el-date-picker
              v-model="dailyDate"
              type="date"
              placeholder="選擇日期"
              value-format="YYYY-MM-DD"
              style="width: 100%"
            />
          </el-col>
          <el-col :xs="24" :sm="8">
            <div class="filter-label">班級</div>
            <el-select
              v-model="dailyClassroomId"
              placeholder="選擇班級"
              style="width: 100%"
              v-loading="classLoading"
            >
              <el-option
                v-for="opt in classroomOptions"
                :key="opt.value"
                :label="opt.label"
                :value="opt.value"
              />
            </el-select>
          </el-col>
          <el-col :xs="24" :sm="8" style="display: flex; gap: 8px; flex-wrap: wrap">
            <el-button type="primary" @click="fetchDailyAttendance">載入</el-button>
          </el-col>
        </el-row>

        <div v-if="dailyRecords.length > 0">
          <!-- 快捷按鈕 -->
          <div style="margin-bottom: 12px; display: flex; gap: 8px; flex-wrap: wrap">
            <el-button size="small" type="success" plain @click="setAllStatus('出席')">全部出席</el-button>
            <el-button size="small" type="danger" plain @click="setAllStatus('缺席')">全部缺席</el-button>
          </div>

          <el-table :data="dailyRecords" v-loading="dailyLoading" stripe size="small" border>
            <el-table-column label="學號" width="90" prop="student_no" />
            <el-table-column label="姓名" width="100" prop="name" />
            <el-table-column label="出席狀態" min-width="280">
              <template #default="{ row }">
                <el-radio-group v-model="row.status" size="small">
                  <el-radio-button
                    v-for="s in STATUSES"
                    :key="s"
                    :value="s"
                  >{{ s }}</el-radio-button>
                </el-radio-group>
              </template>
            </el-table-column>
            <el-table-column label="備註" min-width="160">
              <template #default="{ row }">
                <el-input
                  v-model="row.remark"
                  size="small"
                  placeholder="備註（選填）"
                  clearable
                />
              </template>
            </el-table-column>
          </el-table>

          <div style="margin-top: 16px; text-align: right">
            <el-button
              type="primary"
              :loading="saveLoading"
              @click="saveDailyAttendance"
            >
              儲存點名（{{ dailyRecords.length }} 人）
            </el-button>
          </div>
        </div>

        <el-empty
          v-else-if="!dailyLoading"
          description="請選擇日期與班級後點擊「載入」"
        />
      </el-tab-pane>

      <!-- ── 月統計 Tab ── -->
      <el-tab-pane label="月統計" name="monthly">
        <el-row :gutter="12" style="margin-bottom: 16px; align-items: flex-end">
          <el-col :xs="12" :sm="6">
            <div class="filter-label">年份</div>
            <el-select v-model="monthlyYear" style="width: 100%">
              <el-option v-for="opt in yearOptions" :key="opt.value" :label="opt.label" :value="opt.value" />
            </el-select>
          </el-col>
          <el-col :xs="12" :sm="6">
            <div class="filter-label">月份</div>
            <el-select v-model="monthlyMonth" style="width: 100%">
              <el-option v-for="opt in monthOptions" :key="opt.value" :label="opt.label" :value="opt.value" />
            </el-select>
          </el-col>
          <el-col :xs="24" :sm="8">
            <div class="filter-label">班級</div>
            <el-select v-model="monthlyClassroomId" placeholder="選擇班級" style="width: 100%">
              <el-option v-for="opt in classroomOptions" :key="opt.value" :label="opt.label" :value="opt.value" />
            </el-select>
          </el-col>
          <el-col :xs="24" :sm="4">
            <el-button type="primary" @click="fetchMonthly">查詢</el-button>
          </el-col>
        </el-row>

        <div v-if="monthlyData">
          <div style="margin-bottom: 8px; font-size: 13px; color: #606266">
            {{ monthlyData.year }} 年 {{ monthlyData.month }} 月，共 {{ monthlyData.days_in_month }} 天
          </div>
          <el-table
            :data="monthlyData.students"
            v-loading="monthlyLoading"
            stripe
            size="small"
            border
          >
            <el-table-column label="學號" width="90" prop="student_no" />
            <el-table-column label="姓名" width="100" prop="name" />
            <el-table-column label="出席" width="70" align="center">
              <template #default="{ row }">
                <el-tag type="success" size="small">{{ row['出席'] }}</el-tag>
              </template>
            </el-table-column>
            <el-table-column label="缺席" width="70" align="center">
              <template #default="{ row }">
                <el-tag v-if="row['缺席'] > 0" type="danger" size="small">{{ row['缺席'] }}</el-tag>
                <span v-else style="color: #c0c4cc">0</span>
              </template>
            </el-table-column>
            <el-table-column label="病假" width="70" align="center">
              <template #default="{ row }">
                <el-tag v-if="row['病假'] > 0" type="warning" size="small">{{ row['病假'] }}</el-tag>
                <span v-else style="color: #c0c4cc">0</span>
              </template>
            </el-table-column>
            <el-table-column label="事假" width="70" align="center">
              <template #default="{ row }">
                <el-tag v-if="row['事假'] > 0" type="info" size="small">{{ row['事假'] }}</el-tag>
                <span v-else style="color: #c0c4cc">0</span>
              </template>
            </el-table-column>
            <el-table-column label="遲到" width="70" align="center">
              <template #default="{ row }">
                <el-tag v-if="row['遲到'] > 0" size="small">{{ row['遲到'] }}</el-tag>
                <span v-else style="color: #c0c4cc">0</span>
              </template>
            </el-table-column>
            <el-table-column label="未點名" width="80" align="center">
              <template #default="{ row }">
                <el-tag v-if="row['未點名'] > 0" type="info" size="small" effect="plain">{{ row['未點名'] }}</el-tag>
                <span v-else style="color: #c0c4cc">0</span>
              </template>
            </el-table-column>
          </el-table>
        </div>

        <el-empty
          v-else-if="!monthlyLoading"
          description="請選擇年月與班級後點擊「查詢」"
        />
      </el-tab-pane>
    </el-tabs>
  </div>
</template>

<style scoped>
.page-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
}
.page-header h3 {
  margin: 0;
  font-size: 1.2rem;
  font-weight: 600;
}
.filter-label {
  font-size: 12px;
  color: #909399;
  margin-bottom: 4px;
}
</style>
