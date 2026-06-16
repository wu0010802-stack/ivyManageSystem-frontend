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
            v-for="s in availableSupplies"
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

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { addRegistrationSupply, getSupplies } from '@/api/activity'
import { excludeAddedSupplies } from '@/utils/activityDisplay'

interface Supply {
  id: number | string
  name: string
  price?: number
  [key: string]: unknown
}

const props = withDefaults(defineProps<{
  modelValue?: boolean
  registrationId?: string | number | null
  schoolYear: number
  semester: number
  existingSupplyIds?: Array<number | string>
}>(), {
  modelValue: false,
  registrationId: null,
  existingSupplyIds: () => [],
})

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  'added': []
}>()

const supplyId = ref<number | string | null>(null)
const adding = ref<boolean>(false)
const loadingSupplies = ref<boolean>(false)
const supplies = ref<Supply[]>([])

// 剔除該報名已加入的用品，避免重複選撞唯一鍵（後端另有 409 硬擋）
const availableSupplies = computed(() =>
  excludeAddedSupplies(supplies.value, props.existingSupplyIds ?? []),
)

async function loadSupplies() {
  if (supplies.value.length > 0) return
  loadingSupplies.value = true
  try {
    const res = await getSupplies({ school_year: props.schoolYear, semester: props.semester })
    supplies.value = (res.data as { supplies?: Supply[] }).supplies || []
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
    await addRegistrationSupply(props.registrationId as number, supplyId.value as number)
    ElMessage.success('用品新增成功')
    emit('update:modelValue', false)
    emit('added')
  } catch (e) {
    const axiosErr = e as { response?: { data?: { detail?: string } } }
    ElMessage.error(axiosErr?.response?.data?.detail || '新增失敗')
  } finally {
    adding.value = false
  }
}
</script>
