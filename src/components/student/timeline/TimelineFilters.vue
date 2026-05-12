<script setup>
import { computed } from 'vue'
import { TIMELINE_SOURCE_TYPES } from '@/api/studentTimeline'

const props = defineProps({
  modelValue: {
    type: Object,
    default: () => ({ types: [], since: null, until: null }),
  },
})
const emit = defineEmits(['update:modelValue'])

const filters = computed({
  get: () => props.modelValue,
  set: (v) => emit('update:modelValue', v),
})

function toggleType(type) {
  const current = new Set(filters.value.types || [])
  if (current.has(type)) current.delete(type)
  else current.add(type)
  filters.value = { ...filters.value, types: [...current] }
}
</script>

<template>
  <div class="timeline-filters">
    <div class="row types">
      <el-checkbox
        v-for="t in TIMELINE_SOURCE_TYPES"
        :key="t.value"
        :model-value="filters.types.includes(t.value)"
        @change="toggleType(t.value)"
      >
        {{ t.icon }} {{ t.label }}
      </el-checkbox>
    </div>
    <div class="row date-range">
      <el-date-picker
        v-model="filters.since"
        type="date"
        placeholder="從"
        value-format="YYYY-MM-DD"
      />
      <span>—</span>
      <el-date-picker
        v-model="filters.until"
        type="date"
        placeholder="至"
        value-format="YYYY-MM-DD"
      />
    </div>
  </div>
</template>

<style scoped>
.timeline-filters { display: flex; flex-direction: column; gap: 8px; padding-bottom: 8px; border-bottom: 1px solid var(--el-border-color-light); }
.row { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
</style>
