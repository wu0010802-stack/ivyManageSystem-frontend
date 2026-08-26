<script setup lang="ts">
/**
 * 自動排序預覽 Dialog（FE-ROUTES-05）。
 *
 * spec「呼叫時機與節流」：後台按「自動排序」→ optimize 回傳**預覽**
 * （新順序＋各站 ETA＋預計結束時間＋將被重排的釘選外站清單），按「套用」
 * 才落庫；Azure 失敗 502 → 顯示重試提示，不落任何變更。
 * 文案規範（spec 釘選語意）：「系統建議順序」、ETA 標「預計」
 * （啟發式 >10 站為近似解，非時間承諾）。純呈現元件，供班次設定頁與
 * 今日調度頁共用。
 */
import { computed } from 'vue'

export interface OptimizePreviewStop {
  student_id: number
  student_name: string
  old_seq: number
  new_seq: number
  pinned: boolean
  eta: string | null
  moved: boolean
}

export interface OptimizePreview {
  order: OptimizePreviewStop[]
  end_time_planned: string | null
  moved_unpinned_count: number
}

const props = defineProps<{
  visible: boolean
  loading: boolean
  preview: OptimizePreview | null
  error: string | null
}>()

const emit = defineEmits<{
  apply: []
  cancel: []
  retry: []
}>()

const orderedStops = computed(() =>
  props.preview ? [...props.preview.order].sort((a, b) => a.new_seq - b.new_seq) : [],
)
</script>

<template>
  <el-dialog
    :model-value="visible"
    title="系統建議順序"
    width="560px"
    :close-on-click-modal="false"
    @close="emit('cancel')"
  >
    <div v-if="error" class="bus-optimize-preview__error" data-test="error">
      <el-alert type="error" :closable="false" show-icon>
        <template #title>{{ error }}</template>
      </el-alert>
      <el-button type="primary" data-test="retry-btn" @click="emit('retry')">
        重試
      </el-button>
    </div>

    <div v-else-if="loading" v-loading="true" class="bus-optimize-preview__loading" data-test="loading">
      正在計算建議順序與預計到達時間…
    </div>

    <template v-else-if="preview">
      <el-alert
        v-if="preview.moved_unpinned_count > 0"
        class="bus-optimize-preview__moved-summary"
        type="warning"
        :closable="false"
        data-test="moved-summary"
      >
        <template #title>
          {{ preview.moved_unpinned_count }} 個未釘選站點將被重新排序；釘選站順位固定不變
        </template>
      </el-alert>

      <el-table :data="orderedStops" size="small" data-test="preview-table">
        <el-table-column label="新順序" width="76">
          <template #default="{ row }">{{ row.new_seq }}</template>
        </el-table-column>
        <el-table-column label="學生">
          <template #default="{ row }">
            <span
              :class="{ 'bus-optimize-preview__moved': row.moved }"
              :data-test="`stop-${row.student_id}`"
            >
              {{ row.student_name }}
            </span>
            <el-tag v-if="row.pinned" size="small" type="info" data-test="pinned-tag">
              釘選
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="原順序" width="76">
          <template #default="{ row }">
            <span :class="{ 'bus-optimize-preview__moved': row.moved }">
              {{ row.old_seq }}
            </span>
          </template>
        </el-table-column>
        <el-table-column label="預計到達" width="96">
          <template #default="{ row }">{{ row.eta ?? '—' }}</template>
        </el-table-column>
      </el-table>

      <div v-if="preview.end_time_planned" class="bus-optimize-preview__end" data-test="end-time">
        預計 {{ preview.end_time_planned }} 結束全程
      </div>
    </template>

    <template #footer>
      <el-button data-test="cancel-btn" @click="emit('cancel')">取消</el-button>
      <el-button
        type="primary"
        :disabled="loading || !!error || !preview"
        data-test="apply-btn"
        @click="emit('apply')"
      >
        套用
      </el-button>
    </template>
  </el-dialog>
</template>

<style scoped>
.bus-optimize-preview__error {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 12px;
}

.bus-optimize-preview__loading {
  min-height: 80px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--el-text-color-secondary);
}

.bus-optimize-preview__moved-summary {
  margin-bottom: 8px;
}

.bus-optimize-preview__moved {
  color: var(--el-color-warning-dark-2, var(--el-color-warning));
  font-weight: 600;
}

.bus-optimize-preview__end {
  margin-top: 8px;
  font-size: 13px;
  color: var(--el-text-color-regular);
}
</style>
