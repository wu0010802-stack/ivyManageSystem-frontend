<template>
  <div class="portal-activity">
    <h2 class="page-title">才藝管理</h2>

    <el-tabs v-model="mainTab" @tab-change="handleTabChange">
      <el-tab-pane label="課程報名" name="registrations" />
      <el-tab-pane label="點名" name="attendance" />
    </el-tabs>

    <!-- ===== 課程報名 Tab ===== -->
    <template v-if="mainTab === 'registrations'">
      <div v-if="loading" v-loading="true" style="min-height: 200px"></div>

      <template v-else-if="data">
        <!-- 摘要統計卡片 -->
        <el-row :gutter="12" class="summary-row">
          <el-col :xs="12" :sm="6">
            <el-card shadow="never" class="summary-card">
              <div class="card-val">{{ data.summary.total_registrations }}</div>
              <div class="card-label">已報名人數</div>
            </el-card>
          </el-col>
          <el-col :xs="12" :sm="6">
            <el-card shadow="never" class="summary-card">
              <div class="card-val">{{ data.summary.total_enrolled }}</div>
              <div class="card-label">正式報名數</div>
            </el-card>
          </el-col>
          <el-col :xs="12" :sm="6">
            <el-card shadow="never" class="summary-card">
              <div class="card-val">{{ data.summary.total_waitlist }}</div>
              <div class="card-label">候補人次</div>
            </el-card>
          </el-col>
          <el-col :xs="12" :sm="6">
            <el-card shadow="never" class="summary-card">
              <div class="card-val">{{ data.summary.total_paid }}</div>
              <div class="card-label">已繳費人數</div>
            </el-card>
          </el-col>
        </el-row>

        <!-- 班級切換 Tabs（多班時顯示） -->
        <el-tabs v-if="data.classrooms.length > 1" v-model="activeClass" style="margin-top: 16px">
          <el-tab-pane
            v-for="cls in data.classrooms"
            :key="cls"
            :label="cls"
            :name="cls"
          />
        </el-tabs>

        <!-- 報名列表 -->
        <el-table
          :data="filteredRegistrations"
          border
          stripe
          style="margin-top: 12px"
          v-loading="loading"
        >
          <el-table-column label="學生" prop="student_name" min-width="90" />
          <el-table-column label="班級" prop="class_name" width="90" align="center" />
          <el-table-column label="課程" min-width="200">
            <template #default="{ row }">
              <span v-if="row.courses.length === 0" class="no-course">—</span>
              <el-tag
                v-for="(c, idx) in row.courses"
                :key="idx"
                :type="COURSE_STATUS_TAG_TYPE[c.status] || 'info'"
                size="small"
                style="margin: 2px"
              >
                {{ c.course_name }}
                <span v-if="c.status === 'waitlist'">（候補 #{{ c.waitlist_position }}）</span>
              </el-tag>
            </template>
          </el-table-column>
          <el-table-column label="繳費" width="90" align="center">
            <template #default="{ row }">
              <el-tag :type="row.is_paid ? 'success' : 'warning'" size="small">
                {{ row.is_paid ? '已繳費' : '未繳費' }}
              </el-tag>
            </template>
          </el-table-column>
          <el-table-column label="報名時間" min-width="130">
            <template #default="{ row }">{{ formatActivityDate(row.created_at) }}</template>
          </el-table-column>
        </el-table>

        <div v-if="filteredRegistrations.length === 0 && !loading" class="empty-hint">
          目前沒有學生報名才藝課程。
        </div>
      </template>

      <el-empty v-else-if="!loading" description="無班級資料" />
    </template>

    <!-- ===== 點名 Tab ===== -->
    <template v-if="mainTab === 'attendance'">
      <div class="attendance-section">
        <!-- 課程 + 場次選擇 -->
        <el-row :gutter="12" style="margin-bottom: 16px">
          <el-col :xs="24" :sm="12">
            <el-select
              v-model="selectedCourseId"
              placeholder="選擇課程"
              clearable
              style="width: 100%"
              :loading="loadingSessions"
            >
              <el-option
                v-for="c in courseOptions"
                :key="c.id"
                :label="c.name"
                :value="c.id"
              />
            </el-select>
          </el-col>
          <el-col :xs="24" :sm="12">
            <el-select
              v-model="selectedSessionId"
              placeholder="選擇場次"
              clearable
              style="width: 100%"
              :disabled="filteredSessions.length === 0"
              @change="selectSession"
            >
              <el-option
                v-for="s in filteredSessions"
                :key="s.id"
                :label="`${s.session_date}（出席 ${s.present_count}/${s.recorded_count} 已記錄）`"
                :value="s.id"
              />
            </el-select>
          </el-col>
        </el-row>

        <div v-if="loadingSessions" v-loading="true" style="min-height: 100px" />

        <div v-else-if="filteredSessions.length === 0 && !loadingSessions" class="empty-hint">
          目前自班沒有才藝場次。
        </div>

        <!-- 點名列表 -->
        <template v-if="sessionDetail">
          <div class="attendance-header">
            <span class="att-title">{{ sessionDetail.course_name }} — {{ sessionDetail.session_date }}</span>
            <span class="att-stats">
              出席 {{ sessionDetail.students.filter(s => s.is_present).length }} / {{ sessionDetail.students.length }}
            </span>
          </div>

          <div v-if="loadingDetail" v-loading="true" style="min-height: 100px" />

          <el-table
            v-else
            :data="sessionDetail.students"
            border
            stripe
            size="small"
          >
            <el-table-column label="學生" prop="student_name" min-width="90" />
            <el-table-column label="班級" prop="class_name" width="90" align="center" />
            <el-table-column label="出席" width="80" align="center">
              <template #default="{ row }">
                <el-checkbox v-model="row.is_present" @change="() => {}" />
              </template>
            </el-table-column>
            <el-table-column label="備註" min-width="140">
              <template #default="{ row }">
                <el-input
                  v-model="row.attendance_notes"
                  size="small"
                  placeholder="備註"
                  clearable
                />
              </template>
            </el-table-column>
          </el-table>

          <div style="margin-top: 16px; text-align: right">
            <el-button type="primary" :loading="saving" @click="saveAttendance">
              儲存點名
            </el-button>
          </div>
        </template>

        <el-empty v-else-if="selectedSessionId === null && !loadingSessions" description="請選擇課程與場次" />
      </div>
    </template>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import { getPortalActivityRegistrations } from '@/api/activity'
import { COURSE_STATUS_TAG_TYPE } from '@/constants/activity'
import { formatActivityDate } from '@/utils/format'
import { usePortalAttendance } from '@/composables/usePortalAttendance'

const mainTab = ref('registrations')

// ── 課程報名 Tab ──
const loading = ref(false)
const data = ref(null)
const activeClass = ref('')

const filteredRegistrations = computed(() => {
  if (!data.value) return []
  if (!activeClass.value) return data.value.registrations
  return data.value.registrations.filter(r => r.class_name === activeClass.value)
})

async function loadRegistrations() {
  loading.value = true
  try {
    const res = await getPortalActivityRegistrations()
    data.value = res.data
    if (res.data.classrooms.length > 0) {
      activeClass.value = res.data.classrooms[0]
    }
  } catch {
    ElMessage.error('載入才藝報名資料失敗')
  } finally {
    loading.value = false
  }
}

// ── 點名 Tab ──
const {
  selectedCourseId, selectedSessionId, sessionDetail,
  loadingSessions, loadingDetail, saving,
  courseOptions, filteredSessions,
  loadSessions, selectSession, saveAttendance,
} = usePortalAttendance()

function handleTabChange(tab) {
  if (tab === 'attendance' && filteredSessions.value.length === 0) {
    loadSessions()
  }
}

onMounted(() => {
  loadRegistrations()
})
</script>

<style scoped>
.portal-activity { padding: 16px; }
.page-title { margin: 0 0 16px; font-size: 20px; font-weight: 600; }

.summary-row { margin-bottom: 16px; }
.summary-card { text-align: center; padding: 4px 0; }
.card-val { font-size: 28px; font-weight: 700; color: #1d4ed8; }
.card-label { font-size: 13px; color: #64748b; margin-top: 4px; }

.no-course { color: #94a3b8; }
.empty-hint { text-align: center; color: #94a3b8; padding: 24px 0; font-size: 14px; }

/* ── 點名區 ── */
.attendance-section { margin-top: 16px; }
.attendance-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 0 12px;
}
.att-title { font-size: 15px; font-weight: 600; color: #1e293b; }
.att-stats { font-size: 13px; color: #64748b; }
</style>
