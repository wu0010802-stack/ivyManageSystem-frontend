<script setup>
import { ref, reactive, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { getAnnouncements, createAnnouncement, updateAnnouncement, deleteAnnouncement } from '@/api/announcements'

const loading = ref(false)
const announcements = ref([])
const dialogVisible = ref(false)
const isEdit = ref(false)

const priorityOptions = [
  { value: 'normal', label: '一般', type: 'info' },
  { value: 'important', label: '重要', type: 'warning' },
  { value: 'urgent', label: '緊急', type: 'danger' },
]

const priorityMap = Object.fromEntries(priorityOptions.map(p => [p.value, p]))

const form = reactive({
  id: null,
  title: '',
  content: '',
  priority: 'normal',
  is_pinned: false,
})

const resetForm = () => {
  form.id = null
  form.title = ''
  form.content = ''
  form.priority = 'normal'
  form.is_pinned = false
}

const fetchAnnouncements = async () => {
  loading.value = true
  try {
    const res = await getAnnouncements()
    announcements.value = res.data.items || []
  } catch (error) {
    ElMessage.error(error.response?.data?.detail || '載入失敗')
  } finally {
    loading.value = false
  }
}

const openAdd = () => {
  resetForm()
  isEdit.value = false
  dialogVisible.value = true
}

const openEdit = (row) => {
  form.id = row.id
  form.title = row.title
  form.content = row.content
  form.priority = row.priority
  form.is_pinned = row.is_pinned
  isEdit.value = true
  dialogVisible.value = true
}

const submitLoading = ref(false)

const handleSubmit = async () => {
  if (!form.title.trim() || !form.content.trim()) {
    ElMessage.warning('請填寫標題和內容')
    return
  }
  submitLoading.value = true
  try {
    if (isEdit.value) {
      await updateAnnouncement(form.id, {
        title: form.title,
        content: form.content,
        priority: form.priority,
        is_pinned: form.is_pinned,
      })
      ElMessage.success('公告已更新')
    } else {
      await createAnnouncement({
        title: form.title,
        content: form.content,
        priority: form.priority,
        is_pinned: form.is_pinned,
      })
      ElMessage.success('公告已發佈')
    }
    dialogVisible.value = false
    fetchAnnouncements()
  } catch (error) {
    ElMessage.error(error.response?.data?.detail || '操作失敗')
  } finally {
    submitLoading.value = false
  }
}

const handleDelete = async (row) => {
  try {
    await ElMessageBox.confirm(`確定要刪除公告「${row.title}」嗎？`, '確認刪除', {
      confirmButtonText: '刪除',
      cancelButtonText: '取消',
      type: 'warning',
    })
    await deleteAnnouncement(row.id)
    ElMessage.success('公告已刪除')
    fetchAnnouncements()
  } catch (e) {
    if (e !== 'cancel') {
      ElMessage.error('刪除失敗')
    }
  }
}

const togglePin = async (row) => {
  try {
    await updateAnnouncement(row.id, { is_pinned: !row.is_pinned })
    ElMessage.success(row.is_pinned ? '已取消置頂' : '已置頂')
    fetchAnnouncements()
  } catch (error) {
    ElMessage.error('操作失敗')
  }
}

const formatDate = (isoStr) => {
  if (!isoStr) return ''
  const d = new Date(isoStr)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

onMounted(() => {
  fetchAnnouncements()
})
</script>

<template>
  <div class="announcement-view">
    <div class="page-header">
      <h2>公告管理</h2>
      <el-button type="primary" @click="openAdd">新增公告</el-button>
    </div>

    <el-table :data="announcements" v-loading="loading" stripe border style="width: 100%" max-height="600">
      <el-table-column label="置頂" width="70" align="center">
        <template #default="{ row }">
          <el-button
            :type="row.is_pinned ? 'warning' : 'default'"
            size="small"
            circle
            @click="togglePin(row)"
            :title="row.is_pinned ? '取消置頂' : '置頂'"
          >
            <el-icon><Top /></el-icon>
          </el-button>
        </template>
      </el-table-column>

      <el-table-column label="優先級" width="90" align="center">
        <template #default="{ row }">
          <el-tag :type="priorityMap[row.priority]?.type || 'info'" size="small">
            {{ priorityMap[row.priority]?.label || row.priority }}
          </el-tag>
        </template>
      </el-table-column>

      <el-table-column label="標題" prop="title" min-width="200">
        <template #default="{ row }">
          <span style="font-weight: 600;">{{ row.title }}</span>
        </template>
      </el-table-column>

      <el-table-column label="內容預覽" min-width="250">
        <template #default="{ row }">
          <span style="color: #666;">{{ row.content.length > 60 ? row.content.slice(0, 60) + '...' : row.content }}</span>
        </template>
      </el-table-column>

      <el-table-column label="發佈者" prop="created_by_name" width="100" />

      <el-table-column label="已讀人數" width="90" align="center">
        <template #default="{ row }">
          <el-tag type="success" size="small">{{ row.read_count }}</el-tag>
        </template>
      </el-table-column>

      <el-table-column label="發佈時間" width="160">
        <template #default="{ row }">
          {{ formatDate(row.created_at) }}
        </template>
      </el-table-column>

      <el-table-column label="操作" width="140" align="center">
        <template #default="{ row }">
          <el-button type="primary" size="small" @click="openEdit(row)">編輯</el-button>
          <el-button type="danger" size="small" @click="handleDelete(row)">刪除</el-button>
        </template>
      </el-table-column>
    </el-table>

    <!-- Add/Edit Dialog -->
    <el-dialog
      :title="isEdit ? '編輯公告' : '新增公告'"
      v-model="dialogVisible"
      width="600px"
      :close-on-click-modal="false"
    >
      <el-form label-width="80px">
        <el-form-item label="標題">
          <el-input v-model="form.title" placeholder="請輸入公告標題" maxlength="200" show-word-limit />
        </el-form-item>
        <el-form-item label="優先級">
          <el-select v-model="form.priority" style="width: 100%;">
            <el-option
              v-for="opt in priorityOptions"
              :key="opt.value"
              :label="opt.label"
              :value="opt.value"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="置頂">
          <el-switch v-model="form.is_pinned" />
        </el-form-item>
        <el-form-item label="內容">
          <el-input
            v-model="form.content"
            type="textarea"
            :rows="8"
            placeholder="請輸入公告內容"
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" @click="handleSubmit" :loading="submitLoading">
          {{ isEdit ? '更新' : '發佈' }}
        </el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.announcement-view {
  padding: 0;
}
</style>
