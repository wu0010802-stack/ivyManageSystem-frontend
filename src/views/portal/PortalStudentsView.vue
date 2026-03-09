<script setup>
import { ref, computed, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import { getMyStudents } from '@/api/portal'

const loading = ref(false)
const data = ref({ classrooms: [], total_students: 0, employee_name: '' })
const activeClassroom = ref(null)
const searchText = ref('')

const fetchStudents = async () => {
  loading.value = true
  try {
    const res = await getMyStudents()
    data.value = res.data
    if (res.data.classrooms.length > 0) {
      activeClassroom.value = res.data.classrooms[0].classroom_id
    }
  } catch (error) {
    ElMessage.error(error.response?.data?.detail || '載入失敗')
  } finally {
    loading.value = false
  }
}

const currentClassroom = computed(() => {
  if (!activeClassroom.value) return null
  return data.value.classrooms.find(c => c.classroom_id === activeClassroom.value)
})

const filteredStudents = computed(() => {
  if (!currentClassroom.value) return []
  const students = currentClassroom.value.students
  if (!searchText.value) return students
  const keyword = searchText.value.toLowerCase()
  return students.filter(s =>
    s.name.toLowerCase().includes(keyword) ||
    (s.parent_name && s.parent_name.toLowerCase().includes(keyword))
  )
})

const calculateAge = (birthday) => {
  if (!birthday) return ''
  const birth = new Date(birthday)
  const today = new Date()
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
  return `${years}歲${months}個月`
}

const genderLabel = (g) => {
  if (g === 'M' || g === '男') return '男'
  if (g === 'F' || g === '女') return '女'
  return g || ''
}

const genderTagType = (g) => {
  if (g === 'M' || g === '男') return 'primary'
  if (g === 'F' || g === '女') return 'danger'
  return 'info'
}

onMounted(fetchStudents)
</script>

<template>
  <div class="portal-students" v-loading="loading">
    <div v-if="data.classrooms.length === 0 && !loading" class="empty-state">
      <el-empty description="您目前未被分配到任何班級" />
    </div>

    <template v-else>
      <!-- Classroom tabs -->
      <el-tabs v-model="activeClassroom" type="card" class="classroom-tabs">
        <el-tab-pane
          v-for="cr in data.classrooms"
          :key="cr.classroom_id"
          :label="`${cr.classroom_name} (${cr.student_count}人)`"
          :name="cr.classroom_id"
        />
      </el-tabs>

      <!-- Info & Search bar -->
      <div class="toolbar" v-if="currentClassroom">
        <div class="info">
          <el-tag type="success" size="small">{{ currentClassroom.role }}</el-tag>
          <span class="student-count">共 {{ currentClassroom.student_count }} 位學生</span>
        </div>
        <el-input
          v-model="searchText"
          placeholder="搜尋學生或家長姓名"
          clearable
          style="width: 220px"
          prefix-icon="Search"
        />
      </div>

      <!-- Student table -->
      <el-table
        v-if="currentClassroom"
        :data="filteredStudents"
        stripe
        style="width: 100%"
        max-height="600"
        empty-text="此班級目前沒有學生"
      >
        <el-table-column prop="name" label="姓名" width="100" />
        <el-table-column label="性別" width="70" align="center">
          <template #default="{ row }">
            <el-tag :type="genderTagType(row.gender)" size="small">
              {{ genderLabel(row.gender) }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="生日" width="120">
          <template #default="{ row }">
            {{ row.birthday || '-' }}
          </template>
        </el-table-column>
        <el-table-column label="年齡" width="120">
          <template #default="{ row }">
            {{ calculateAge(row.birthday) || '-' }}
          </template>
        </el-table-column>
        <el-table-column prop="parent_name" label="家長姓名" width="100" />
        <el-table-column prop="parent_phone" label="家長電話" width="140" />
        <el-table-column label="狀態" width="90" align="center">
          <template #default="{ row }">
            <el-tag v-if="row.status_tag" size="small" type="info">{{ row.status_tag }}</el-tag>
            <span v-else>-</span>
          </template>
        </el-table-column>
        <el-table-column prop="notes" label="備註" min-width="120" show-overflow-tooltip />
      </el-table>
    </template>
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
</style>
