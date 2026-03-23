<script setup>
import { reactive, ref } from 'vue'
import { storeToRefs } from 'pinia'
import { createShiftType, updateShiftType, deleteShiftType } from '@/api/shifts'
import { ElMessage, ElMessageBox } from 'element-plus'
import { useShiftStore } from '@/stores/shift'
import { apiError } from '@/utils/error'

const shiftStore = useShiftStore()
const { shiftTypes, loading: loadingShifts } = storeToRefs(shiftStore)
const shiftDialogVisible = ref(false)
const shiftForm = reactive({ id: null, name: '', work_start: '08:00', work_end: '17:00', sort_order: 0 })

const handleAddShift = () => {
  shiftForm.id = null
  shiftForm.name = ''
  shiftForm.work_start = '08:00'
  shiftForm.work_end = '17:00'
  shiftForm.sort_order = shiftTypes.value.length + 1
  shiftDialogVisible.value = true
}

const handleEditShift = (row) => {
  shiftForm.id = row.id
  shiftForm.name = row.name
  shiftForm.work_start = row.work_start
  shiftForm.work_end = row.work_end
  shiftForm.sort_order = row.sort_order
  shiftDialogVisible.value = true
}

const handleDeleteShift = (row) => {
  ElMessageBox.confirm(`確定刪除班別「${row.name}」？`, '警告', { type: 'warning' })
    .then(async () => {
      try {
        await deleteShiftType(row.id)
        ElMessage.success('已刪除')
        shiftStore.refresh()
      } catch (error) {
        ElMessage.error(apiError(error, '刪除失敗'))
      }
    })
}

const saveShift = async () => {
  if (!shiftForm.name) {
    ElMessage.warning('請填寫班別名稱')
    return
  }
  try {
    if (shiftForm.id) {
      await updateShiftType(shiftForm.id, shiftForm)
    } else {
      await createShiftType(shiftForm)
    }
    ElMessage.success('已儲存')
    shiftDialogVisible.value = false
    shiftStore.refresh()
  } catch (error) {
    ElMessage.error(apiError(error, '儲存失敗'))
  }
}
</script>

<template>
  <div>
    <div class="tab-header">
      <el-button type="primary" @click="handleAddShift">新增班別</el-button>
    </div>
    <el-table :data="shiftTypes" v-loading="loadingShifts" style="width: 100%; margin-top: 20px;">
      <el-table-column prop="sort_order" label="排序" width="80" sortable />
      <el-table-column prop="name" label="班別名稱" />
      <el-table-column prop="work_start" label="上班時間" width="120" />
      <el-table-column prop="work_end" label="下班時間" width="120" />
      <el-table-column prop="is_active" label="狀態" width="80">
        <template #default="{ row }">
          <el-tag :type="row.is_active ? 'success' : 'info'" size="small">{{ row.is_active ? '啟用' : '停用' }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column label="操作" width="150">
        <template #default="scope">
          <el-button link type="primary" @click="handleEditShift(scope.row)">編輯</el-button>
          <el-button link type="danger" @click="handleDeleteShift(scope.row)">刪除</el-button>
        </template>
      </el-table-column>
    </el-table>

    <!-- Shift Type Dialog -->
    <el-dialog v-model="shiftDialogVisible" :title="shiftForm.id ? '編輯班別' : '新增班別'" width="450px">
      <el-form :model="shiftForm" label-width="100px">
        <el-form-item label="班別名稱">
          <el-input v-model="shiftForm.name" placeholder="例如：早值" />
        </el-form-item>
        <el-form-item label="上班時間">
          <el-time-select v-model="shiftForm.work_start" start="06:00" step="00:30" end="12:00" placeholder="選擇上班時間" />
        </el-form-item>
        <el-form-item label="下班時間">
          <el-time-select v-model="shiftForm.work_end" start="14:00" step="00:30" end="22:00" placeholder="選擇下班時間" />
        </el-form-item>
        <el-form-item label="排序">
          <el-input-number v-model="shiftForm.sort_order" :min="0" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="shiftDialogVisible = false">取消</el-button>
        <el-button type="primary" @click="saveShift">儲存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.tab-header {
  margin-top: 10px;
}
</style>
