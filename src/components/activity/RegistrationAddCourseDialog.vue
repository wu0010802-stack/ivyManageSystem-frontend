<template>
  <el-dialog
    :model-value="modelValue"
    @update:model-value="emit('update:modelValue', $event)"
    title="新增課程"
    width="480px"
    :close-on-click-modal="false"
  >
    <el-form label-width="90px">
      <el-form-item label="選擇課程" required>
        <el-select
          v-model="addCourseId"
          filterable
          placeholder="選擇要加入的課程"
          style="width: 100%"
        >
          <el-option
            v-for="c in availableCourses"
            :key="c.id"
            :label="`${c.name}（$${c.price}，剩 ${c.remaining}/${c.capacity}）`"
            :value="c.id"
          >
            <span>{{ c.name }}</span>
            <span style="float: right; color: #999; font-size: 12px">
              ${{ c.price }}｜{{ c.remaining > 0 ? `剩 ${c.remaining}` : (c.allow_waitlist ? '候補' : '額滿') }}
            </span>
          </el-option>
        </el-select>
      </el-form-item>
      <el-alert
        v-if="waitlistHint"
        type="warning"
        :closable="false"
        :title="waitlistHint"
        show-icon
      />
    </el-form>
    <template #footer>
      <el-button @click="emit('update:modelValue', false)">取消</el-button>
      <el-button
        type="primary"
        :loading="adding"
        :disabled="!addCourseId"
        @click="handleAdd"
      >確認新增</el-button>
    </template>
  </el-dialog>
</template>

<script setup>
import { computed, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { addRegistrationCourse } from '@/api/activity'

const props = defineProps({
  modelValue: { type: Boolean, default: false },
  registrationId: { type: [String, Number], default: null },
  courseOptions: { type: Array, default: () => [] },
  enrolledCourseIds: { type: Array, default: () => [] }, // 已選課程 id（過濾用）
})
const emit = defineEmits(['update:modelValue', 'added'])

const addCourseId = ref(null)
const adding = ref(false)

watch(
  () => props.modelValue,
  (open) => {
    if (open) addCourseId.value = null
  }
)

const availableCourses = computed(() => {
  const enrolled = new Set(props.enrolledCourseIds)
  return props.courseOptions.filter((c) => !enrolled.has(c.id))
})

const waitlistHint = computed(() => {
  if (!addCourseId.value) return ''
  const c = props.courseOptions.find((x) => x.id === addCourseId.value)
  if (!c) return ''
  if (c.remaining > 0) return ''
  if (c.allow_waitlist) return `課程「${c.name}」已額滿，新增後將進入候補`
  return `課程「${c.name}」已額滿且不開放候補，無法新增`
})

async function handleAdd() {
  if (!props.registrationId || !addCourseId.value || adding.value) return
  adding.value = true
  try {
    const res = await addRegistrationCourse(props.registrationId, addCourseId.value)
    ElMessage.success(res.data.message || '課程新增成功')
    emit('update:modelValue', false)
    emit('added')
  } catch (e) {
    ElMessage.error(e?.response?.data?.detail || '新增失敗')
  } finally {
    adding.value = false
  }
}
</script>
