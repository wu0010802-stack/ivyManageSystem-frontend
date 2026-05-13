<script setup>
import { ref, watch, computed } from 'vue'
import { ElMessage } from 'element-plus'
import { createMilestone } from '@/api/portalMilestones'

const props = defineProps({
  modelValue: { type: Boolean, required: true },
  studentId: { type: [Number, String], required: true },
  studentName: { type: String, default: '' },
})
const emit = defineEmits(['update:modelValue', 'done', 'next'])

const TYPES = [
  { value: 'birthday', emoji: '🎂', label: '生日' },
  { value: 'first_day', emoji: '🌱', label: '入學第一天' },
  { value: 'perfect_attendance_month', emoji: '🏆', label: '全勤月' },
  { value: 'first_solo_event', emoji: '⭐', label: '首次獨立完成' },
  { value: 'assessment_excellence', emoji: '🎯', label: '評估優異' },
  { value: 'activity_first_join', emoji: '🎨', label: '首次參加才藝' },
  { value: 'graduation', emoji: '🎓', label: '畢業' },
  { value: 'custom', emoji: '✨', label: '自訂' },
]
const ICON_OPTIONS = ['🎂', '🌟', '🏆', '🎓', '🎨', '🎵']

const today = () => new Date().toISOString().slice(0, 10)

const form = ref({
  milestone_type: '',
  achieved_on: today(),
  title: '',
  description: '',
  icon: null,
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
        icon: null,
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
    const payload = {
      milestone_type: form.value.milestone_type,
      achieved_on: form.value.achieved_on,
      title: form.value.title.trim(),
    }
    if (form.value.description) payload.description = form.value.description
    if (form.value.icon) payload.icon = form.value.icon
    await createMilestone(props.studentId, payload)
    recorded.value = true
    emit('done')
    ElMessage.success('已記里程碑')
  } catch (e) {
    ElMessage.error(e?.response?.data?.detail || '記錄失敗')
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
    icon: null,
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
              <span class="chip-emoji">{{ t.emoji }}</span>
              <span>{{ t.label }}</span>
            </button>
          </div>
        </div>

        <div class="row">
          <label>達成日</label>
          <input type="date" :max="today()" v-model="form.achieved_on" />
        </div>

        <div class="row">
          <label>標題</label>
          <input
            type="text"
            maxlength="120"
            data-test="input-title"
            placeholder="例：第一次自己穿鞋"
            v-model="form.title"
          />
        </div>

        <div class="row">
          <label>描述</label>
          <textarea rows="3" v-model="form.description" />
        </div>

        <div class="section">
          <label class="section-label">圖示（選填）</label>
          <div class="chips">
            <button
              v-for="i in ICON_OPTIONS"
              :key="i"
              :class="['chip', 'icon-chip', { active: form.icon === i }]"
              @click="form.icon = form.icon === i ? null : i"
            >
              {{ i }}
            </button>
          </div>
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
          <div class="ok">⭐ 已記</div>
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
  background: white;
  cursor: pointer;
  font-size: 14px;
}
.chip.active {
  background: var(--el-color-primary-light-9);
  border-color: var(--el-color-primary);
  color: var(--el-color-primary);
}
.icon-chip {
  font-size: 22px;
  padding: 4px 10px;
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
  background: white;
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
  font-size: 32px;
  margin-bottom: 16px;
}
</style>
