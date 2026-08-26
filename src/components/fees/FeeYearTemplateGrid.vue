<template>
  <section class="year-grid" data-test="year-template-grid">
    <header class="year-grid__header">
      <div class="year-grid__title">
        <span class="year-grid__name">{{ schoolYear }} 學年設定總覽</span>
        <el-tag v-if="missingCount > 0" size="small" type="danger" data-test="missing-count">
          缺 {{ missingCount }} 格未設定
        </el-tag>
        <el-tag v-else-if="!loading" size="small" type="success" data-test="missing-count">
          上下學期範本齊全
        </el-tag>
      </div>
      <div class="year-grid__actions">
        <el-button
          size="small"
          :loading="copying"
          data-test="copy-year-btn"
          @click="onCopyYear"
        >
          從 {{ schoolYear - 1 }} 學年複製
        </el-button>
      </div>
    </header>
    <p class="year-grid__hint">
      新學年（上＋下學期）的金額與收費日期請於 7 月底前設定完成；缺格代表該年級該費用
      類型尚未建立範本，系統不會為其產生費用單。
    </p>

    <div v-loading="loading" class="year-grid__table-wrap">
      <table class="year-grid__table">
        <thead>
          <tr>
            <th class="col-grade">年級</th>
            <th v-for="ft in feeColumns" :key="ft.value">{{ ft.label }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="g in grades" :key="g.id">
            <td class="col-grade">{{ g.name }}</td>
            <td v-for="ft in feeColumns" :key="ft.value">
              <div
                v-for="sem in [1, 2]"
                :key="sem"
                class="cell-row"
                :data-test="`cell-${g.id}-${ft.value}-${sem}`"
              >
                <span class="cell-sem">{{ sem === 1 ? '上' : '下' }}</span>
                <template v-if="cellTemplate(g.id, ft.value, sem)">
                  <span class="cell-amount">
                    {{ formatCurrency(cellTemplate(g.id, ft.value, sem)!.amount) }}
                  </span>
                  <span class="cell-date">{{ cellDateHint(cellTemplate(g.id, ft.value, sem)!) }}</span>
                </template>
                <el-tag v-else size="small" type="danger" class="cell-missing">未設定</el-tag>
              </div>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </section>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { copyYearFeeTemplates, getFeeTemplates } from '@/api/fees'
import { FEE_TYPES } from '@/components/fees/feeTypes'
import { formatCurrency } from '@/utils/currency'
import { apiError } from '@/utils/error'

interface TemplateRow {
  id: number
  grade_id: number | null
  semester: number
  fee_type: string
  amount: number
  is_active?: boolean
  billing_start_date?: string | null
  overdue_date?: string | null
  monthly_billing_day?: number | null
  monthly_due_day?: number | null
  [key: string]: unknown
}

const props = defineProps<{
  schoolYear: number
  grades: { id: number; name: string }[]
}>()
const emit = defineEmits<{ changed: [] }>()

const feeColumns = FEE_TYPES.filter((t) => t.source === 'record')

const loading = ref(false)
const copying = ref(false)
const templates = ref<TemplateRow[]>([])

const byKey = computed(() => {
  const m = new Map<string, TemplateRow>()
  for (const t of templates.value) {
    if (!t.is_active || t.grade_id == null) continue
    m.set(`${t.grade_id}:${t.fee_type}:${t.semester}`, t)
  }
  return m
})

function cellTemplate(gradeId: number, feeType: string, semester: number) {
  return byKey.value.get(`${gradeId}:${feeType}:${semester}`) ?? null
}

/** cell 副標：monthly 顯示每月開帳/逾期日；非月費顯示收費開始日（MM/DD 收）。 */
function cellDateHint(t: TemplateRow): string {
  if (t.fee_type === 'monthly') {
    if (t.monthly_billing_day || t.monthly_due_day) {
      return `每月${t.monthly_billing_day ?? 1}號收`
    }
    return ''
  }
  if (t.billing_start_date) {
    const [, m, d] = t.billing_start_date.split('-')
    return `${Number(m)}/${Number(d)} 收`
  }
  return ''
}

const missingCount = computed(() => {
  let n = 0
  for (const g of props.grades) {
    for (const ft of feeColumns) {
      for (const sem of [1, 2]) {
        if (!cellTemplate(g.id, ft.value, sem)) n += 1
      }
    }
  }
  return n
})

async function load() {
  loading.value = true
  try {
    const list = await getFeeTemplates({ school_year: props.schoolYear })
    templates.value = (list || []) as TemplateRow[]
  } catch (e) {
    ElMessage.error(apiError(e, '載入學年範本失敗'))
  } finally {
    loading.value = false
  }
}

async function onCopyYear() {
  try {
    await ElMessageBox.confirm(
      `將 ${props.schoolYear - 1} 學年（上＋下學期）的範本複製到 ${props.schoolYear} 學年：` +
        '金額照抄、收費/逾期日自動平移一年，已存在的組合會跳過。複製後不會立即產單，' +
        '請先確認金額與日期無誤。確定複製？',
      '複製上學年範本',
      { confirmButtonText: '複製', cancelButtonText: '取消', type: 'warning' },
    )
  } catch {
    return
  }
  copying.value = true
  try {
    const res = await copyYearFeeTemplates({
      from_school_year: props.schoolYear - 1,
      to_school_year: props.schoolYear,
    })
    ElMessage.success(`已複製 ${res.created} 筆範本（跳過既有 ${res.skipped} 筆）`)
    await load()
    emit('changed')
  } catch (e) {
    ElMessage.error(apiError(e, '複製失敗'))
  } finally {
    copying.value = false
  }
}

watch(() => props.schoolYear, () => void load())
onMounted(load)

defineExpose({ load, missingCount, templates })
</script>

<style scoped>
.year-grid {
  border: 1px solid var(--el-border-color);
  border-radius: var(--radius-lg);
  padding: var(--space-3);
  margin-bottom: var(--space-4);
  background: var(--el-bg-color);
}
.year-grid__header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: var(--space-3);
  flex-wrap: wrap;
}
.year-grid__title {
  display: flex;
  align-items: center;
  gap: var(--space-2);
}
.year-grid__name {
  font-weight: 700;
  font-size: var(--text-base);
}
.year-grid__hint {
  margin: var(--space-1) 0 var(--space-2);
  font-size: var(--text-xs);
  color: var(--text-secondary);
}
.year-grid__table-wrap {
  overflow-x: auto;
}
.year-grid__table {
  width: 100%;
  border-collapse: collapse;
  font-size: var(--text-sm);
  font-variant-numeric: tabular-nums;
}
.year-grid__table th,
.year-grid__table td {
  border: 1px solid var(--el-border-color-lighter);
  padding: var(--space-1) var(--space-2);
  text-align: left;
  vertical-align: top;
}
.year-grid__table th {
  background: var(--el-fill-color-light);
  font-weight: 600;
}
.col-grade {
  white-space: nowrap;
  font-weight: 600;
}
.cell-row {
  display: flex;
  align-items: center;
  gap: var(--space-1);
  line-height: 1.6;
  white-space: nowrap;
}
.cell-sem {
  color: var(--text-secondary);
  font-size: var(--text-xs);
}
.cell-amount {
  font-weight: 600;
}
.cell-date {
  color: var(--text-secondary);
  font-size: var(--text-xs);
}
</style>
