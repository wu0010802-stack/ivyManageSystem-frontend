<template>
  <div class="activity-courses">
    <div class="toolbar">
      <h2>課程管理</h2>
      <el-button type="primary" @click="openCreate">新增課程</el-button>
    </div>

    <el-table :data="courses" v-loading="loading" border>
      <el-table-column label="課程名稱" prop="name" min-width="140" />
      <el-table-column label="價格" prop="price" width="90" align="right">
        <template #default="{ row }">${{ row.price?.toLocaleString() }}</template>
      </el-table-column>
      <el-table-column label="堂數" prop="sessions" width="70" align="center">
        <template #default="{ row }">{{ row.sessions ?? '-' }}</template>
      </el-table-column>
      <el-table-column label="容量" width="70" align="center">
        <template #default="{ row }">{{ row.enrolled }}/{{ row.capacity }}</template>
      </el-table-column>
      <el-table-column label="候補" width="70" align="center">
        <template #default="{ row }">
          <el-button
            v-if="row.waitlist_count > 0"
            link type="primary" size="small"
            @click="openWaitlist(row)"
          >{{ row.waitlist_count }}</el-button>
          <span v-else>0</span>
        </template>
      </el-table-column>
      <el-table-column label="允許候補" width="80" align="center">
        <template #default="{ row }">
          <el-tag :type="row.allow_waitlist ? 'success' : 'info'" size="small">
            {{ row.allow_waitlist ? '是' : '否' }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column label="影片" width="60" align="center">
        <template #default="{ row }">
          <a v-if="row.video_url" :href="row.video_url" target="_blank" rel="noopener">
            <el-icon><VideoPlay /></el-icon>
          </a>
          <span v-else>-</span>
        </template>
      </el-table-column>
      <el-table-column label="操作" width="130" align="center" fixed="right">
        <template #default="{ row }">
          <el-button size="small" @click="openEdit(row)">編輯</el-button>
          <el-button size="small" type="danger" @click="handleDelete(row)" :loading="deletingId === row.id">停用</el-button>
        </template>
      </el-table-column>
    </el-table>

    <el-empty
      v-if="!loading && courses.length === 0"
      description="尚無課程資料"
      style="padding: 40px 0"
    />

    <!-- 新增/編輯對話框 -->
    <el-dialog v-model="dialogVisible" :title="editingId ? '編輯課程' : '新增課程'" width="480px" destroy-on-close>
      <el-form :model="form" label-width="90px" size="default">
        <el-form-item label="課程名稱" required>
          <el-input v-model="form.name" />
        </el-form-item>
        <el-form-item label="價格（元）" required>
          <el-input-number v-model="form.price" :min="0" style="width: 100%" />
        </el-form-item>
        <el-form-item label="堂數">
          <el-input-number v-model="form.sessions" :min="1" style="width: 100%" />
        </el-form-item>
        <el-form-item label="容量">
          <el-input-number v-model="form.capacity" :min="1" style="width: 100%" />
        </el-form-item>
        <el-form-item label="允許候補">
          <el-switch v-model="form.allow_waitlist" />
        </el-form-item>
        <el-form-item label="影片 URL">
          <el-input v-model="form.video_url" />
        </el-form-item>
        <el-form-item label="說明">
          <el-input v-model="form.description" type="textarea" :rows="2" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" @click="handleSave" :loading="saving" :disabled="saving">儲存</el-button>
      </template>
    </el-dialog>
  <!-- 候補名單 Drawer -->
  <el-drawer
    v-model="waitlistDrawer"
    :title="`候補名單 — ${waitlistCourse?.name ?? ''}`"
    direction="rtl" size="420px" destroy-on-close
  >
    <el-table :data="waitlistItems" v-loading="waitlistLoading" border size="small">
      <el-table-column label="序號" prop="waitlist_position" width="60" align="center" />
      <el-table-column label="學生姓名" prop="student_name" min-width="90" />
      <el-table-column label="班級" prop="class_name" width="90" />
      <el-table-column label="操作" width="80" align="center">
        <template #default="{ row }">
          <el-button size="small" type="success"
            :loading="promotingId === row.course_record_id"
            @click="handleWaitlistPromote(row)">升正式</el-button>
        </template>
      </el-table-column>
    </el-table>
    <div v-if="!waitlistLoading && waitlistItems.length === 0"
         style="text-align:center; padding: 32px; color: #94a3b8;">
      目前無候補學生
    </div>
  </el-drawer>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { VideoPlay } from '@element-plus/icons-vue'
import { getCourses, createCourse, updateCourse, deleteCourse,
         getCourseWaitlist, promoteWaitlist } from '@/api/activity'

const courses = ref([])
const loading = ref(false)
const deletingId = ref(null)
const dialogVisible = ref(false)
const saving = ref(false)
const editingId = ref(null)

const defaultForm = () => ({
  name: '',
  price: 0,
  sessions: null,
  capacity: 30,
  allow_waitlist: true,
  video_url: '',
  description: '',
})
const form = ref(defaultForm())

const waitlistDrawer = ref(false)
const waitlistCourse = ref(null)
const waitlistItems = ref([])
const waitlistLoading = ref(false)
const promotingId = ref(null)

async function openWaitlist(row) {
  waitlistCourse.value = { id: row.id, name: row.name }
  waitlistDrawer.value = true
  waitlistLoading.value = true
  try {
    const res = await getCourseWaitlist(row.id)
    waitlistItems.value = res.data.items
  } catch {
    ElMessage.error('載入候補名單失敗')
  } finally {
    waitlistLoading.value = false
  }
}

async function handleWaitlistPromote(item) {
  if (promotingId.value !== null) return
  promotingId.value = item.course_record_id
  try {
    await promoteWaitlist(item.registration_id, waitlistCourse.value.id)
    ElMessage.success(`${item.student_name} 已升為正式報名`)
    const res = await getCourseWaitlist(waitlistCourse.value.id)
    waitlistItems.value = res.data.items
    await fetchCourses()
  } catch (e) {
    ElMessage.error(e?.response?.data?.detail || '升正式失敗')
  } finally {
    promotingId.value = null
  }
}

async function fetchCourses() {
  loading.value = true
  try {
    const res = await getCourses()
    courses.value = res.data.courses
  } catch {
    ElMessage.error('載入失敗')
  } finally {
    loading.value = false
  }
}

function openCreate() {
  editingId.value = null
  form.value = defaultForm()
  dialogVisible.value = true
}

function openEdit(row) {
  editingId.value = row.id
  form.value = {
    name: row.name,
    price: row.price,
    sessions: row.sessions,
    capacity: row.capacity,
    allow_waitlist: row.allow_waitlist,
    video_url: row.video_url || '',
    description: row.description || '',
  }
  dialogVisible.value = true
}

async function handleSave() {
  if (!form.value.name || form.value.price == null) {
    return ElMessage.warning('請填寫課程名稱和價格')
  }
  saving.value = true
  try {
    if (editingId.value) {
      await updateCourse(editingId.value, form.value)
      ElMessage.success('課程更新成功')
    } else {
      await createCourse(form.value)
      ElMessage.success('課程新增成功')
    }
    dialogVisible.value = false
    fetchCourses()
  } catch (e) {
    ElMessage.error(e?.response?.data?.detail || '操作失敗')
  } finally {
    saving.value = false
  }
}

async function handleDelete(row) {
  try {
    await ElMessageBox.confirm(`確定要停用課程「${row.name}」嗎？`, '確認停用', {
      type: 'warning',
      confirmButtonText: '確定停用',
      confirmButtonClass: 'el-button--danger',
    })
  } catch {
    return
  }
  deletingId.value = row.id
  try {
    await deleteCourse(row.id)
    ElMessage.success('課程已停用')
    fetchCourses()
  } catch (e) {
    ElMessage.error(e?.response?.data?.detail || '停用失敗')
  } finally {
    deletingId.value = null
  }
}

onMounted(fetchCourses)
</script>

<style scoped>
.activity-courses { padding: 16px; }
.toolbar { display: flex; align-items: center; justify-content: space-between; margin-bottom: 16px; }
.toolbar h2 { margin: 0; font-size: 20px; font-weight: 600; }
</style>
