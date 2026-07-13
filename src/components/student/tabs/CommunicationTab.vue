<script setup lang="ts">
import { ref, reactive, computed, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Plus, Refresh } from '@element-plus/icons-vue'
import { getCommunications, deleteCommunication } from '@/api/studentCommunications'
import { hasPermission } from '@/utils/auth'
import { apiError } from '@/utils/error'
import CommunicationEditorDialog from '@/components/student/CommunicationEditorDialog.vue'

const props = withDefaults(defineProps<{
  studentId: number
  active?: boolean
}>(), {
  active: true,
})

const canWrite = computed(() => hasPermission('STUDENTS_WRITE'))

type ElTagType = '' | 'primary' | 'success' | 'warning' | 'info' | 'danger'
const COMM_TYPE_TAG: Record<string, ElTagType> = {
  電話: 'primary',
  LINE: 'success',
  面談: 'warning',
  Email: 'info',
  家聯簿: '',
  簡訊: 'primary',
  其他: 'info',
}

const items = ref<Record<string, unknown>[]>([])
const loading = ref(false)
const loaded = ref(false)
const editorDialog = reactive<{ visible: boolean; mode: string; initial: Record<string, unknown> | null }>({ visible: false, mode: 'create', initial: null })

async function fetchData() {
  if (!props.studentId) return
  loading.value = true
  try {
    const res = await getCommunications({ student_id: props.studentId, page_size: 200 })
    items.value = (res.data?.items ?? []) as unknown as Record<string, unknown>[]
    loaded.value = true
  } catch (e) {
    ElMessage.error(apiError(e, '載入家長溝通紀錄失敗'))
  } finally {
    loading.value = false
  }
}

watch(
  () => [props.active, props.studentId],
  ([active]) => {
    if (active && !loaded.value) fetchData()
  },
  { immediate: true },
)

const openCreate = () => {
  editorDialog.initial = null
  editorDialog.mode = 'create'
  editorDialog.visible = true
}

const openEdit = (row: Record<string, unknown>) => {
  editorDialog.initial = { ...row }
  editorDialog.mode = 'edit'
  editorDialog.visible = true
}

const handleDelete = async (row: Record<string, unknown>) => {
  try {
    await ElMessageBox.confirm('確定要刪除這筆家長溝通紀錄？', '確認刪除', { type: 'warning' })
    await deleteCommunication(row.id as number)
    ElMessage.success('刪除成功')
    fetchData()
  } catch (e) {
    if (e !== 'cancel') ElMessage.error(apiError(e, '刪除失敗'))
  }
}

const truncate = (text: string | null | undefined, len = 60) => {
  if (!text) return ''
  return text.length > len ? text.slice(0, len) + '…' : text
}

defineExpose({ refresh: fetchData })
</script>

<template>
  <div class="communication-tab">
    <div class="toolbar">
      <span class="muted">共 {{ items.length }} 筆</span>
      <div class="actions">
        <el-button
          v-if="canWrite"
          type="primary"
          size="small"
          :icon="Plus"
          @click="openCreate"
        >新增溝通</el-button>
        <el-button size="small" :icon="Refresh" @click="fetchData">重新整理</el-button>
      </div>
    </div>
    <el-empty v-if="!loading && !items.length" description="尚無家長溝通紀錄" />
    <el-table
      v-else
      v-loading="loading"
      :data="items"
      size="small"
      stripe
      max-height="560"
    >
      <el-table-column label="日期" prop="communication_date" width="120" />
      <el-table-column label="方式" width="90">
        <template #default="{ row }">
          <el-tag :type="COMM_TYPE_TAG[row.communication_type as string] || 'info'" size="small">
            {{ row.communication_type }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column label="主題" prop="topic" min-width="140">
        <template #default="{ row }">{{ row.topic || '-' }}</template>
      </el-table-column>
      <el-table-column label="內容" min-width="220">
        <template #default="{ row }">
          <el-tooltip :content="row.content || ''" placement="top" :show-after="500">
            <span>{{ truncate(row.content || '') }}</span>
          </el-tooltip>
        </template>
      </el-table-column>
      <el-table-column label="後續追蹤" min-width="160">
        <template #default="{ row }">
          <el-tooltip v-if="row.follow_up" :content="row.follow_up" placement="top" :show-after="500">
            <span>{{ truncate(row.follow_up) }}</span>
          </el-tooltip>
          <span v-else class="muted">-</span>
        </template>
      </el-table-column>
      <el-table-column v-if="canWrite" label="操作" width="130" fixed="right">
        <template #default="{ row }">
          <el-button size="small" text @click="openEdit(row)">編輯</el-button>
          <el-button size="small" text type="danger" @click="handleDelete(row)">刪除</el-button>
        </template>
      </el-table-column>
    </el-table>

    <CommunicationEditorDialog
      v-model:visible="editorDialog.visible"
      :mode="editorDialog.mode"
      :initial="editorDialog.initial"
      :default-student-id="studentId"
      @submitted="fetchData"
    />
  </div>
</template>

<style scoped>
.toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 10px;
  gap: 12px;
}
.actions {
  display: flex;
  gap: 8px;
}
.muted {
  color: var(--el-text-color-secondary);
  font-size: 0.85em;
}
</style>
