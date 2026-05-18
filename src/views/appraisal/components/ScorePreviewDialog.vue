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
import { ITEM_CODE_LABELS, ITEM_CODES_ORDER } from '@/views/appraisal/scoreItemLabels'

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
const showDiffOnly = ref(false)
const sortMode = ref('total')

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

function itemByCode(participant, code) {
  return participant.items?.find((i) => i.item_code === code)
}

function hasDiff(item) {
  if (!item) return false
  if (item.current_db_value == null) return false
  return Number(item.current_db_value) !== Number(item.delta)
}

function participantTotal(p) {
  let sum = 0
  for (const it of p?.items ?? []) {
    const n = Number(it.delta)
    if (Number.isFinite(n)) sum += n
  }
  return sum
}

function fmtNum(n) {
  if (!Number.isFinite(n)) return '0'
  return String(Math.round(n * 100) / 100)
}

const filteredParticipants = computed(() => {
  const list = data.value?.participants ?? []
  const filtered = showDiffOnly.value
    ? list.filter((p) => p.items?.some(hasDiff))
    : [...list]
  if (sortMode.value === 'name') {
    return filtered.sort((a, b) =>
      (a.employee_name || '').localeCompare(b.employee_name || '', 'zh-Hant'),
    )
  }
  return filtered.sort(
    (a, b) => Math.abs(participantTotal(b)) - Math.abs(participantTotal(a)),
  )
})

function tooltipLines(row, code) {
  const it = itemByCode(row, code)
  if (!it) return []
  const lines = []
  if (it.raw_value != null && it.raw_value !== '') {
    lines.push(`原始值：${it.raw_value}`)
  }
  if (it.current_db_value != null) {
    lines.push(`目前系統值：${it.current_db_value}`)
  }
  if (it.note) {
    lines.push(`備註：${it.note}`)
  }
  return lines
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
        紅色標示 = 與目前系統中的分數不同；確認後請按下方「同步分數」寫入。
      </el-alert>
      <div class="preview-toolbar">
        <el-switch
          v-model="showDiffOnly"
          active-text="只看有變動"
          data-test="filter-diff-only"
        />
        <el-radio-group v-model="sortMode" size="small" data-test="sort-mode">
          <el-radio-button label="total">依總變動排序</el-radio-button>
          <el-radio-button label="name">依員工姓名</el-radio-button>
        </el-radio-group>
        <span class="preview-count" data-test="participant-count">
          顯示 {{ filteredParticipants.length }} / {{ data?.participants?.length ?? 0 }} 人
        </span>
      </div>
      <el-table
        v-if="data"
        :data="filteredParticipants"
        max-height="500"
        stripe
        class="preview-table"
        data-test="preview-table"
      >
        <el-table-column label="員工" prop="employee_name" width="100" fixed />
        <el-table-column
          v-for="code in ITEM_CODES_ORDER"
          :key="code"
          :label="ITEM_CODE_LABELS[code] || code"
          :min-width="110"
        >
          <template #default="{ row }">
            <el-tooltip
              placement="top"
              :disabled="tooltipLines(row, code).length === 0"
            >
              <template #content>
                <div
                  v-for="line in tooltipLines(row, code)"
                  :key="line"
                  :data-test="`tip-${row.participant_id}-${code}`"
                >
                  {{ line }}
                </div>
              </template>
              <span
                :class="{ diff: hasDiff(itemByCode(row, code)) }"
                :data-test="`delta-${row.participant_id}-${code}`"
              >
                {{ itemByCode(row, code)?.delta ?? '—' }}
              </span>
            </el-tooltip>
          </template>
        </el-table-column>
        <el-table-column label="合計" :min-width="90" fixed="right">
          <template #default="{ row }">
            <span
              :class="{ diff: Math.abs(participantTotal(row)) > 1e-9 }"
              :data-test="`total-${row.participant_id}`"
            >
              {{ fmtNum(participantTotal(row)) }}
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

.preview-toolbar {
  display: flex;
  align-items: center;
  gap: 16px;
  margin-bottom: 12px;
  flex-wrap: wrap;
}

.preview-count {
  color: var(--el-text-color-secondary);
  font-size: 13px;
  margin-left: auto;
}

.diff {
  color: var(--el-color-danger);
  font-weight: 600;
}

.preview-table {
  width: 100%;
}
</style>
