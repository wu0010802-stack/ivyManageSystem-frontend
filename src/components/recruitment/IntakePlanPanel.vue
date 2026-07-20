<template>
  <div class="intake-plan-panel" v-loading="loading">
    <div class="intake-plan-panel__toolbar">
      <el-select v-model="schoolYear" size="small" style="width: 130px" @change="reload">
        <el-option v-for="y in yearOptions" :key="y" :value="y" :label="`${y} 學年`" />
      </el-select>
      <el-radio-group v-model="semester" size="small" @change="reload">
        <el-radio-button :value="1">上學期</el-radio-button>
        <el-radio-button :value="2">下學期</el-radio-button>
      </el-radio-group>
      <el-button v-if="canWrite" size="small" type="primary" :loading="saving" @click="save">
        儲存計畫名額
      </el-button>
    </div>

    <el-table :data="rows" border size="small" :row-class-name="rowClass">
      <el-table-column prop="grade_name" label="年級" min-width="100" />
      <el-table-column label="計畫名額" align="center" width="130">
        <template #default="{ row }">
          <el-input-number
            v-if="canWrite"
            v-model="row.target_seats"
            :min="0"
            size="small"
            controls-position="right"
            style="width: 110px"
          />
          <span v-else>{{ row.target_seats }}</span>
        </template>
      </el-table-column>
      <el-table-column prop="reserved_count" label="已保留" align="center" width="90" />
      <el-table-column prop="enrolled_count" label="已註冊" align="center" width="90" />
      <el-table-column label="剩餘" align="center" width="90">
        <template #default="{ row }">
          <span :class="{ 'remaining-neg': row.remaining < 0 }">{{ row.remaining }}</span>
        </template>
      </el-table-column>
    </el-table>

    <div class="intake-plan-panel__total">
      合計：計畫 {{ total.target }} · 保留 {{ total.reserved }} · 註冊 {{ total.enrolled }} · 剩餘
      {{ total.remaining }}
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import {
  ElSelect,
  ElOption,
  ElRadioGroup,
  ElRadioButton,
  ElButton,
  ElTable,
  ElTableColumn,
  ElInputNumber,
  ElMessage,
} from 'element-plus'
import { friendlyError } from '@/utils/errorMessages'
import { getIntakePlan, setIntakeTargets } from '@/api/recruitmentIntake'
import { getGrades } from '@/api/classrooms'
import { hasPermission } from '@/utils/auth'
import { currentRocYear } from '@/utils/academic'

interface PlanRow {
  grade_id: number
  grade_name: string
  target_seats: number
  reserved_count: number
  enrolled_count: number
  remaining: number
  over_capacity: boolean
}
interface GradeRow {
  id: number
  name: string
  sort_order?: number
}

const canWrite = computed(() => hasPermission('RECRUITMENT_WRITE'))
const schoolYear = ref<number>(currentRocYear())
const semester = ref<1 | 2>(1)
const loading = ref(false)
const saving = ref(false)
const rows = ref<PlanRow[]>([])

const yearOptions = computed(() => {
  const y = currentRocYear()
  return [y + 1, y, y - 1]
})

async function reload(): Promise<void> {
  loading.value = true
  try {
    const [planResp, gradesResp] = await Promise.all([
      getIntakePlan({ school_year: schoolYear.value, semester: semester.value }),
      getGrades(),
    ])
    const planRows = ((planResp.data as { rows?: PlanRow[] }).rows ?? []) as PlanRow[]
    const grades = (gradesResp.data as unknown as GradeRow[]) ?? []
    const byGrade = new Map(planRows.map((r) => [r.grade_id, r]))
    // 以年級為主軸合併，補上無 plan row 的年級（可為零保留年級設定計畫名額）
    rows.value = [...grades]
      .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
      .map(
        (g) =>
          byGrade.get(g.id) ?? {
            grade_id: g.id,
            grade_name: g.name,
            target_seats: 0,
            reserved_count: 0,
            enrolled_count: 0,
            remaining: 0,
            over_capacity: false,
          },
      )
  } finally {
    loading.value = false
  }
}

async function save(): Promise<void> {
  saving.value = true
  try {
    await setIntakeTargets({
      school_year: schoolYear.value,
      semester: semester.value,
      targets: rows.value.map((r) => ({ grade_id: r.grade_id, target_seats: r.target_seats })),
    })
    ElMessage.success('已儲存計畫名額')
    await reload()
  } catch (e) {
    ElMessage.error(friendlyError('儲存招生名額計畫失敗', e))
  } finally {
    saving.value = false
  }
}

const rowClass = ({ row }: { row: PlanRow }) => (row.over_capacity ? 'over-capacity' : '')
const total = computed(() =>
  rows.value.reduce(
    (acc, r) => ({
      target: acc.target + r.target_seats,
      reserved: acc.reserved + r.reserved_count,
      enrolled: acc.enrolled + r.enrolled_count,
      remaining: acc.remaining + r.remaining,
    }),
    { target: 0, reserved: 0, enrolled: 0, remaining: 0 },
  ),
)

defineExpose({ save, reload })
onMounted(reload)
</script>

<style scoped>
.intake-plan-panel__toolbar {
  display: flex;
  gap: 12px;
  align-items: center;
  margin-bottom: 12px;
}
.intake-plan-panel__total {
  margin-top: 12px;
  color: #606266;
  font-size: 13px;
}
.remaining-neg {
  color: var(--el-color-danger);
  font-weight: 600;
}
:deep(.over-capacity) {
  background: var(--el-color-danger-light-9);
}
</style>
