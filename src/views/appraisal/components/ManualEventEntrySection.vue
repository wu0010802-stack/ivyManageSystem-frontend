<script setup>
import { computed } from 'vue'
import {
  useManualEventEntry,
  MANUAL_ITEM_CODES,
  MANUAL_LABEL,
} from '../composables/useManualEventEntry'

const props = defineProps({
  cycleId: { type: Number, default: null },
  participants: { type: Array, default: () => [] },
  readonly: { type: Boolean, default: false },
})

const cycleIdRef = computed(() => props.cycleId)
const { dirtyEntries, loading, saving, getCount, setCount, saveAll } =
  useManualEventEntry(cycleIdRef)

// 暴露給模板
const ITEM_CODES = MANUAL_ITEM_CODES
const LABEL = MANUAL_LABEL
</script>

<template>
  <div class="manual-event-section">
    <div class="toolbar">
      <span class="title">手填事件次數</span>
      <el-button
        type="primary"
        :loading="saving"
        :disabled="readonly || dirtyEntries.length === 0"
        data-test="save-all-btn"
        @click="saveAll"
      >
        儲存變更 ({{ dirtyEntries.length }})
      </el-button>
    </div>

    <el-alert v-if="readonly" type="warning" :closable="false" class="banner">
      週期非 OPEN 狀態，無法編輯
    </el-alert>

    <el-table
      :data="participants"
      v-loading="loading"
      stripe
      empty-text="尚無員工"
      data-test="manual-entry-table"
    >
      <el-table-column label="員工" prop="employee_name" min-width="100" fixed />
      <el-table-column label="角色" width="80" prop="role_group" />
      <el-table-column
        v-for="code in ITEM_CODES"
        :key="code"
        :label="LABEL[code]"
        width="110"
      >
        <template #default="{ row }">
          <el-input-number
            v-if="row.participant_id"
            :model-value="getCount(row.participant_id, code)"
            :step="0.5"
            :min="0"
            :precision="2"
            :disabled="readonly"
            :data-test="`count-${row.participant_id}-${code}`"
            @update:model-value="(v) => setCount(row.participant_id, code, v)"
          />
          <span v-else>—</span>
        </template>
      </el-table-column>
    </el-table>
  </div>
</template>

<style scoped>
.manual-event-section {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.title {
  font-weight: 600;
}
.banner {
  margin-top: 4px;
}
</style>
