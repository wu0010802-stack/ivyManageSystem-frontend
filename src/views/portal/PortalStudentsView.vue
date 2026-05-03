<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { View, Hide, Warning } from '@element-plus/icons-vue'
import { getMyStudents, revealPortalStudentPhone } from '@/api/portal'
import { apiError } from '@/utils/error'
import PortalStudentDrawer from '@/components/portal/students/PortalStudentDrawer.vue'

const route = useRoute()
const router = useRouter()

const loading = ref(false)
const data = ref({ classrooms: [], total_students: 0, employee_name: '' })
const activeClassroom = ref(null)
const searchText = ref('')

const drawerOpen = ref(false)
const selectedStudentId = ref(null)

// 列表卡片內 parent_phone 揭露的本地狀態（key: studentId）
const revealedParentPhones = ref(new Map())
const revealingId = ref(null)

const fetchStudents = async () => {
  loading.value = true
  try {
    const res = await getMyStudents()
    data.value = res.data
    if (res.data.classrooms.length > 0 && !activeClassroom.value) {
      activeClassroom.value = res.data.classrooms[0].classroom_id
    }
    // 若 URL 帶 ?student=xx 就自動開
    const sid = Number(route.query.student)
    if (sid) {
      selectedStudentId.value = sid
      drawerOpen.value = true
    }
  } catch (error) {
    ElMessage.error(apiError(error, '載入失敗'))
  } finally {
    loading.value = false
  }
}

const currentClassroom = computed(() => {
  if (!activeClassroom.value) return null
  return data.value.classrooms.find(
    (c) => c.classroom_id === activeClassroom.value,
  )
})

const filteredStudents = computed(() => {
  if (!currentClassroom.value) return []
  const students = currentClassroom.value.students
  if (!searchText.value) return students
  const keyword = searchText.value.toLowerCase()
  return students.filter(
    (s) =>
      s.name.toLowerCase().includes(keyword) ||
      (s.parent_name && s.parent_name.toLowerCase().includes(keyword)) ||
      (s.student_id && s.student_id.toLowerCase().includes(keyword)),
  )
})

const ageMap = computed(() => {
  const today = new Date()
  const map = new Map()
  for (const cls of data.value.classrooms) {
    for (const s of cls.students) {
      if (!s.birthday) {
        map.set(s.id, '')
        continue
      }
      const birth = new Date(s.birthday)
      let years = today.getFullYear() - birth.getFullYear()
      let months = today.getMonth() - birth.getMonth()
      if (months < 0) {
        years--
        months += 12
      }
      if (today.getDate() < birth.getDate()) {
        months--
        if (months < 0) {
          years--
          months += 12
        }
      }
      map.set(s.id, `${years}歲${months}個月`)
    }
  }
  return map
})

function genderLabel(g) {
  if (g === 'M' || g === '男') return '男'
  if (g === 'F' || g === '女') return '女'
  return g || ''
}
function genderTagType(g) {
  if (g === 'M' || g === '男') return 'primary'
  if (g === 'F' || g === '女') return 'danger'
  return 'info'
}
function lifecycleLabel(s) {
  return (
    {
      active: '在學',
      graduated: '畢業',
      withdrawn: '離校',
      transferred: '轉學',
    }[s] || ''
  )
}

function attendanceLevel(rate) {
  if (rate == null) return 'unknown'
  if (rate >= 95) return 'high'
  if (rate >= 85) return 'mid'
  return 'low'
}

function openDrawer(student) {
  selectedStudentId.value = student.id
  drawerOpen.value = true
  router.replace({ query: { ...route.query, student: student.id } })
}

watch(drawerOpen, (v) => {
  if (!v) {
    const q = { ...route.query }
    delete q.student
    router.replace({ query: q })
    selectedStudentId.value = null
  }
})

async function revealParentPhone(student, ev) {
  ev?.stopPropagation()
  if (revealedParentPhones.value.has(student.id)) return
  revealingId.value = student.id
  try {
    const res = await revealPortalStudentPhone(student.id, { target: 'parent' })
    const phone = res.data?.phone
    if (phone) {
      const next = new Map(revealedParentPhones.value)
      next.set(student.id, phone)
      revealedParentPhones.value = next
    }
  } catch (e) {
    ElMessage.error(apiError(e, '揭露失敗'))
  } finally {
    revealingId.value = null
  }
}

function displayedParentPhone(student) {
  return (
    revealedParentPhones.value.get(student.id) ||
    student.parent_phone_masked ||
    '—'
  )
}

onMounted(fetchStudents)
</script>

<template>
  <div class="portal-students" v-loading="loading">
    <div v-if="data.classrooms.length === 0 && !loading" class="empty-state">
      <el-empty description="您目前未被分配到任何班級" />
    </div>

    <template v-else>
      <el-tabs v-model="activeClassroom" type="card" class="classroom-tabs">
        <el-tab-pane
          v-for="cr in data.classrooms"
          :key="cr.classroom_id"
          :label="`${cr.classroom_name} (${cr.student_count}人)`"
          :name="cr.classroom_id"
        />
      </el-tabs>

      <div class="toolbar" v-if="currentClassroom">
        <div class="info">
          <el-tag type="success" size="small">{{ currentClassroom.role }}</el-tag>
          <span class="student-count">共 {{ currentClassroom.student_count }} 位學生</span>
        </div>
        <el-input
          v-model="searchText"
          placeholder="搜尋學生 / 學號 / 家長姓名"
          clearable
          style="width: 260px"
          prefix-icon="Search"
        />
      </div>

      <div v-if="currentClassroom" class="card-grid">
        <div
          v-for="s in filteredStudents"
          :key="s.id"
          class="student-card"
          tabindex="0"
          role="button"
          @click="openDrawer(s)"
          @keyup.enter="openDrawer(s)"
        >
          <div class="row top">
            <span class="name">{{ s.name }}</span>
            <el-tag :type="genderTagType(s.gender)" size="small">
              {{ genderLabel(s.gender) }}
            </el-tag>
            <span
              v-if="s.has_health_alert"
              class="health-dot"
              :title="`健康警告 ${s.health_alert_count} 項`"
            >
              <el-icon><Warning /></el-icon>
              <span class="count">{{ s.health_alert_count }}</span>
            </span>
          </div>

          <div class="row meta">
            <span>學號 {{ s.student_id || '—' }}</span>
            <span class="dot">・</span>
            <span>{{ ageMap.get(s.id) || '—' }}</span>
            <el-tag
              v-if="lifecycleLabel(s.lifecycle_status)"
              size="small"
              effect="plain"
            >
              {{ lifecycleLabel(s.lifecycle_status) }}
            </el-tag>
          </div>

          <div class="row attendance">
            <div class="att-label">本月出席</div>
            <div class="att-value" :class="`att-${attendanceLevel(s.attendance_rate_this_month)}`">
              {{ s.attendance_rate_this_month != null ? `${s.attendance_rate_this_month}%` : '—' }}
            </div>
            <div v-if="s.last_absent_date" class="att-last">
              最近缺席 {{ s.last_absent_date }}
            </div>
          </div>

          <div class="row contact">
            <span class="parent">{{ s.parent_name || '—' }}</span>
            <span v-if="s.parent_phone_masked" class="phone-block">
              <span :class="{ revealed: revealedParentPhones.has(s.id) }">
                {{ displayedParentPhone(s) }}
              </span>
              <button
                v-if="!revealedParentPhones.has(s.id)"
                class="reveal-btn"
                :disabled="revealingId === s.id"
                @click="revealParentPhone(s, $event)"
              >
                <el-icon><View /></el-icon>
              </button>
              <span v-else class="revealed-tag">
                <el-icon><Hide /></el-icon>
              </span>
            </span>
          </div>

          <el-tag
            v-if="s.status_tag"
            size="small"
            type="info"
            class="status-tag"
          >
            {{ s.status_tag }}
          </el-tag>
        </div>

        <div v-if="!filteredStudents.length" class="empty-grid">
          <el-empty description="此班級目前沒有學生" :image-size="80" />
        </div>
      </div>
    </template>

    <PortalStudentDrawer
      v-model="drawerOpen"
      :student-id="selectedStudentId"
    />
  </div>
</template>

<style scoped>
.portal-students {
  padding: 10px;
}
.empty-state {
  padding: 60px 0;
}
.classroom-tabs {
  margin-bottom: var(--space-4);
}
.toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: var(--space-4);
  flex-wrap: wrap;
  gap: 8px;
}
.info {
  display: flex;
  align-items: center;
  gap: 10px;
}
.student-count {
  font-size: var(--text-base);
  color: var(--text-secondary);
}
.card-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
  gap: var(--space-3);
}
.empty-grid {
  grid-column: 1 / -1;
  padding: 40px 0;
}
.student-card {
  background: #fff;
  border: 1px solid var(--border-color-light, #eef0f3);
  border-radius: 14px;
  padding: 14px;
  cursor: pointer;
  display: flex;
  flex-direction: column;
  gap: 10px;
  transition: transform 0.15s ease, box-shadow 0.15s ease, border-color 0.15s ease;
  position: relative;
}
.student-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.06);
  border-color: var(--color-primary-soft, #c8e6d4);
}
.student-card:focus-visible {
  outline: 2px solid var(--color-primary, #16a34a);
  outline-offset: 2px;
}
.row {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}
.row.top .name {
  font-size: 17px;
  font-weight: 700;
  color: var(--text-primary);
}
.health-dot {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  background: var(--color-danger-soft, #fff1f2);
  color: var(--color-danger, #dc2626);
  padding: 2px 6px;
  border-radius: 10px;
  font-size: 12px;
  font-weight: 600;
}
.row.meta {
  font-size: 13px;
  color: var(--text-secondary);
}
.row.meta .dot {
  color: var(--text-tertiary, #cbd5e1);
}
.row.attendance {
  background: var(--color-fill-light, #f7f8fa);
  border-radius: 10px;
  padding: 8px 10px;
  font-size: 13px;
}
.att-label {
  color: var(--text-secondary);
}
.att-value {
  font-weight: 700;
  font-size: 16px;
}
.att-high {
  color: var(--color-success, #16a34a);
}
.att-mid {
  color: var(--color-warning, #d97706);
}
.att-low {
  color: var(--color-danger, #dc2626);
}
.att-unknown {
  color: var(--text-tertiary);
}
.att-last {
  margin-left: auto;
  color: var(--text-tertiary);
  font-size: 12px;
}
.row.contact {
  font-size: 13px;
  color: var(--text-secondary);
}
.row.contact .parent {
  color: var(--text-primary);
  font-weight: 500;
}
.phone-block {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  margin-left: auto;
}
.phone-block .revealed {
  font-family: var(--font-mono, monospace);
  font-weight: 600;
  color: var(--text-primary);
}
.reveal-btn {
  background: transparent;
  border: 1px solid var(--border-color, #d1d5db);
  border-radius: 6px;
  padding: 2px 6px;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  color: var(--text-secondary);
}
.reveal-btn:hover {
  background: var(--color-fill-lighter, #fafbfc);
}
.reveal-btn:disabled {
  cursor: not-allowed;
  opacity: 0.5;
}
.revealed-tag {
  color: var(--color-success, #16a34a);
  display: inline-flex;
  align-items: center;
}
.status-tag {
  align-self: flex-start;
}
</style>
