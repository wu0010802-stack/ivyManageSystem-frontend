<template>
  <el-card
    class="slot-card"
    :class="{ 'slot-card--current': isCurrent }"
    shadow="never"
  >
    <template #header>
      <div class="slot-card__header">
        <span class="slot-card__icon">{{ slotMeta.icon }}</span>
        <span class="slot-card__label">{{ slotMeta.label }}</span>
        <span class="slot-card__time">
          {{ slotMeta.start }}–{{ slotMeta.end }}
        </span>
        <el-tag v-if="isCurrent" type="success" size="small">當下</el-tag>
      </div>
    </template>

    <ClassHubTaskRow
      v-for="task in slot.tasks"
      :key="task.kind + (task.due_at || '')"
      :kind="task.kind"
      :count="task.count"
      :action-mode="task.action_mode"
      @open-sheet="$emit('open-sheet', task)"
      @jump-page="$emit('jump-page', task)"
    />
    <div v-if="slot.tasks.length === 0" class="slot-card__empty">
      本時段無待辦
    </div>
  </el-card>
</template>

<script setup>
import { computed } from 'vue'
import ClassHubTaskRow from './ClassHubTaskRow.vue'

const SLOT_META = {
  morning:   { icon: '🌅', label: '早晨', start: '07:00', end: '09:00' },
  forenoon:  { icon: '☀',  label: '上午', start: '09:00', end: '12:00' },
  noon:      { icon: '🍱', label: '午間', start: '12:00', end: '14:00' },
  afternoon: { icon: '🌆', label: '下午', start: '14:00', end: '18:00' },
}

const props = defineProps({
  slot: { type: Object, required: true }, // { slot_id, tasks }
  isCurrent: { type: Boolean, default: false },
})
defineEmits(['open-sheet', 'jump-page'])

const slotMeta = computed(
  () => SLOT_META[props.slot.slot_id] ?? { icon: '•', label: props.slot.slot_id, start: '', end: '' }
)
</script>

<style scoped>
.slot-card {
  margin-bottom: 12px;
}
.slot-card--current {
  border: 2px solid var(--el-color-primary);
  box-shadow: 0 4px 12px rgba(64, 158, 255, 0.15);
}
.slot-card__header {
  display: flex;
  align-items: center;
  gap: 8px;
}
.slot-card__icon {
  font-size: 20px;
}
.slot-card__label {
  font-weight: 600;
}
.slot-card__time {
  color: var(--el-text-color-secondary);
  font-size: 13px;
}
.slot-card__empty {
  color: var(--el-text-color-secondary);
  text-align: center;
  padding: 16px 0;
}
</style>
