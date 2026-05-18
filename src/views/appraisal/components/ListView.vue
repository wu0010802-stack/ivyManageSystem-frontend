<script setup lang="ts">
import { statusLabel as labelStatus } from '../labels'

interface Summary { id: number; status?: string; total_score?: number; grade?: string; bonus_amount?: number; employee_name?: string; [key: string]: unknown }
interface Participant { id: number; employee_id?: number; role_group?: string; employee_name?: string; [key: string]: unknown }

const props = defineProps<{
  cycleId: number
  participants?: Participant[]
  summaryByParticipant?: Record<number, Summary | undefined>
  catalog?: unknown[]
  selectedIds?: number[]
  busy?: boolean
  signingIds?: number[]
  canSignSupervisor?: boolean
  canSignAccounting?: boolean
  canFinalize?: boolean
  canReject?: boolean
}>()

const getSummary = (participantId: number): Summary => (props.summaryByParticipant ?? {})[participantId] as Summary
const hasSummary = (participantId: number): boolean => (props.summaryByParticipant ?? {})[participantId] != null

function isRowSigning(summaryId: number) {
  return (props.signingIds ?? []).includes(summaryId)
}
function rowBusy(summaryId: number) {
  return (props.busy ?? false) || isRowSigning(summaryId)
}
const emit = defineEmits<{
  'sign': [payload: { summary: Summary; stage: string }]
  'reject': [summary: Summary]
  'comment': [summary: Summary]
  'open-log': [summary: Summary]
  'update:selected-ids': [ids: number[]]
}>()

const gradeLabel = (g: string) =>
  ({ OUTSTANDING: '優等', GOOD: '甲等', PASS: '乙等', WARN: '丙等', FAIL: '丁等' } as Record<string, string>)[g] || g

const statusLabel = labelStatus

function isSelected(summaryId: number) {
  return (props.selectedIds ?? []).includes(summaryId)
}

function toggleSelect(summaryId: number, v: boolean) {
  const ids = props.selectedIds ?? []
  const next = v
    ? [...new Set([...ids, summaryId])]
    : ids.filter((id) => id !== summaryId)
  emit('update:selected-ids', next)
}

function sign(summary: Summary, stage: string) { emit('sign', { summary, stage }) }
function reject(summary: Summary) { emit('reject', summary) }
function comment(summary: Summary) { emit('comment', summary) }
function openLog(summary: Summary) { emit('open-log', summary) }
</script>

<template>
  <el-table :data="participants" stripe data-test="list-view-table">
    <el-table-column width="50">
      <template #default="{ row }">
        <el-checkbox
          v-if="hasSummary(row.id)"
          :model-value="isSelected(getSummary(row.id).id)"
          :data-test="`list-checkbox-${row.id}`"
          @update:model-value="(v) => toggleSelect(getSummary(row.id).id, v as boolean)"
        />
      </template>
    </el-table-column>
    <el-table-column label="員工 ID" prop="employee_id" width="100" />
    <el-table-column label="角色群" prop="role_group" width="140" />
    <el-table-column label="總分" width="100">
      <template #default="{ row }">
        <span v-if="hasSummary(row.id)">
          {{ Number(getSummary(row.id).total_score).toFixed(2) }}
        </span>
      </template>
    </el-table-column>
    <el-table-column label="等第" width="100">
      <template #default="{ row }">
        <span v-if="hasSummary(row.id)">{{ gradeLabel(getSummary(row.id).grade as string ?? '') }}</span>
      </template>
    </el-table-column>
    <el-table-column label="獎金" width="120">
      <template #default="{ row }">
        <span v-if="hasSummary(row.id)">
          {{ Number(getSummary(row.id).bonus_amount).toLocaleString() }}
        </span>
      </template>
    </el-table-column>
    <el-table-column label="簽核狀態" width="140">
      <template #default="{ row }">
        <el-button
          v-if="hasSummary(row.id)"
          size="small"
          text
          :data-test="`log-btn-${row.id}`"
          @click="openLog(getSummary(row.id))"
        >
          {{ statusLabel(getSummary(row.id).status ?? '') }}
        </el-button>
      </template>
    </el-table-column>
    <el-table-column label="簽核操作" width="240">
      <template #default="{ row }">
        <template v-if="hasSummary(row.id)">
          <!-- P0-A：每個 stage-specific 動作按鈕都依對應 APPRAISAL_* 旗標守衛 -->
          <template v-if="getSummary(row.id).status === 'DRAFT'">
            <el-button
              v-if="canSignSupervisor"
              size="small" :disabled="rowBusy(getSummary(row.id).id)"
              :loading="isRowSigning(getSummary(row.id).id)"
              :data-test="`sign-btn-${row.id}`"
              @click="sign(getSummary(row.id), 'supervisor')"
            >主管簽</el-button>
          </template>
          <template v-else-if="getSummary(row.id).status === 'SUPERVISOR_SIGNED'">
            <el-button
              v-if="canSignAccounting"
              size="small" :disabled="rowBusy(getSummary(row.id).id)"
              :loading="isRowSigning(getSummary(row.id).id)"
              :data-test="`sign-btn-${row.id}`"
              @click="sign(getSummary(row.id), 'accounting')"
            >會計簽</el-button>
            <el-button
              v-if="canReject"
              size="small" type="danger" text
              :disabled="rowBusy(getSummary(row.id).id)"
              :data-test="`reject-btn-${row.id}`"
              @click="reject(getSummary(row.id))"
            >退簽</el-button>
          </template>
          <template v-else-if="getSummary(row.id).status === 'ACCOUNTING_SIGNED'">
            <el-button
              v-if="canFinalize"
              size="small" type="primary"
              :disabled="rowBusy(getSummary(row.id).id)"
              :loading="isRowSigning(getSummary(row.id).id)"
              :data-test="`sign-btn-${row.id}`"
              @click="sign(getSummary(row.id), 'finalize')"
            >核定</el-button>
            <el-button
              v-if="canReject"
              size="small" type="danger" text
              :disabled="rowBusy(getSummary(row.id).id)"
              :data-test="`reject-btn-${row.id}`"
              @click="reject(getSummary(row.id))"
            >退簽</el-button>
          </template>
          <template v-else-if="getSummary(row.id).status === 'FINALIZED'">
            <el-button
              v-if="canReject"
              size="small" type="danger" text
              :disabled="rowBusy(getSummary(row.id).id)"
              :data-test="`reject-btn-${row.id}`"
              @click="reject(getSummary(row.id))"
            >退簽</el-button>
          </template>
          <el-button size="small" text
                     :data-test="`comment-btn-${row.id}`"
                     @click="comment(getSummary(row.id))">留言</el-button>
        </template>
      </template>
    </el-table-column>
  </el-table>
</template>
