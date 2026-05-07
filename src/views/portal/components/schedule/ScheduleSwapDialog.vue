<script setup>
/**
 * ScheduleSwapDialog — 換班申請表單
 *
 * Mobile：使用 TeacherBottomSheet（snap mid/full）
 * Desktop：使用 el-dialog
 *
 * Props：
 *  - modelValue:       v-model 顯示/隱藏
 *  - isMobile:         是否 mobile 模式
 *  - initialDate:      從 cell click 帶入的預設日期（YYYY-MM-DD）
 *  - candidates:       可換班對象清單 [{ employee_id, name, shift_name, work_start, work_end, has_pending_swap }]
 *  - candidatesLoading:candidates 載入中
 *  - loading:          submit 中
 *
 * Emits：
 *  - update:modelValue
 *  - date-change(dateStr)    使用者手動改日期時，通知外層重新拉 candidates
 *  - submit({ swap_date, target_id, reason })
 */
import { computed, ref, watch } from 'vue'
import TeacherBottomSheet from '@/components/portal/TeacherBottomSheet.vue'

const props = defineProps({
  modelValue:        { type: Boolean, required: true },
  isMobile:          { type: Boolean, default: false },
  initialDate:       { type: String, default: '' },
  candidates:        { type: Array, default: () => [] },
  candidatesLoading: { type: Boolean, default: false },
  loading:           { type: Boolean, default: false },
})

const emit = defineEmits(['update:modelValue', 'date-change', 'submit'])

const visible = computed({
  get: () => props.modelValue,
  set: (v) => emit('update:modelValue', v),
})

const form = ref({
  date: '',
  target_id: null,
  reason: '',
})

// 開啟時重設 form，帶入 initialDate
watch(
  () => props.modelValue,
  (opened) => {
    if (opened) {
      form.value = {
        date: props.initialDate || '',
        target_id: null,
        reason: '',
      }
    }
  },
  { immediate: true }
)

const onDateChange = (val) => {
  form.value.target_id = null
  emit('date-change', val)
}

// 今天凌晨，用於停用過去日期
const todayMidnight = new Date()
todayMidnight.setHours(0, 0, 0, 0)
const disabledDate = (d) => d < todayMidnight

function submit() {
  if (!form.value.date || !form.value.target_id) return
  emit('submit', {
    swap_date: form.value.date,
    target_id: form.value.target_id,
    reason: form.value.reason,
  })
}

const canSubmit = computed(() => !!form.value.date && !!form.value.target_id)
</script>

<template>
  <!-- ===== Mobile: TeacherBottomSheet ===== -->
  <TeacherBottomSheet
    v-if="isMobile"
    v-model="visible"
    title="發起換班申請"
    :snap-points="['mid', 'full']"
    default-snap="mid"
  >
    <div class="swap-form">
      <el-form label-width="80px">
        <el-form-item label="換班日期">
          <el-date-picker
            v-model="form.date"
            type="date"
            placeholder="選擇日期"
            value-format="YYYY-MM-DD"
            :disabled-date="disabledDate"
            style="width: 100%"
            @change="onDateChange"
          />
        </el-form-item>
        <el-form-item label="換班對象">
          <el-select
            v-model="form.target_id"
            placeholder="選擇老師"
            style="width: 100%"
            :loading="candidatesLoading"
            :disabled="!form.date"
          >
            <el-option
              v-for="c in candidates"
              :key="c.employee_id"
              :label="`${c.name} (${c.shift_name}${c.work_start ? ' ' + c.work_start + '~' + c.work_end : ''})`"
              :value="c.employee_id"
              :disabled="c.has_pending_swap"
            >
              <span>{{ c.name }}</span>
              <span style="float: right; color: var(--text-secondary); font-size: 12px">
                {{ c.shift_name }}
                <span v-if="c.has_pending_swap" style="color: var(--el-color-danger)">(已有換班)</span>
              </span>
            </el-option>
          </el-select>
        </el-form-item>
        <el-form-item label="原因">
          <el-input v-model="form.reason" type="textarea" :rows="2" placeholder="選填" />
        </el-form-item>
      </el-form>
    </div>
    <template #footer>
      <el-button @click="visible = false">取消</el-button>
      <el-button
        type="primary"
        :disabled="!canSubmit"
        :loading="loading"
        @click="submit"
      >送出申請</el-button>
    </template>
  </TeacherBottomSheet>

  <!-- ===== Desktop: el-dialog ===== -->
  <el-dialog
    v-else
    v-model="visible"
    title="發起換班申請"
    width="500px"
  >
    <el-form label-width="80px">
      <el-form-item label="換班日期">
        <el-date-picker
          v-model="form.date"
          type="date"
          placeholder="選擇日期"
          value-format="YYYY-MM-DD"
          :disabled-date="disabledDate"
          style="width: 100%"
          @change="onDateChange"
        />
      </el-form-item>
      <el-form-item label="換班對象">
        <el-select
          v-model="form.target_id"
          placeholder="選擇老師"
          style="width: 100%"
          :loading="candidatesLoading"
          :disabled="!form.date"
        >
          <el-option
            v-for="c in candidates"
            :key="c.employee_id"
            :label="`${c.name} (${c.shift_name}${c.work_start ? ' ' + c.work_start + '~' + c.work_end : ''})`"
            :value="c.employee_id"
            :disabled="c.has_pending_swap"
          >
            <span>{{ c.name }}</span>
            <span style="float: right; color: var(--text-secondary); font-size: 12px">
              {{ c.shift_name }}
              <span v-if="c.has_pending_swap" style="color: var(--el-color-danger)">(已有換班)</span>
            </span>
          </el-option>
        </el-select>
      </el-form-item>
      <el-form-item label="原因">
        <el-input v-model="form.reason" type="textarea" :rows="2" placeholder="選填" />
      </el-form-item>
    </el-form>
    <template #footer>
      <el-button @click="visible = false">取消</el-button>
      <el-button
        type="primary"
        :disabled="!canSubmit"
        :loading="loading"
        @click="submit"
      >送出申請</el-button>
    </template>
  </el-dialog>
</template>

<style scoped>
.swap-form {
  padding: var(--space-2) 0;
}
</style>
