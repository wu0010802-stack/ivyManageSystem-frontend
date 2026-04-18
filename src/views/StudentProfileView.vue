<template>
  <div class="student-profile-view">
    <div class="page-header">
      <el-breadcrumb>
        <el-breadcrumb-item :to="{ path: '/students' }">學生管理</el-breadcrumb-item>
        <el-breadcrumb-item>學生檔案</el-breadcrumb-item>
      </el-breadcrumb>
      <div class="header-actions">
        <el-button @click="$router.back()">返回</el-button>
        <el-button
          v-if="canLifecycleWrite"
          type="primary"
          :disabled="!profile"
          @click="lifecycleDialogVisible = true"
        >
          變更生命週期狀態
        </el-button>
      </div>
    </div>

    <el-card v-loading="loading" class="summary-card">
      <template v-if="profile">
        <div class="summary-head">
          <div class="name-block">
            <h2 class="student-name">{{ profile.basic.name }}</h2>
            <span class="student-id">#{{ profile.basic.student_id }}</span>
            <el-tag :type="lifecycleTagType" size="small" style="margin-left: 8px">
              {{ lifecycleLabel }}
            </el-tag>
          </div>
          <div class="meta">
            <span>班級：{{ profile.basic.classroom_name || '未分班' }}</span>
            <span>入學：{{ profile.lifecycle.enrollment_date || '—' }}</span>
            <span v-if="profile.lifecycle.graduation_date">畢業：{{ profile.lifecycle.graduation_date }}</span>
            <span v-if="profile.lifecycle.withdrawal_date">離園：{{ profile.lifecycle.withdrawal_date }}</span>
          </div>
        </div>

        <el-row :gutter="12" class="summary-row">
          <el-col :xs="12" :sm="8" :md="6">
            <div class="summary-stat">
              <div class="stat-label">本學期出席紀錄</div>
              <div class="stat-value">{{ profile.attendance_summary.total_records }}</div>
              <div class="stat-sub">
                出席 {{ attendanceCount('出席') }}・缺席 {{ attendanceCount('缺席') }}・
                病假 {{ attendanceCount('病假') }}・事假 {{ attendanceCount('事假') }}
              </div>
            </div>
          </el-col>
          <el-col :xs="12" :sm="8" :md="6">
            <div class="summary-stat">
              <div class="stat-label">費用應繳</div>
              <div class="stat-value">${{ profile.fee_summary.total_due }}</div>
              <div class="stat-sub">
                已繳 ${{ profile.fee_summary.total_paid }}・未繳 ${{ profile.fee_summary.outstanding }}
              </div>
            </div>
          </el-col>
          <el-col :xs="12" :sm="8" :md="6">
            <div class="summary-stat">
              <div class="stat-label">監護人</div>
              <div class="stat-value">{{ profile.guardians.length }}</div>
              <div class="stat-sub">
                {{ primaryGuardianLabel }}
              </div>
            </div>
          </el-col>
          <el-col :xs="12" :sm="8" :md="6">
            <div class="summary-stat">
              <div class="stat-label">最近事件</div>
              <div class="stat-value">{{ profile.incident_summary.length }}</div>
              <div class="stat-sub">
                {{ latestIncidentLabel }}
              </div>
            </div>
          </el-col>
        </el-row>
      </template>
    </el-card>

    <el-tabs v-if="profile" v-model="activeTab" class="profile-tabs">
      <el-tab-pane label="基本資料" name="basic">
        <el-descriptions :column="2" border>
          <el-descriptions-item label="姓名">{{ profile.basic.name }}</el-descriptions-item>
          <el-descriptions-item label="學號">{{ profile.basic.student_id }}</el-descriptions-item>
          <el-descriptions-item label="性別">{{ profile.basic.gender || '—' }}</el-descriptions-item>
          <el-descriptions-item label="生日">{{ profile.basic.birthday || '—' }}</el-descriptions-item>
          <el-descriptions-item label="班級">{{ profile.basic.classroom_name || '未分班' }}</el-descriptions-item>
          <el-descriptions-item label="是否在籍">
            <el-tag :type="profile.basic.is_active ? 'success' : 'info'" size="small">
              {{ profile.basic.is_active ? '在籍' : '已離園' }}
            </el-tag>
          </el-descriptions-item>
          <el-descriptions-item label="地址" :span="2">{{ profile.basic.address || '—' }}</el-descriptions-item>
          <el-descriptions-item label="備註" :span="2">{{ profile.basic.notes || '—' }}</el-descriptions-item>
        </el-descriptions>

        <h3 class="section-title">健康資訊</h3>
        <el-descriptions :column="2" border>
          <el-descriptions-item label="過敏">{{ profile.health.allergy || '—' }}</el-descriptions-item>
          <el-descriptions-item label="用藥">{{ profile.health.medication || '—' }}</el-descriptions-item>
          <el-descriptions-item label="特殊需求" :span="2">
            {{ profile.health.special_needs || '—' }}
          </el-descriptions-item>
          <el-descriptions-item label="緊急聯絡人">
            {{ profile.health.emergency_contact_name || '—' }}
            <span v-if="profile.health.emergency_contact_relation">
              ({{ profile.health.emergency_contact_relation }})
            </span>
          </el-descriptions-item>
          <el-descriptions-item label="緊急聯絡電話">
            {{ profile.health.emergency_contact_phone || '—' }}
          </el-descriptions-item>
        </el-descriptions>
      </el-tab-pane>

      <el-tab-pane label="監護人" name="guardians">
        <GuardianManager
          v-if="canGuardiansRead && profile"
          :student-id="profile.basic.id"
          @change="fetchProfile"
        />
        <el-empty v-else description="您沒有檢視監護人資料的權限" />
      </el-tab-pane>

      <el-tab-pane label="生命週期時間軸" name="timeline">
        <el-timeline v-if="profile.timeline.length > 0">
          <el-timeline-item
            v-for="item in profile.timeline"
            :key="item.id"
            :timestamp="item.event_date"
            :type="timelineColor(item.event_type)"
            placement="top"
          >
            <el-card shadow="never">
              <div class="timeline-head">
                <el-tag :type="timelineColor(item.event_type)" size="small">
                  {{ item.event_type }}
                </el-tag>
                <span v-if="item.reason" class="timeline-reason">{{ item.reason }}</span>
              </div>
              <div v-if="item.notes" class="timeline-notes">{{ item.notes }}</div>
              <div class="timeline-meta">
                學年 {{ item.school_year }} 學期 {{ item.semester }}
                <span v-if="item.classroom_id">・班級 #{{ item.classroom_id }}</span>
              </div>
            </el-card>
          </el-timeline-item>
        </el-timeline>
        <el-empty v-else description="尚無異動紀錄" />
      </el-tab-pane>

      <el-tab-pane label="近期事件" name="incidents">
        <el-table :data="profile.incident_summary" border empty-text="無事件紀錄">
          <el-table-column label="發生時間" prop="occurred_at" width="170" />
          <el-table-column label="類型" prop="incident_type" width="120" />
          <el-table-column label="嚴重程度" prop="severity" width="100" />
          <el-table-column label="描述" prop="description" min-width="200" show-overflow-tooltip />
          <el-table-column label="已通知家長" width="110" align="center">
            <template #default="{ row }">
              <el-tag :type="row.parent_notified ? 'success' : 'info'" size="small">
                {{ row.parent_notified ? '已通知' : '未通知' }}
              </el-tag>
            </template>
          </el-table-column>
        </el-table>
      </el-tab-pane>

      <el-tab-pane label="相關連結" name="links">
        <div class="quick-links">
          <el-button @click="goTo('/student-attendance')">學生出席紀錄</el-button>
          <el-button @click="goTo('/fees')">學費管理</el-button>
          <el-button @click="goTo('/student-records')">學生紀錄（評量/異動）</el-button>
          <el-button @click="goTo('/students')">回到學生列表</el-button>
        </div>
      </el-tab-pane>
    </el-tabs>

    <LifecycleTransitionDialog
      v-if="profile"
      v-model="lifecycleDialogVisible"
      :student-id="profile.basic.id"
      :current-status="profile.lifecycle.status"
      @transitioned="fetchProfile"
    />
  </div>
</template>

<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import GuardianManager from '@/components/student/GuardianManager.vue'
import LifecycleTransitionDialog from '@/components/student/LifecycleTransitionDialog.vue'
import { getStudentProfile } from '@/api/students'
import { hasPermission } from '@/utils/auth'

const route = useRoute()
const router = useRouter()

const profile = ref(null)
const loading = ref(false)
const activeTab = ref('basic')
const lifecycleDialogVisible = ref(false)

const studentId = computed(() => Number(route.params.id))
const canLifecycleWrite = computed(() => hasPermission('STUDENTS_LIFECYCLE_WRITE'))
const canGuardiansRead = computed(() => hasPermission('GUARDIANS_READ'))

const LIFECYCLE_LABELS = {
  prospect: '招生中',
  enrolled: '已報到',
  active: '在學',
  on_leave: '休學',
  transferred: '轉出',
  withdrawn: '退學',
  graduated: '畢業',
}
const LIFECYCLE_TAG = {
  prospect: 'info',
  enrolled: 'warning',
  active: 'success',
  on_leave: 'warning',
  transferred: 'info',
  withdrawn: 'danger',
  graduated: 'success',
}
const EVENT_COLOR = {
  入學: 'success',
  復學: 'success',
  休學: 'warning',
  退學: 'danger',
  轉出: 'info',
  轉入: 'primary',
  畢業: 'success',
}

const lifecycleLabel = computed(() =>
  LIFECYCLE_LABELS[profile.value?.lifecycle.status] || profile.value?.lifecycle.status || '',
)
const lifecycleTagType = computed(() =>
  LIFECYCLE_TAG[profile.value?.lifecycle.status] || 'info',
)
const primaryGuardianLabel = computed(() => {
  const primary = profile.value?.guardians?.find((g) => g.is_primary)
  return primary ? `主要：${primary.name}` : '尚無主要聯絡人'
})
const latestIncidentLabel = computed(() => {
  const first = profile.value?.incident_summary?.[0]
  return first ? `最近：${first.incident_type}` : '無紀錄'
})

function attendanceCount(status) {
  return profile.value?.attendance_summary?.by_status?.[status] || 0
}

function timelineColor(eventType) {
  return EVENT_COLOR[eventType] || 'info'
}

function goTo(path) {
  router.push(path)
}

async function fetchProfile() {
  if (!studentId.value || Number.isNaN(studentId.value)) return
  loading.value = true
  try {
    const { data } = await getStudentProfile(studentId.value)
    profile.value = data
  } catch (err) {
    ElMessage.error(err.displayMessage || '讀取學生檔案失敗')
    profile.value = null
  } finally {
    loading.value = false
  }
}

onMounted(fetchProfile)
watch(studentId, fetchProfile)
</script>

<style scoped>
.student-profile-view {
  padding: 16px;
}
.page-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
}
.header-actions {
  display: flex;
  gap: 8px;
}
.summary-card {
  margin-bottom: 16px;
}
.summary-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 16px;
  flex-wrap: wrap;
  gap: 12px;
}
.name-block {
  display: flex;
  align-items: center;
  gap: 10px;
}
.student-name {
  margin: 0;
  font-size: 22px;
}
.student-id {
  color: var(--el-text-color-secondary);
  font-size: 14px;
}
.meta {
  display: flex;
  gap: 16px;
  color: var(--el-text-color-regular);
  flex-wrap: wrap;
}
.summary-row {
  margin-top: 4px;
}
.summary-stat {
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 6px;
  padding: 12px;
  background: var(--el-fill-color-blank);
  margin-bottom: 10px;
}
.stat-label {
  color: var(--el-text-color-secondary);
  font-size: 12px;
}
.stat-value {
  font-size: 24px;
  font-weight: 600;
  margin: 4px 0;
}
.stat-sub {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}
.profile-tabs {
  margin-top: 4px;
}
.section-title {
  margin-top: 16px;
  font-size: 16px;
}
.timeline-head {
  display: flex;
  gap: 8px;
  align-items: center;
  margin-bottom: 6px;
}
.timeline-reason {
  color: var(--el-text-color-regular);
  font-size: 13px;
}
.timeline-notes {
  color: var(--el-text-color-primary);
  font-size: 13px;
  margin-bottom: 4px;
}
.timeline-meta {
  color: var(--el-text-color-secondary);
  font-size: 12px;
}
.quick-links {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
}
</style>
