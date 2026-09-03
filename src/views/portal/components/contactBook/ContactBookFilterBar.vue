<script setup lang="ts">
import { Refresh } from '@element-plus/icons-vue'

defineProps<{
  classroomId?: number | null
  classroomOptions: { value: number | string; label: string }[]
  logDate: string
  loading?: boolean
  batchBusy?: boolean
  showOnlyUnpublished?: boolean
}>()

defineEmits<{
  'update:classroomId': [value: number | null]
  'update:logDate': [value: string]
  'update:showOnlyUnpublished': [value: boolean]
  'refresh': []
  'open-template': []
  'open-batch': []
  'open-copy': []
}>()
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
        @update:model-value="(v) => $emit('update:showOnlyUnpublished', !!v)"
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
  flex-wrap: wrap;
  gap: var(--space-2);
  padding: var(--space-3);
}
/* EP 相鄰按鈕預設 margin-left 與 gap 疊加，折行後首顆會縮排 */
.batch-bar :deep(.el-button + .el-button) {
  margin-left: 0;
}

@media (--to-sm) {
  .batch-bar :deep(.el-divider--vertical) {
    display: none;
  }
  .batch-bar :deep(.el-checkbox) {
    width: 100%;
  }
}
</style>
