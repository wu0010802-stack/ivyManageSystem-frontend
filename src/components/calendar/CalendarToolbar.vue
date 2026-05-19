<script setup lang="ts">
import { computed } from 'vue'
import type { CalendarLayer } from '@/api/calendar'
import { CALENDAR_LAYERS, LAYER_LABELS, LAYER_COLORS } from '@/constants/calendarLayers'

const props = defineProps<{
  modelValue: Set<CalendarLayer>
}>()

const emit = defineEmits<{
  'update:modelValue': [value: Set<CalendarLayer>]
}>()

const selectedArr = computed<CalendarLayer[]>({
  get: () => [...props.modelValue],
  set: (v) => emit('update:modelValue', new Set(v)),
})

function enableAll() {
  emit('update:modelValue', new Set(CALENDAR_LAYERS))
}

function disableAll() {
  emit('update:modelValue', new Set())
}
</script>

<template>
  <div class="calendar-toolbar" role="toolbar" aria-label="行事曆 layer 篩選">
    <el-checkbox-group v-model="selectedArr" size="small">
      <el-checkbox
        v-for="layer in CALENDAR_LAYERS"
        :key="layer"
        :value="layer"
        :style="{ '--layer-dot': LAYER_COLORS[layer] }"
      >
        <span class="layer-dot" />
        {{ LAYER_LABELS[layer] }}
      </el-checkbox>
    </el-checkbox-group>
    <el-button size="small" link @click="enableAll">全選</el-button>
    <el-button size="small" link @click="disableAll">清除</el-button>
  </div>
</template>

<style scoped>
.calendar-toolbar {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px 12px;
  margin-bottom: var(--space-3);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-sm);
  background: var(--bg-color-soft);
  flex-wrap: wrap;
}

.layer-dot {
  display: inline-block;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--layer-dot);
  margin-right: 4px;
  vertical-align: middle;
}
</style>
