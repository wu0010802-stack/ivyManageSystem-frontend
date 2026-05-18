<script setup>
const props = defineProps({
  cycleId: { type: Number, required: true },
  participants: { type: Array, default: () => [] },
  summaryByParticipant: { type: Object, default: () => ({}) },
  catalog: { type: Array, default: () => [] },
  selectedIds: { type: Array, default: () => [] },
  busy: { type: Boolean, default: false },
  // P0-A：parent (CycleDetailView) 注入 APPRAISAL_* permission 旗標，
  // 守衛 sign / reject action 按鈕；未注入時預設 false（保守）。
  canSignSupervisor: { type: Boolean, default: false },
  canSignAccounting: { type: Boolean, default: false },
  canFinalize: { type: Boolean, default: false },
  canReject: { type: Boolean, default: false },
})
const emit = defineEmits(['sign', 'reject', 'comment', 'open-log', 'update:selected-ids'])

const gradeLabel = (g) =>
  ({ OUTSTANDING: '優等', GOOD: '甲等', PASS: '乙等', WARN: '丙等', FAIL: '丁等' }[g] || g)

const statusLabel = (s) =>
  ({ DRAFT: '草稿', SUPERVISOR_SIGNED: '主管已簽',
     ACCOUNTING_SIGNED: '會計已簽', FINALIZED: '已核定' }[s] || s)

function isSelected(summaryId) {
  return props.selectedIds.includes(summaryId)
}

function toggleSelect(summaryId, v) {
  const next = v
    ? [...new Set([...props.selectedIds, summaryId])]
    : props.selectedIds.filter((id) => id !== summaryId)
  emit('update:selected-ids', next)
}

function sign(summary, stage) { emit('sign', { summary, stage }) }
function reject(summary) { emit('reject', summary) }
function comment(summary) { emit('comment', summary) }
function openLog(summary) { emit('open-log', summary) }
</script>

<template>
  <el-table :data="participants" stripe data-test="list-view-table">
    <el-table-column width="50">
      <template #default="{ row }">
        <el-checkbox
          v-if="summaryByParticipant[row.id]"
          :model-value="isSelected(summaryByParticipant[row.id].id)"
          :data-test="`list-checkbox-${row.id}`"
          @update:model-value="(v) => toggleSelect(summaryByParticipant[row.id].id, v)"
        />
      </template>
    </el-table-column>
    <el-table-column label="員工 ID" prop="employee_id" width="100" />
    <el-table-column label="角色群" prop="role_group" width="140" />
    <el-table-column label="總分" width="100">
      <template #default="{ row }">
        <span v-if="summaryByParticipant[row.id]">
          {{ Number(summaryByParticipant[row.id].total_score).toFixed(2) }}
        </span>
      </template>
    </el-table-column>
    <el-table-column label="等第" width="100">
      <template #default="{ row }">
        <span v-if="summaryByParticipant[row.id]">{{ gradeLabel(summaryByParticipant[row.id].grade) }}</span>
      </template>
    </el-table-column>
    <el-table-column label="獎金" width="120">
      <template #default="{ row }">
        <span v-if="summaryByParticipant[row.id]">
          {{ Number(summaryByParticipant[row.id].bonus_amount).toLocaleString() }}
        </span>
      </template>
    </el-table-column>
    <el-table-column label="簽核狀態" width="140">
      <template #default="{ row }">
        <el-button
          v-if="summaryByParticipant[row.id]"
          size="small"
          text
          :data-test="`log-btn-${row.id}`"
          @click="openLog(summaryByParticipant[row.id])"
        >
          {{ statusLabel(summaryByParticipant[row.id].status) }}
        </el-button>
      </template>
    </el-table-column>
    <el-table-column label="簽核操作" width="240">
      <template #default="{ row }">
        <template v-if="summaryByParticipant[row.id]">
          <!-- P0-A：每個 stage-specific 動作按鈕都依對應 APPRAISAL_* 旗標守衛 -->
          <template v-if="summaryByParticipant[row.id].status === 'DRAFT'">
            <el-button
              v-if="canSignSupervisor"
              size="small" :disabled="busy"
              :data-test="`sign-btn-${row.id}`"
              @click="sign(summaryByParticipant[row.id], 'supervisor')"
            >主管簽</el-button>
          </template>
          <template v-else-if="summaryByParticipant[row.id].status === 'SUPERVISOR_SIGNED'">
            <el-button
              v-if="canSignAccounting"
              size="small" :disabled="busy"
              :data-test="`sign-btn-${row.id}`"
              @click="sign(summaryByParticipant[row.id], 'accounting')"
            >會計簽</el-button>
            <el-button
              v-if="canReject"
              size="small" type="danger" text :disabled="busy"
              :data-test="`reject-btn-${row.id}`"
              @click="reject(summaryByParticipant[row.id])"
            >退簽</el-button>
          </template>
          <template v-else-if="summaryByParticipant[row.id].status === 'ACCOUNTING_SIGNED'">
            <el-button
              v-if="canFinalize"
              size="small" type="primary" :disabled="busy"
              :data-test="`sign-btn-${row.id}`"
              @click="sign(summaryByParticipant[row.id], 'finalize')"
            >核定</el-button>
            <el-button
              v-if="canReject"
              size="small" type="danger" text :disabled="busy"
              :data-test="`reject-btn-${row.id}`"
              @click="reject(summaryByParticipant[row.id])"
            >退簽</el-button>
          </template>
          <template v-else-if="summaryByParticipant[row.id].status === 'FINALIZED'">
            <el-button
              v-if="canReject"
              size="small" type="danger" text :disabled="busy"
              :data-test="`reject-btn-${row.id}`"
              @click="reject(summaryByParticipant[row.id])"
            >退簽</el-button>
          </template>
          <el-button size="small" text
                     :data-test="`comment-btn-${row.id}`"
                     @click="comment(summaryByParticipant[row.id])">留言</el-button>
        </template>
      </template>
    </el-table-column>
  </el-table>
</template>
