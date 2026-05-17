<script setup>
/**
 * AggregatedStatusDetailDialog — 單員工四項彙整詳情
 *
 * 屬於 CurrentSemesterOverview 的子 dialog；以 tabs 切換
 * 出缺勤 / 班級留校率 / 才藝課 / 懲處紀錄。
 */
import { computed } from 'vue'
import { InfoFilled } from '@element-plus/icons-vue'

const props = defineProps({
  visible: { type: Boolean, default: false },
  participant: { type: Object, default: null },
  cycle: { type: Object, default: null },
  rules: { type: Object, default: () => ({}) },
})

const emit = defineEmits(['update:visible'])

const NON_CLASSROOM_ROLES = new Set(['SUPERVISOR', 'STAFF', 'COOK'])
const ROLE_GROUP_LABEL = {
  HEAD_TEACHER: '正導師',
  ASSISTANT_TEACHER: '副導師',
  SUPERVISOR: '主管',
  STAFF: '行政',
  COOK: '廚工',
}

const ACTION_TYPE_LABEL = {
  warning: '警告',
  minor: '小過',
  major: '大過',
}

const ACTION_TYPE_TAG = {
  warning: '',
  minor: 'warning',
  major: 'danger',
}

const dialogVisible = computed({
  get: () => props.visible,
  set: (v) => emit('update:visible', v),
})

const title = computed(() => {
  if (!props.participant) return '員工詳情'
  const name = props.participant.employee_name || '—'
  const className = props.participant.retention?.classroom_name || '無班級'
  return `${name}（${className}）`
})

const isClassroomScoped = computed(() => {
  if (!props.participant) return false
  return !NON_CLASSROOM_ROLES.has(props.participant.role_group)
})

const attendance = computed(() => props.participant?.attendance || {})
const retention = computed(() => props.participant?.retention || null)
const activity = computed(() => props.participant?.activity || null)
const disciplinary = computed(() => props.participant?.disciplinary || { actions: [] })

const fmtDelta = (v) => {
  if (v == null || v === '') return '0'
  const n = Number(v)
  if (Number.isNaN(n)) return v
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
          {{ ROLE_GROUP_LABEL[participant.role_group] || participant.role_group }}
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
            <el-descriptions-item label="建議扣分">
              <span :class="['delta', { negative: Number(attendance.suggested_score_delta) < 0 }]">
                {{ fmtDelta(attendance.suggested_score_delta) }}
              </span>
              <el-tooltip v-if="props.rules.LATE_EARLY" placement="top">
                <template #content>
                  <div>規則：{{ props.rules.LATE_EARLY.rule_type }}</div>
                  <div>參數：{{ JSON.stringify(props.rules.LATE_EARLY.rule_config) }}</div>
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
              <el-tooltip v-if="props.rules.RETURNING_RATE_0315" placement="top">
                <template #content>
                  <div>規則：{{ props.rules.RETURNING_RATE_0315.rule_type }}</div>
                  <div>參數：{{ JSON.stringify(props.rules.RETURNING_RATE_0315.rule_config) }}</div>
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
              <el-tooltip v-if="props.rules.AFTER_CLASS_RATE" placement="top">
                <template #content>
                  <div>規則：{{ props.rules.AFTER_CLASS_RATE.rule_type }}</div>
                  <div>參數：{{ JSON.stringify(props.rules.AFTER_CLASS_RATE.rule_config) }}</div>
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
            <span>
              建議扣分：
              <span :class="['delta', { negative: Number(disciplinary.suggested_score_delta) < 0 }]">
                {{ fmtDelta(disciplinary.suggested_score_delta) }}
              </span>
              <el-tooltip v-if="props.rules.REWARD_PUNISH" placement="top">
                <template #content>
                  <div>規則：{{ props.rules.REWARD_PUNISH.rule_type }}</div>
                  <div>參數：{{ JSON.stringify(props.rules.REWARD_PUNISH.rule_config) }}</div>
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
                <el-tag :type="ACTION_TYPE_TAG[row.action_type]" size="small">
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
  gap: 12px;
}

.meta {
  margin-bottom: 4px;
}

.detail-tabs {
  margin-top: 4px;
}

.discipline-summary {
  display: flex;
  gap: 16px;
  align-items: center;
  margin-bottom: 12px;
  font-size: 13px;
  color: var(--text-secondary);
}

.discipline-summary strong {
  color: var(--text-primary);
  margin-left: 4px;
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
