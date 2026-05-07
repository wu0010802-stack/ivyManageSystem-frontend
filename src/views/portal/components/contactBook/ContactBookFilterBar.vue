<script setup>
import { Refresh } from '@element-plus/icons-vue'

defineProps({
  classroomId: { type: Number, default: null },
  classroomOptions: { type: Array, required: true },
  logDate: { type: String, required: true },
  loading: { type: Boolean, default: false },
  batchBusy: { type: Boolean, default: false },
  showOnlyUnpublished: { type: Boolean, default: false },
})

defineEmits([
  'update:classroomId',
  'update:logDate',
  'update:showOnlyUnpublished',
  'refresh',
  'open-template',
  'open-batch',
  'open-copy',
])
</script>

<template>
  <div class="contact-book-filter-wrap">
    <div class="filter-header-row">
      <el-select
        :model-value="classroomId"
        placeholder="選擇班級"
        style="width: 180px"
        @update:model-value="$emit('update:classroomId', $event)"
      >
        <el-option
          v-for="o in classroomOptions"
          :key="o.value"
          :label="o.label"
          :value="o.value"
        />
      </el-select>

      <el-date-picker
        :model-value="logDate"
        type="date"
        value-format="YYYY-MM-DD"
        :clearable="false"
        style="width: 160px"
        @update:model-value="$emit('update:logDate', $event)"
      />

      <el-button :icon="Refresh" :loading="loading" @click="$emit('refresh')">
        重新整理
      </el-button>
    </div>

    <div v-if="classroomId" class="batch-bar pt-card">
      <el-button :loading="batchBusy" @click="$emit('open-copy')">複製昨日</el-button>
      <el-button :loading="batchBusy" @click="$emit('open-template')">套用範本到全班</el-button>
      <el-button :loading="batchBusy" type="success" @click="$emit('open-batch')">
        批次發布草稿
      </el-button>
      <el-divider direction="vertical" />
      <el-checkbox
        :model-value="showOnlyUnpublished"
        @update:model-value="$emit('update:showOnlyUnpublished', $event)"
      >
        只看未發布
      </el-checkbox>
    </div>
  </div>
</template>

<style scoped>
.contact-book-filter-wrap {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}

.filter-header-row {
  display: flex;
  gap: var(--space-2);
  align-items: center;
  flex-wrap: wrap;
}

.batch-bar {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-3);
}
</style>
