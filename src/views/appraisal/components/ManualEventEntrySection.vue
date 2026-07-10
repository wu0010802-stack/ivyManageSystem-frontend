<script setup lang="ts">
import { computed, ref } from 'vue'
import {
  useManualEventEntry,
  MANUAL_ITEM_CODES,
  MANUAL_LABEL,
} from '../composables/useManualEventEntry'
import { MANUAL_DELTA_RANGES } from '../scoreItemLabels'
import { useGridKeyboardNav } from '@/composables/useGridKeyboardNav'
import { useUnsavedChangesGuard } from '@/composables/useUnsavedChangesGuard'
import { ElMessage } from 'element-plus'

const props = defineProps<{
  cycleId?: number | null
  participants?: Record<string, unknown>[]
  readonly?: boolean
}>()

const cycleIdRef = computed(() => props.cycleId ?? null)
const { dirtyEntries, loading, saving, getCount, setCount, saveAll, getOriginal, getNote, inheritFromPreviousCycle } =
  useManualEventEntry(cycleIdRef)

// 機構活動同步溯源：note 以「自動同步」開頭的格顯示 tag（覆寫前留意）
function syncedNote(pid: string | number, code: string): string | null {
  const note = getNote(pid, code)
  return note && note.startsWith('自動同步') ? note : null
}

const ITEM_CODES = MANUAL_ITEM_CODES
const LABEL = MANUAL_LABEL

// MANUAL_DELTA 類手填「分值」項（如幼兒意外 −10~0），其餘為次數/時數（min 0）
const minFor = (code: string) => MANUAL_DELTA_RANGES[code]?.min ?? 0
const maxFor = (code: string) => MANUAL_DELTA_RANGES[code]?.max ?? Infinity

// 鍵盤導航容器
const gridRef = ref<HTMLElement | null>(null)
useGridKeyboardNav(gridRef)

// 未存攔截
useUnsavedChangesGuard(() => dirtyEntries.value.length > 0)

// 沿用上一週期
const inheriting = ref(false)
async function onInheritPrevious() {
  inheriting.value = true
  try {
    const res = await inheritFromPreviousCycle(
      (props.participants ?? []) as { participant_id?: number | null; employee_id?: number }[],
    )
    if (res == null) { ElMessage.info('找不到上一週期'); return }
    ElMessage.success(`已帶入 ${res.applied} 筆；略過 ${res.skipped} 筆（對映不到員工）`)
  } catch {
    ElMessage.error('沿用上一週期失敗')
  } finally {
    inheriting.value = false
  }
}
</script>

<template>
  <div ref="gridRef" class="manual-event-section">
    <div class="toolbar">
      <span class="title">手填事件次數</span>
      <div class="toolbar-actions">
        <el-button
          v-if="!readonly"
          :loading="inheriting"
          data-test="inherit-prev-btn"
          @click="onInheritPrevious"
        >
          沿用上一週期
        </el-button>
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
        v-for="(code, colIdx) in ITEM_CODES"
        :key="code"
        :label="LABEL[code]"
        width="110"
      >
        <template #default="{ row, $index }">
          <div v-if="row.participant_id" class="cell-with-orig">
            <el-input-number
              :model-value="getCount(row.participant_id, code)"
              :step="1"
              :min="minFor(code)"
              :max="maxFor(code)"
              :precision="0"
              :disabled="readonly"
              :data-grid-row="$index"
              :data-grid-col="colIdx"
              :data-test="`count-${row.participant_id}-${code}`"
              @update:model-value="(v) => setCount(row.participant_id!, code, v as number)"
            />
            <span
              v-if="getCount(row.participant_id, code) !== getOriginal(row.participant_id, code)"
              class="cell-orig"
              :data-test="`orig-${row.participant_id}-${code}`"
            >
              原 {{ getOriginal(row.participant_id, code) }}
            </span>
            <el-tooltip
              v-if="syncedNote(row.participant_id, code)"
              :content="`${syncedNote(row.participant_id, code)}——此數字來自機構活動出席同步，人工覆寫前請留意`"
              placement="top"
            >
              <el-tag
                size="small"
                type="info"
                class="cell-sync-tag"
                :data-test="`synced-tag-${row.participant_id}-${code}`"
              >
                自動同步
              </el-tag>
            </el-tooltip>
          </div>
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
  gap: var(--space-3);
}
.toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.toolbar-actions {
  display: flex;
  gap: var(--space-2);
  align-items: center;
}
.title {
  font-weight: 600;
}
.banner {
  margin-top: var(--space-1);
}
.cell-with-orig {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.cell-orig {
  font-size: 11px;
  color: var(--el-text-color-secondary);
  line-height: 1;
}
.cell-sync-tag {
  align-self: flex-start;
}
</style>
