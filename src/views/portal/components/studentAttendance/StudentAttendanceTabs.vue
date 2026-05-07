<script setup>
defineProps({
  activeTab: { type: String, required: true }, // 'daily' | 'monthly'
  classrooms: { type: Array, required: true },
  classroomId: { type: [Number, null], default: null },
})

defineEmits(['update:activeTab', 'update:classroomId'])
</script>

<template>
  <div class="student-attendance-tabs">
    <div class="tabs-header">
      <el-radio-group
        :model-value="activeTab"
        @update:model-value="$emit('update:activeTab', $event)"
      >
        <el-radio-button label="daily">日點名</el-radio-button>
        <el-radio-button label="monthly">月統計</el-radio-button>
      </el-radio-group>

      <el-select
        :model-value="classroomId"
        placeholder="選擇班級"
        style="width: 200px"
        @update:model-value="$emit('update:classroomId', $event)"
      >
        <el-option
          v-for="c in classrooms"
          :key="c.classroom_id"
          :label="c.classroom_name"
          :value="c.classroom_id"
        />
      </el-select>
    </div>

    <div class="tabs-content">
      <slot v-if="activeTab === 'daily'" name="daily" />
      <slot v-else-if="activeTab === 'monthly'" name="monthly" />
    </div>
  </div>
</template>

<style scoped>
.student-attendance-tabs {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}

.tabs-header {
  display: flex;
  gap: var(--space-3);
  align-items: center;
  flex-wrap: wrap;
}
</style>
