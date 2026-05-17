<script setup>
/**
 * ScorePreviewDialog — 預覽分數計算
 *
 * 呼叫 POST /appraisal/cycles/{cycleId}/score_preview，
 * 以表格顯示每位參與者 × 14 個 ScoreItemCode 的 delta。
 * 紅色 = current_db_value 與 delta 不同（提醒同步後會變動）。
 */
import { computed, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'

import { previewAppraisalScore } from '@/api/appraisal'
import { apiError } from '@/utils/error'

const props = defineProps({
  visible: { type: Boolean, default: false },
  cycleId: { type: Number, default: null },
})
const emit = defineEmits(['update:visible'])

const dialogVisible = computed({
  get: () => props.visible,
  set: (v) => emit('update:visible', v),
})

const loading = ref(false)
const data = ref(null)

async function load() {
  if (!props.cycleId) return
  loading.value = true
  try {
    const r = await previewAppraisalScore(props.cycleId)
    data.value = r.data
  } catch (e) {
    ElMessage.error(apiError(e, '預覽失敗'))
  } finally {
    loading.value = false
  }
}

watch(
  () => [props.visible, props.cycleId],
  ([v]) => { if (v) load() },
  { immediate: true },
)

const ITEM_CODES_ORDER = [
  'LATE_EARLY', 'MISSING_PUNCH', 'LEAVE',
  'RETURNING_RATE_0915', 'RETURNING_RATE_0315',
  'AFTER_CLASS_RATE', 'REWARD_PUNISH',
  'SCHOOL_MEETING_ABSENCE', 'INSTITUTION_MEETING_0913',
  'INSTITUTION_MEETING_1115', 'SELF_IMPROVEMENT_ACTIVITY',
  'CHILD_ACCIDENT', 'CLASS_HEADCOUNT_BONUS', 'OTHER',
]

function itemByCode(participant, code) {
  return participant.items?.find((i) => i.item_code === code)
}

function hasDiff(item) {
  if (!item) return false
  if (item.current_db_value == null) return false
  return Number(item.current_db_value) !== Number(item.delta)
}
</script>

<template>
  <el-dialog
    v-model="dialogVisible"
    title="預覽分數計算"
    width="90%"
    data-test="score-preview-dialog"
  >
    <div v-loading="loading">
      <el-alert type="info" :closable="false" class="preview-alert">
        紅色標示 = 與目前 DB 中的值不同；確認後請按下方「同步分數」寫入。
      </el-alert>
      <el-table
        v-if="data"
        :data="data.participants"
        max-height="500"
        stripe
        class="preview-table"
        data-test="preview-table"
      >
        <el-table-column label="員工" prop="employee_name" width="100" fixed />
        <el-table-column
          v-for="code in ITEM_CODES_ORDER"
          :key="code"
          :label="code"
          width="90"
        >
          <template #default="{ row }">
            <span
              :class="{ diff: hasDiff(itemByCode(row, code)) }"
              :data-test="`delta-${row.participant_id}-${code}`"
            >
              {{ itemByCode(row, code)?.delta ?? '—' }}
            </span>
          </template>
        </el-table-column>
      </el-table>
    </div>
    <template #footer>
      <el-button @click="dialogVisible = false">關閉</el-button>
    </template>
  </el-dialog>
</template>

<style scoped>
.preview-alert {
  margin-bottom: 12px;
}

.diff {
  color: var(--el-color-danger);
  font-weight: 600;
}

.preview-table {
  width: 100%;
}
</style>
