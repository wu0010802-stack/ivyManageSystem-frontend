<template>
  <el-drawer
    :model-value="modelValue"
    title="費用範本管理"
    size="720px"
    @update:model-value="emit('update:modelValue', $event)"
    @open="loadTemplates"
  >
    <el-alert type="info" :closable="false" class="mb-12">
      範本修改僅影響之後產生的費用單；已產生的費用單不會回溯更新，差額請用「折抵／調整」處理。
    </el-alert>

    <div class="drawer-toolbar">
      <span class="term-label">{{ schoolYear }} 學年度 {{ semester === 1 ? '上' : '下' }}學期</span>
      <el-button type="primary" @click="openCreate">新增範本</el-button>
    </div>

    <el-table v-loading="loading" :data="templates">
      <el-table-column label="年級" width="90">
        <template #default="{ row }">{{ gradeName(row.grade_id) }}</template>
      </el-table-column>
      <el-table-column label="類型" width="90">
        <template #default="{ row }">{{ FEE_TYPE_LABELS[row.fee_type] || row.fee_type }}</template>
      </el-table-column>
      <el-table-column prop="name" label="名稱" min-width="160" />
      <el-table-column label="金額" width="110" align="right">
        <template #default="{ row }">{{ formatCurrency(row.amount) }}</template>
      </el-table-column>
      <el-table-column label="狀態" width="80">
        <template #default="{ row }">
          <el-tag :type="row.is_active ? 'success' : 'info'">{{ row.is_active ? '啟用' : '已停用' }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column label="操作" width="140">
        <template #default="{ row }">
          <el-button link type="primary" @click="openEdit(row)">編輯</el-button>
          <el-button v-if="row.is_active" link type="danger" @click="onDeactivate(row)">停用</el-button>
        </template>
      </el-table-column>
    </el-table>

    <FeeTemplateDialog
      v-model="dialogVisible"
      :template="editing"
      :grades="grades"
      @saved="onSaved"
    />
  </el-drawer>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { deleteFeeTemplate, getFeeTemplates } from '@/api/fees'
import FeeTemplateDialog from '@/components/fees/FeeTemplateDialog.vue'
import { FEE_TYPE_LABELS } from '@/components/fees/feeTypes'
import { formatCurrency } from '@/utils/currency'

interface TemplateRow {
  id: number
  grade_id: number | null
  school_year: number
  semester: number
  fee_type: string
  name: string
  amount: number
  due_date_offset_days?: number
  breakdown?: { tuition?: number; meal?: number; transport?: number }
  is_active?: boolean
  [key: string]: unknown
}

const props = defineProps<{
  modelValue: boolean
  schoolYear: number
  semester: number
  grades: { id: number; name: string }[]
}>()
const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  changed: []
}>()

const loading = ref(false)
const templates = ref<TemplateRow[]>([])
const dialogVisible = ref(false)
const editing = ref<TemplateRow | null>(null)

const gradeName = (gid: number | null) =>
  props.grades.find((g) => g.id === gid)?.name || (gid != null ? `#${gid}` : '—')

async function loadTemplates() {
  loading.value = true
  try {
    const list = await getFeeTemplates({ school_year: props.schoolYear, semester: props.semester })
    templates.value = (list || []) as TemplateRow[]
  } catch (e) {
    const err = e as { response?: { data?: { detail?: string } } }
    ElMessage.error(err.response?.data?.detail || '載入範本失敗')
  } finally {
    loading.value = false
  }
}

function openCreate() {
  editing.value = null
  dialogVisible.value = true
}

function openEdit(row: TemplateRow) {
  editing.value = row
  dialogVisible.value = true
}

async function onSaved() {
  dialogVisible.value = false
  await loadTemplates()
  emit('changed')
}

async function onDeactivate(row: TemplateRow) {
  try {
    await ElMessageBox.confirm(
      `確定要停用「${row.name}」嗎？停用後不再參與產單，已產生的費用單不受影響。`,
      '確認停用',
      { confirmButtonText: '停用', cancelButtonText: '取消', type: 'warning' },
    )
  } catch {
    return
  }
  try {
    await deleteFeeTemplate(row.id)
    ElMessage.success('已停用')
    await loadTemplates()
    emit('changed')
  } catch (e) {
    const err = e as { response?: { data?: { detail?: string } } }
    ElMessage.error(err.response?.data?.detail || '停用失敗')
  }
}

// el-drawer @open 於既有開啟時不觸發首次（modelValue 初始即 true 的測試情境），補一次主動載入
if (props.modelValue) void loadTemplates()
</script>

<style scoped>
.mb-12 { margin-bottom: 12px; }
.drawer-toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
}
.term-label { color: var(--el-text-color-secondary); }
</style>
