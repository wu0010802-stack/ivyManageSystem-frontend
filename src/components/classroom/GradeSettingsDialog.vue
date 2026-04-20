<script setup>
import { ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { getGrades, updateGrade } from '@/api/classrooms'
import { apiError } from '@/utils/error'

const props = defineProps({
  visible: { type: Boolean, default: false },
  canWrite: { type: Boolean, default: false },
})
const emit = defineEmits(['update:visible', 'updated'])

const grades = ref([])
const loading = ref(false)
const savingId = ref(null)

const fetchGrades = async () => {
  loading.value = true
  try {
    const res = await getGrades()
    grades.value = (res.data || []).slice().sort(
      (a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0),
    )
  } catch (e) {
    ElMessage.error(apiError(e, '載入年級失敗'))
  } finally {
    loading.value = false
  }
}

watch(() => props.visible, (v) => { if (v) fetchGrades() })

const toggleGraduation = async (row, nextValue) => {
  if (!props.canWrite) return
  savingId.value = row.id
  try {
    await updateGrade(row.id, { is_graduation_grade: nextValue })
    row.is_graduation_grade = nextValue
    ElMessage.success(nextValue ? `已將「${row.name}」設為畢業班年級` : `已取消「${row.name}」的畢業班設定`)
    emit('updated')
  } catch (e) {
    ElMessage.error(apiError(e, '更新失敗'))
  } finally {
    savingId.value = null
  }
}

const close = () => emit('update:visible', false)
</script>

<template>
  <el-dialog
    :model-value="visible"
    title="年級設定"
    width="520px"
    @update:model-value="emit('update:visible', $event)"
  >
    <div class="dialog-hint">
      <el-text type="info" size="small">
        勾選為「畢業班年級」的年級，其在讀學生會於每年 7/31 自動轉為已畢業。
      </el-text>
    </div>
    <el-table v-loading="loading" :data="grades" size="small" stripe>
      <el-table-column prop="name" label="年級" min-width="100" />
      <el-table-column prop="age_range" label="年齡" width="100">
        <template #default="{ row }">
          <span>{{ row.age_range || '-' }}</span>
        </template>
      </el-table-column>
      <el-table-column label="畢業班年級" width="140" align="center">
        <template #default="{ row }">
          <el-switch
            :model-value="row.is_graduation_grade"
            :loading="savingId === row.id"
            :disabled="!canWrite || savingId === row.id"
            @change="(v) => toggleGraduation(row, v)"
          />
        </template>
      </el-table-column>
    </el-table>
    <template #footer>
      <el-button @click="close">關閉</el-button>
    </template>
  </el-dialog>
</template>

<style scoped>
.dialog-hint {
  margin-bottom: 12px;
}
</style>
