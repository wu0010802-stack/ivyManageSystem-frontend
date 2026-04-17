<template>
  <el-dialog
    :model-value="visible"
    title="管理登記月份"
    width="420px"
    @update:model-value="$emit('update:visible', $event)"
    @open="loadMonths"
  >
    <el-table :data="registeredMonths" border stripe size="small" style="margin-bottom:16px">
      <el-table-column prop="month" label="月份" />
      <el-table-column label="操作" width="80" align="center">
        <template #default="{ row }">
          <el-button type="danger" size="small" text @click="handleDelete(row.month)">刪除</el-button>
        </template>
      </el-table-column>
      <template #empty>
        <span style="color:#999">尚未手動登記任何月份</span>
      </template>
    </el-table>

    <div style="display:flex;gap:8px;align-items:center">
      <el-input
        v-model="newMonthInput"
        placeholder="輸入月份，如 115.04"
        size="small"
        style="flex:1"
        @keyup.enter="handleAdd"
      />
      <el-button type="primary" size="small" :loading="saving" @click="handleAdd">新增</el-button>
    </div>
    <div style="margin-top:6px;font-size:12px;color:#909399">
      格式：民國年.月，如 115.04（刪除只移除登記，不影響訪視記錄）
    </div>

    <template #footer>
      <el-button @click="$emit('update:visible', false)">關閉</el-button>
    </template>
  </el-dialog>
</template>

<script setup>
import { ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { getMonths, addMonth, deleteMonth } from '@/api/recruitment'
import { apiError } from '@/utils/error'

const props = defineProps({
  visible: { type: Boolean, required: true },
})

const emit = defineEmits(['update:visible', 'changed'])

const registeredMonths = ref([])
const newMonthInput = ref('')
const saving = ref(false)

const _validateMonthFormat = (v) => {
  const parts = v.trim().split('.')
  if (parts.length !== 2) return false
  const num = parseInt(parts[1], 10)
  return !isNaN(num) && num >= 1 && num <= 12
}

const loadMonths = async () => {
  try {
    const res = await getMonths()
    registeredMonths.value = res.data
  } catch (e) {
    ElMessage.error(apiError(e, '載入月份失敗'))
  }
}

const handleAdd = async () => {
  const month = newMonthInput.value.trim()
  if (!month) return
  if (!_validateMonthFormat(month)) {
    ElMessage.warning('格式錯誤，請輸入民國年.月，如 115.04')
    return
  }
  saving.value = true
  try {
    const res = await addMonth(month)
    registeredMonths.value.push(res.data)
    registeredMonths.value.sort((a, b) => a.month.localeCompare(b.month))
    newMonthInput.value = ''
    ElMessage.success(`已登記月份 ${month}`)
    emit('changed')
  } catch (e) {
    const msg = e.response?.status === 409 ? `月份 ${month} 已存在` : apiError(e, '新增失敗')
    ElMessage.error(msg)
  } finally {
    saving.value = false
  }
}

const handleDelete = async (month) => {
  try {
    await ElMessageBox.confirm(`確定刪除登記月份「${month}」？`, '確認刪除', {
      type: 'warning',
      confirmButtonText: '刪除',
      cancelButtonText: '取消',
    })
  } catch {
    return
  }
  try {
    await deleteMonth(month)
    registeredMonths.value = registeredMonths.value.filter((r) => r.month !== month)
    ElMessage.success(`已刪除登記月份 ${month}`)
    emit('changed')
  } catch (e) {
    ElMessage.error(apiError(e, '刪除失敗'))
  }
}
</script>
