<template>
  <el-dialog
    :model-value="modelValue"
    @update:model-value="emit('update:modelValue', $event)"
    title="新增用品"
    width="480px"
    :close-on-click-modal="false"
  >
    <el-form label-width="90px">
      <el-form-item label="選擇用品" required>
        <el-select
          v-model="supplyId"
          filterable
          placeholder="選擇要加入的用品"
          style="width: 100%"
          :loading="loadingSupplies"
        >
          <el-option
            v-for="s in supplies"
            :key="s.id"
            :label="`${s.name}（$${s.price}）`"
            :value="s.id"
          />
        </el-select>
      </el-form-item>
    </el-form>
    <template #footer>
      <el-button @click="emit('update:modelValue', false)">取消</el-button>
      <el-button
        type="primary"
        :loading="adding"
        :disabled="!supplyId"
        @click="handleAdd"
      >確認新增</el-button>
    </template>
  </el-dialog>
</template>

<script setup>
import { ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { addRegistrationSupply, getSupplies } from '@/api/activity'

const props = defineProps({
  modelValue: { type: Boolean, default: false },
  registrationId: { type: [String, Number], default: null },
  schoolYear: { type: Number, required: true },
  semester: { type: Number, required: true },
})
const emit = defineEmits(['update:modelValue', 'added'])

const supplyId = ref(null)
const adding = ref(false)
const loadingSupplies = ref(false)
const supplies = ref([])

async function loadSupplies() {
  if (supplies.value.length > 0) return
  loadingSupplies.value = true
  try {
    const res = await getSupplies({ school_year: props.schoolYear, semester: props.semester })
    supplies.value = res.data.supplies || []
  } catch {
    ElMessage.warning('用品清單載入失敗')
  } finally {
    loadingSupplies.value = false
  }
}

watch(
  () => props.modelValue,
  (open) => {
    if (!open) return
    supplyId.value = null
    loadSupplies()
  }
)

watch(
  () => [props.schoolYear, props.semester],
  () => {
    supplies.value = []
  }
)

async function handleAdd() {
  if (!props.registrationId || !supplyId.value || adding.value) return
  adding.value = true
  try {
    await addRegistrationSupply(props.registrationId, supplyId.value)
    ElMessage.success('用品新增成功')
    emit('update:modelValue', false)
    emit('added')
  } catch (e) {
    ElMessage.error(e?.response?.data?.detail || '新增失敗')
  } finally {
    adding.value = false
  }
}
</script>
