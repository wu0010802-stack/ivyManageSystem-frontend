<script setup lang="ts">
/**
 * AggregatedStatusDetailDialog — 單員工四項彙整詳情
 *
 * 屬於 CurrentSemesterOverview 的子 dialog；以 tabs 切換
 * 出缺勤 / 班級留校率 / 才藝課 / 懲處紀錄。
 */
import { computed } from 'vue'
import { InfoFilled } from '@element-plus/icons-vue'

import { summarizeRule } from './ruleSummary'

interface DisciplinaryInfo { warning_count?: number; minor_count?: number; major_count?: number; commend_count?: number; minor_merit_count?: number; major_merit_count?: number; suggested_score_delta?: number | string; actions?: Record<string, unknown>[]; [key: string]: unknown }
interface Participant { employee_name?: string; role_group?: string; reinstate_count?: number; attendance?: Record<string, unknown>; retention?: Record<string, unknown> | null; activity?: Record<string, unknown> | null; disciplinary?: DisciplinaryInfo; [key: string]: unknown }
interface Cycle { [key: string]: unknown }

const props = defineProps<{
  visible?: boolean
  participant?: Participant | null
  cycle?: Cycle | null
  rules?: Record<string, unknown>
}>()

const emit = defineEmits<{ 'update:visible': [value: boolean] }>()

const NON_CLASSROOM_ROLES = new Set(['SUPERVISOR', 'STAFF', 'COOK'])
const ROLE_GROUP_LABEL: Record<string, string> = {
  HEAD_TEACHER: '正導師',
  ASSISTANT_TEACHER: '副導師',
  SUPERVISOR: '主管',
  STAFF: '行政',
  COOK: '廚工',
}

const ACTION_TYPE_LABEL: Record<string, string> = {
  warning: '警告',
  minor: '小過',
  major: '大過',
  commendation: '嘉獎',
  minor_merit: '小功',
  major_merit: '大功',
}

const ACTION_TYPE_TAG: Record<string, string> = {
  warning: '',
  minor: 'warning',
  major: 'danger',
  commendation: 'success',
  minor_merit: 'success',
  major_merit: 'success',
}

const dialogVisible = computed({
  get: () => props.visible ?? false,
  set: (v: boolean) => emit('update:visible', v),
})

const title = computed(() => {
  if (!props.participant) return '員工詳情'
  const name = props.participant.employee_name || '—'
  const className = props.participant.retention?.classroom_name || '無班級'
  return `${name}（${className}）`
})

const isClassroomScoped = computed(() => {
  if (!props.participant) return false
  return !NON_CLASSROOM_ROLES.has(props.participant.role_group ?? '')
})

const attendance = computed(() => props.participant?.attendance || {})
const retention = computed(() => props.participant?.retention || null)
const activity = computed(() => props.participant?.activity || null)
const disciplinary = computed<DisciplinaryInfo>(() => props.participant?.disciplinary || { actions: [] })

const safeRules = (): Record<string, unknown> => props.rules ?? {}

const fmtDelta = (v: unknown) => {
  if (v == null || v === '') return '0'
  const n = Number(v)
  if (Number.isNaN(n)) return String(v)
  return n > 0 ? `+${n.toFixed(2)}` : n.toFixed(2)
}

</script>

<template>
  <el-dialog
    v-model="dialogVisible"
    :title="title"
    width="640px"
    data-test="aggregated-detail-dialog"
  >
    <div v-if="participant" class="detail-body">
      <el-descriptions :column="2" border size="small" class="meta">
        <el-descriptions-item label="員工">{{ participant.employee_name }}</el-descriptions-item>
        <el-descriptions-item label="角色">
          {{ ROLE_GROUP_LABEL[participant.role_group ?? ''] || participant.role_group }}
        </el-descriptions-item>
      </el-descriptions>

      <el-tabs class="detail-tabs">
        <!-- 出缺勤 -->
        <el-tab-pane label="出缺勤" name="attendance">
          <el-descriptions :column="2" border size="small">
            <el-descriptions-item label="遲到">{{ attendance.late_count || 0 }} 次</el-descriptions-item>
            <el-descriptions-item label="早退">{{ attendance.early_leave_count || 0 }} 次</el-descriptions-item>
            <el-descriptions-item label="未打卡">{{ attendance.missing_punch_count || 0 }} 次</el-descriptions-item>
            <el-descriptions-item label="請假">{{ attendance.leave_days || 0 }} 天</el-descriptions-item>
            <el-descriptions-item label="曠職">{{ attendance.absent_days || 0 }} 天</el-descriptions-item>
            <el-descriptions-item label="復學事件">{{ participant.reinstate_count || 0 }} 次</el-descriptions-item>
            <el-descriptions-item label="建議扣分">
              <span :class="['delta', { negative: Number(attendance.suggested_score_delta) < 0 }]">
                {{ fmtDelta(attendance.suggested_score_delta) }}
              </span>
              <el-tooltip v-if="safeRules().LATE_EARLY" placement="top">
                <template #content>
                  <div
                    v-for="line in summarizeRule(safeRules().LATE_EARLY)"
                    :key="line"
                    data-test="rule-summary-line"
                  >{{ line }}</div>
                </template>
                <el-icon class="info-icon"><InfoFilled /></el-icon>
              </el-tooltip>
            </el-descriptions-item>
          </el-descriptions>
        </el-tab-pane>

        <!-- 班級留校率 -->
        <el-tab-pane label="班級留校率" name="retention">
          <el-empty v-if="!isClassroomScoped" description="本角色不適用班級留校率" :image-size="80" />
          <el-empty v-else-if="!retention" description="無班級資料" :image-size="80" />
          <el-descriptions v-else :column="2" border size="small">
            <el-descriptions-item label="班級">{{ retention.classroom_name || '—' }}</el-descriptions-item>
            <el-descriptions-item label="初始人數">{{ retention.initial_count ?? '—' }}</el-descriptions-item>
            <el-descriptions-item label="現況人數">{{ retention.final_count ?? '—' }}</el-descriptions-item>
            <el-descriptions-item label="留校率">
              {{ retention.retention_rate != null ? `${Number(retention.retention_rate).toFixed(2)}%` : '—' }}
            </el-descriptions-item>
            <el-descriptions-item label="建議加減分">
              <span :class="['delta', { negative: Number(retention.suggested_score_delta) < 0 }]">
                {{ fmtDelta(retention.suggested_score_delta) }}
              </span>
              <el-tooltip v-if="safeRules().RETURNING_RATE_0315" placement="top">
                <template #content>
                  <div
                    v-for="line in summarizeRule(safeRules().RETURNING_RATE_0315)"
                    :key="line"
                    data-test="rule-summary-line"
                  >{{ line }}</div>
                </template>
                <el-icon class="info-icon"><InfoFilled /></el-icon>
              </el-tooltip>
            </el-descriptions-item>
          </el-descriptions>
        </el-tab-pane>

        <!-- 才藝課 -->
        <el-tab-pane label="才藝報名率" name="activity">
          <el-empty v-if="!isClassroomScoped" description="本角色不適用才藝報名率" :image-size="80" />
          <el-empty v-else-if="!activity" description="無班級資料" :image-size="80" />
          <el-descriptions v-else :column="2" border size="small">
            <el-descriptions-item label="班級在學人數">{{ activity.enrolled_students ?? '—' }}</el-descriptions-item>
            <el-descriptions-item label="才藝報名人數">{{ activity.registered_for_activity ?? '—' }}</el-descriptions-item>
            <el-descriptions-item label="報名率">
              {{ activity.activity_rate != null ? `${Number(activity.activity_rate).toFixed(2)}%` : '—' }}
            </el-descriptions-item>
            <el-descriptions-item label="建議加減分">
              <span :class="['delta', { negative: Number(activity.suggested_score_delta) < 0 }]">
                {{ fmtDelta(activity.suggested_score_delta) }}
              </span>
              <el-tooltip v-if="safeRules().AFTER_CLASS_RATE" placement="top">
                <template #content>
                  <div
                    v-for="line in summarizeRule(safeRules().AFTER_CLASS_RATE)"
                    :key="line"
                    data-test="rule-summary-line"
                  >{{ line }}</div>
                </template>
                <el-icon class="info-icon"><InfoFilled /></el-icon>
              </el-tooltip>
            </el-descriptions-item>
          </el-descriptions>
        </el-tab-pane>

        <!-- 懲處紀錄 -->
        <el-tab-pane label="懲處紀錄" name="disciplinary">
          <div class="discipline-summary">
            <span>警告 <strong>{{ disciplinary.warning_count || 0 }}</strong></span>
            <span>小過 <strong>{{ disciplinary.minor_count || 0 }}</strong></span>
            <span>大過 <strong>{{ disciplinary.major_count || 0 }}</strong></span>
            <span>嘉獎 <strong>{{ disciplinary.commend_count || 0 }}</strong></span>
            <span>小功 <strong>{{ disciplinary.minor_merit_count || 0 }}</strong></span>
            <span>大功 <strong>{{ disciplinary.major_merit_count || 0 }}</strong></span>
            <span>
              建議扣分：
              <span :class="['delta', { negative: Number(disciplinary.suggested_score_delta) < 0 }]">
                {{ fmtDelta(disciplinary.suggested_score_delta) }}
              </span>
              <el-tooltip v-if="safeRules().REWARD_PUNISH" placement="top">
                <template #content>
                  <div
                    v-for="line in summarizeRule(safeRules().REWARD_PUNISH)"
                    :key="line"
                    data-test="rule-summary-line"
                  >{{ line }}</div>
                </template>
                <el-icon class="info-icon"><InfoFilled /></el-icon>
              </el-tooltip>
            </span>
          </div>
          <el-table
            :data="disciplinary.actions || []"
            stripe
            size="small"
            empty-text="本期無懲處紀錄"
          >
            <el-table-column label="日期" prop="action_date" width="120" />
            <el-table-column label="類型" width="100">
              <template #default="{ row }">
                <el-tag :type="(ACTION_TYPE_TAG[row.action_type] || undefined) as 'primary' | 'success' | 'warning' | 'info' | 'danger' | undefined" size="small">
                  {{ ACTION_TYPE_LABEL[row.action_type] || row.action_type }}
                </el-tag>
              </template>
            </el-table-column>
            <el-table-column label="扣款金額" prop="deduction_amount" width="120">
              <template #default="{ row }">
                {{ row.deduction_amount != null ? row.deduction_amount : '—' }}
              </template>
            </el-table-column>
            <el-table-column label="原因" prop="reason" min-width="160">
              <template #default="{ row }">{{ row.reason || '—' }}</template>
            </el-table-column>
          </el-table>
        </el-tab-pane>
      </el-tabs>
    </div>

    <template #footer>
      <el-button @click="dialogVisible = false">關閉</el-button>
    </template>
  </el-dialog>
</template>

<style scoped>
.detail-body {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}

.meta {
  margin-bottom: var(--space-1);
}

.detail-tabs {
  margin-top: var(--space-1);
}

.discipline-summary {
  display: flex;
  gap: var(--space-4);
  align-items: center;
  margin-bottom: var(--space-3);
  font-size: 13px;
  color: var(--text-secondary);
}

.discipline-summary strong {
  color: var(--text-primary);
  margin-left: var(--space-1);
}

.delta {
  font-weight: 600;
}

.delta.negative {
  color: var(--color-danger, #ef4444);
}

.info-icon {
  margin-left: 6px;
  color: var(--el-text-color-secondary);
  cursor: help;
  font-size: 14px;
  vertical-align: middle;
}
</style>
