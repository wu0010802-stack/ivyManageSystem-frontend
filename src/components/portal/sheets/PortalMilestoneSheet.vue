<script setup lang="ts">
// 2026-09-03 UI 收斂：教師端不再選 emoji 圖示（原「圖示（選填）」區塊已移除，
// `icon` 欄位不再送入 payload）；家長端 MilestoneCard 依 milestone_type 自行對應 Material icon。
import { ref, watch, computed, type Component } from 'vue'
import { todayISO } from '@/utils/format'
import { ElMessage } from 'element-plus'
import { createMilestone } from '@/api/portalMilestones'
import { apiError } from '@/utils/error'
import {
  Present,
  Flag,
  Medal,
  Star,
  Aim,
  Brush,
  School,
  MagicStick,
  CircleCheck,
} from '@element-plus/icons-vue'

interface MilestoneType {
  value: string
  icon: Component
  label: string
}

interface MilestoneForm {
  milestone_type: string
  achieved_on: string
  title: string
  description: string
}

const props = defineProps<{
  modelValue: boolean
  studentId: number | string
  studentName?: string
}>()
const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  'done': []
  'next': []
}>()

const TYPES: MilestoneType[] = [
  { value: 'birthday', icon: Present, label: '生日' },
  { value: 'first_day', icon: Flag, label: '入學第一天' },
  { value: 'perfect_attendance_month', icon: Medal, label: '全勤月' },
  { value: 'first_solo_event', icon: Star, label: '首次獨立完成' },
  { value: 'assessment_excellence', icon: Aim, label: '評估優異' },
  { value: 'activity_first_join', icon: Brush, label: '首次參加才藝' },
  { value: 'graduation', icon: School, label: '畢業' },
  { value: 'custom', icon: MagicStick, label: '自訂' },
]

const today = () => todayISO()

const form = ref<MilestoneForm>({
  milestone_type: '',
  achieved_on: today(),
  title: '',
  description: '',
})
const submitting = ref(false)
const recorded = ref(false)

watch(
  () => props.modelValue,
  (v) => {
    if (v) {
      form.value = {
        milestone_type: '',
        achieved_on: today(),
        title: '',
        description: '',
      }
      recorded.value = false
    }
  },
)

const canSubmit = computed(
  () => !!form.value.milestone_type && !!form.value.title.trim() && !submitting.value,
)

async function submit() {
  if (!canSubmit.value) return
  submitting.value = true
  try {
    const payload: Record<string, string> = {
      milestone_type: form.value.milestone_type,
      achieved_on: form.value.achieved_on,
      title: form.value.title.trim(),
    }
    if (form.value.description) payload.description = form.value.description
    await createMilestone(Number(props.studentId), payload)
    recorded.value = true
    emit('done')
    ElMessage.success('已記里程碑')
  } catch (e) {
    ElMessage.error(apiError(e, '記錄失敗'))
  } finally {
    submitting.value = false
  }
}

function recordAnother() {
  form.value = {
    milestone_type: '',
    achieved_on: form.value.achieved_on, // keep date
    title: '',
    description: '',
  }
  recorded.value = false
  emit('next')
}

function close() {
  emit('update:modelValue', false)
}
</script>

<template>
  <el-drawer
    :model-value="modelValue"
    direction="btt"
    size="85%"
    :show-close="true"
    :title="`記里程碑 — ${studentName}`"
    @update:model-value="(v) => emit('update:modelValue', v)"
  >
    <div class="milestone-sheet">
      <template v-if="!recorded">
        <div class="section">
          <label class="section-label">類型</label>
          <div class="chips">
            <button
              v-for="t in TYPES"
              :key="t.value"
              :class="['chip', { active: form.milestone_type === t.value }]"
              :data-test="`type-${t.value}`"
              @click="form.milestone_type = t.value"
            >
              <el-icon class="chip-icon" aria-hidden="true"><component :is="t.icon" /></el-icon>
              <span>{{ t.label }}</span>
            </button>
          </div>
        </div>

        <div class="row">
          <label>達成日</label>
          <input type="date" aria-label="達成日" :max="today()" v-model="form.achieved_on" />
        </div>

        <div class="row">
          <label>標題</label>
          <input
            type="text"
            maxlength="120"
            aria-label="里程碑標題"
            data-test="input-title"
            placeholder="例：第一次自己穿鞋"
            v-model="form.title"
          />
        </div>

        <div class="row">
          <label>描述</label>
          <textarea rows="3" aria-label="里程碑描述" v-model="form.description" />
        </div>

        <div class="actions">
          <button @click="close">取消</button>
          <button
            class="primary"
            data-test="submit-btn"
            :disabled="!canSubmit"
            @click="submit"
          >
            送出
          </button>
        </div>
      </template>

      <template v-else>
        <div class="recorded">
          <div class="ok"><el-icon aria-hidden="true"><CircleCheck /></el-icon> 已記</div>
          <div class="actions">
            <button class="primary" @click="recordAnother">再記一個</button>
            <button @click="close">完成</button>
          </div>
        </div>
      </template>
    </div>
  </el-drawer>
</template>

<style scoped>
.milestone-sheet {
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 0 16px 16px;
}
.section-label {
  display: block;
  font-weight: 600;
  margin-bottom: 8px;
}
.chips {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.chip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 8px 12px;
  border-radius: 999px;
  border: 1px solid var(--el-border-color);
  background: var(--el-fill-color-blank);
  color: var(--el-text-color-primary);
  cursor: pointer;
  font-size: 14px;
}
.chip.active {
  background: var(--el-color-primary-light-9);
  border-color: var(--el-color-primary);
  color: var(--el-color-primary);
}
.chip-icon {
  font-size: 16px;
}
.row {
  display: flex;
  gap: 12px;
  align-items: flex-start;
}
.row label {
  flex: 0 0 80px;
  padding-top: 8px;
  font-size: 14px;
}
.row input,
.row textarea {
  flex: 1;
  padding: 8px 12px;
  border: 1px solid var(--el-border-color);
  border-radius: 6px;
  font-size: 16px;
  font-family: inherit;
  background: var(--el-fill-color-blank);
  color: var(--el-text-color-primary);
}
.actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}
.actions button {
  padding: 10px 18px;
  border-radius: 8px;
  border: 1px solid var(--el-border-color);
  background: var(--el-fill-color-blank);
  color: var(--el-text-color-primary);
  cursor: pointer;
}
.actions button.primary {
  background: var(--el-color-primary);
  color: white;
  border: none;
}
.actions button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.recorded {
  text-align: center;
  padding: 24px;
}
.recorded .ok {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  font-size: 20px;
  margin-bottom: 16px;
}
.recorded .ok .el-icon {
  font-size: 28px;
  color: var(--el-color-success);
}
</style>
