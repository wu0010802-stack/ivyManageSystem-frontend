<script setup>
import { ref, onMounted } from 'vue'
import { getClassroom, updateClassroom, getTeachers } from '@/api/classrooms'
import { ElMessage } from 'element-plus'
import { useClassroomStore } from '@/stores/classroom'

const classroomStore = useClassroomStore()
const teachers = ref([])
const loading = ref(false)
const dialogVisible = ref(false)
const currentClassroom = ref({})
const form = ref({
  head_teacher_id: '',
  assistant_teacher_id: '',
  art_teacher_id: ''
})

const fetchClassrooms = async () => {
  loading.value = true
  try {
    await classroomStore.fetchClassrooms(true)
  } catch (error) {
    ElMessage.error('載入班級資料失敗')
  } finally {
    loading.value = false
  }
}

const fetchTeachers = async () => {
  try {
    const response = await getTeachers()
    teachers.value = response.data
  } catch {
    ElMessage.error('載入教師資料失敗')
  }
}

const handleEdit = async (classroom) => {
  try {
    // Fetch full details
    const response = await getClassroom(classroom.id)
    currentClassroom.value = response.data
    form.value.head_teacher_id = currentClassroom.value.head_teacher_id
    form.value.assistant_teacher_id = currentClassroom.value.assistant_teacher_id
    form.value.art_teacher_id = currentClassroom.value.art_teacher_id
    
    dialogVisible.value = true
    if (teachers.value.length === 0) fetchTeachers()
  } catch (error) {
    ElMessage.error('載入班級詳情失敗')
  }
}

const saveClassroom = async () => {
  try {
    const params = new URLSearchParams()
    if (form.value.head_teacher_id) params.append('head_teacher_id', form.value.head_teacher_id)
    else params.append('head_teacher_id', '0')
    
    if (form.value.assistant_teacher_id) params.append('assistant_teacher_id', form.value.assistant_teacher_id)
    else params.append('assistant_teacher_id', '0')
    
    if (form.value.art_teacher_id) params.append('art_teacher_id', form.value.art_teacher_id)
    else params.append('art_teacher_id', '0')

    await updateClassroom(currentClassroom.value.id, params.toString())
    
    ElMessage.success('班級更新成功')
    dialogVisible.value = false
    fetchClassrooms()
  } catch (error) {
    ElMessage.error('更新失敗')
  }
}

onMounted(() => {
  fetchClassrooms()
})
</script>

<template>
  <div class="classroom-page">
    <h2>班級管理</h2>
    
    <div class="classroom-grid" v-if="classroomStore.classrooms.length > 0" v-loading="loading">
      <el-card
        v-for="c in classroomStore.classrooms"
        :key="c.id" 
        class="classroom-card" 
        shadow="hover"
        @click="handleEdit(c)"
      >
        <template #header>
          <div class="card-header">
            <span>{{ c.name }}</span>
            <el-tag size="small">{{ c.grade_name }}</el-tag>
          </div>
        </template>
        <div class="card-content">
          <p><strong>學生人數:</strong> {{ c.current_count }} / {{ c.capacity }}</p>
          <div class="teacher-info">
            <p v-if="c.head_teacher_name">👩‍🏫 {{ c.head_teacher_name }}</p>
            <p v-else class="text-muted">未指派班導師</p>
            
            <p v-if="c.assistant_teacher_name">👨‍🏫 {{ c.assistant_teacher_name }}</p>
            
            <p v-if="c.art_teacher_name">🎨 {{ c.art_teacher_name }}</p>
          </div>
        </div>
      </el-card>
    </div>
    <el-empty v-else description="尚無班級資料" />

    <!-- Edit Dialog -->
    <el-dialog v-model="dialogVisible" title="班級詳情" width="500px">
      <div v-if="currentClassroom.id">
        <el-descriptions :column="1" border>
          <el-descriptions-item label="班級名稱">{{ currentClassroom.name }}</el-descriptions-item>
          <el-descriptions-item label="年級">{{ currentClassroom.grade_name }}</el-descriptions-item>
          <el-descriptions-item label="學生人數">{{ currentClassroom.current_count }}</el-descriptions-item>
        </el-descriptions>

        <h4 style="margin-top: 20px;">教師指派</h4>
        <el-form label-width="120px">
          <el-form-item label="班導師">
            <el-select v-model="form.head_teacher_id" placeholder="選擇教師" clearable>
              <el-option v-for="t in teachers" :key="t.id" :label="t.name" :value="t.id" />
            </el-select>
          </el-form-item>
          <el-form-item label="副班導師">
            <el-select v-model="form.assistant_teacher_id" placeholder="選擇教師" clearable>
              <el-option v-for="t in teachers" :key="t.id" :label="t.name" :value="t.id" />
            </el-select>
          </el-form-item>
          <el-form-item label="美術老師">
            <el-select v-model="form.art_teacher_id" placeholder="選擇教師" clearable>
              <el-option v-for="t in teachers" :key="t.id" :label="t.name" :value="t.id" />
            </el-select>
          </el-form-item>
        </el-form>
        
        <h4 style="margin-top: 20px;">學生名單</h4>
        <div class="student-list">
             <el-tag 
               v-for="s in currentClassroom.students" 
               :key="s.id" 
               class="student-tag"
               :type="s.gender === 'male' ? '' : 'danger'"
               effect="plain"
             >
               {{ s.name }}
             </el-tag>
             <p v-if="!currentClassroom.students || currentClassroom.students.length === 0" class="text-muted">尚無學生</p>
        </div>
      </div>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" @click="saveClassroom">儲存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.classroom-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: var(--space-5);
  margin-top: var(--space-5);
}
.classroom-card {
  cursor: pointer;
  transition: transform var(--transition-base);
}
.classroom-card:hover {
  transform: translateY(-5px);
}
.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.teacher-info p {
  margin: 5px 0;
  font-size: 0.9em;
}
.text-muted {
  color: #909399;
}
.student-tag {
  margin-right: 5px;
  margin-bottom: 5px;
}
</style>
