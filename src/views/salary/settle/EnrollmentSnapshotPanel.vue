<script setup lang="ts">
import { ref, computed, onMounted, reactive } from 'vue'
import { ElMessage } from 'element-plus'
import {
    getEnrollmentSnapshot,
    generateEnrollmentSnapshot,
    patchEnrollmentSnapshot,
    confirmEnrollmentSnapshot,
} from '@/api/salary'
import { useErrorNotify } from '@/composables/useErrorNotify'

interface SnapshotRow {
    id: number
    classroom_id: number | null
    classroom_name: string
    student_count: number
    count_mode: string
    is_confirmed: boolean
    adjust_reason: string | null
}

const props = defineProps<{ year: number; month: number }>()

const { notify } = useErrorNotify()
const loading = ref(false)
const generating = ref(false)
const months = ref<[number, number][]>([])
const activeKey = ref('')
const rowsByMonth = reactive<Record<string, SnapshotRow[]>>({})

const key = (m: [number, number]) => `${m[0]}-${m[1]}`
const rows = computed(() => rowsByMonth[activeKey.value] || [])
const currentExists = computed(() => rows.value.length > 0)
const anyExists = computed(() => months.value.some((m) => (rowsByMonth[key(m)] || []).length > 0))
const coveredLabel = computed(() =>
    months.value.map((m) => `${m[1]}月`).join('、'),
)
const modeLabel = (mode: string) =>
    ({ month_end: '月底快照', daily_weighted: '按日加權', manual: '手動調整' })[mode] || mode

const activeMonth = computed<[number, number] | null>(
    () => months.value.find((m) => key(m) === activeKey.value) || null,
)

const fetchMonth = async (m: [number, number]) => {
    const res = await getEnrollmentSnapshot(m[0], m[1])
    const data = res.data as { rows: SnapshotRow[] }
    rowsByMonth[key(m)] = data.rows
}

const refresh = async () => {
    loading.value = true
    try {
        await Promise.all(months.value.map(fetchMonth))
    } catch (e) {
        notify(e, 'EnrollmentSnapshotPanel', '載入人數快照失敗')
    } finally {
        loading.value = false
    }
}

onMounted(async () => {
    loading.value = true
    try {
        // 以結算月查 covered_months（後端單一來源），再逐涵蓋月載入快照
        const res = await getEnrollmentSnapshot(props.year, props.month)
        const data = res.data as { covered_months: [number, number][] }
        months.value = data.covered_months || []
        if (months.value.length) {
            activeKey.value = key(months.value[0])
            await refresh()
        }
    } catch (e) {
        notify(e, 'EnrollmentSnapshotPanel', '載入人數快照失敗')
    } finally {
        loading.value = false
    }
})

const generateAll = async () => {
    generating.value = true
    try {
        for (const m of months.value) {
            await generateEnrollmentSnapshot({ year: m[0], month: m[1] })
        }
        ElMessage.success('快照已產生')
        await refresh()
    } catch (e) {
        notify(e, 'EnrollmentSnapshotPanel', '產生快照失敗')
    } finally {
        generating.value = false
    }
}

const confirmActive = async () => {
    const m = activeMonth.value
    if (!m) return
    try {
        await confirmEnrollmentSnapshot({ year: m[0], month: m[1] })
        ElMessage.success(`${m[1]} 月人數已確認`)
        await fetchMonth(m)
    } catch (e) {
        notify(e, 'EnrollmentSnapshotPanel', '確認失敗')
    }
}

// 調整 dialog
const editVisible = ref(false)
const editSaving = ref(false)
const editTarget = ref<SnapshotRow | null>(null)
const editForm = reactive({ student_count: 0, reason: '' })

const openEdit = (row: SnapshotRow) => {
    editTarget.value = row
    editForm.student_count = row.student_count
    editForm.reason = ''
    editVisible.value = true
}

const saveEdit = async () => {
    if (!editTarget.value) return
    if (editForm.reason.trim().length < 10) {
        ElMessage.warning('請填寫至少 10 個字的調整原因')
        return
    }
    editSaving.value = true
    try {
        await patchEnrollmentSnapshot(editTarget.value.id, {
            student_count: editForm.student_count,
            reason: editForm.reason.trim(),
        })
        ElMessage.success('已更新，受影響月份將標記需重新計算')
        editVisible.value = false
        if (activeMonth.value) await fetchMonth(activeMonth.value)
    } catch (e) {
        notify(e, 'EnrollmentSnapshotPanel', '更新失敗')
    } finally {
        editSaving.value = false
    }
}
</script>

<template>
  <el-card v-if="months.length" shadow="never" class="no-hover snap-card">
    <template #header>
      <div class="snap-header">
        <span>節慶/超額獎金在籍人數快照（涵蓋 {{ coveredLabel }}）</span>
        <div>
          <el-button size="small" :loading="generating" @click="generateAll">
            {{ anyExists ? '重新產生' : '產生快照' }}
          </el-button>
          <el-button size="small" type="success" :disabled="!currentExists" @click="confirmActive">
            確認本月
          </el-button>
        </div>
      </div>
    </template>

    <el-tabs v-model="activeKey">
      <el-tab-pane
        v-for="m in months"
        :key="key(m)"
        :label="`${m[0]} 年 ${m[1]} 月`"
        :name="key(m)"
      />
    </el-tabs>

    <el-table v-loading="loading" :data="rows" size="small" border>
      <el-table-column prop="classroom_name" label="班級" min-width="120" />
      <el-table-column prop="student_count" label="在籍人數" width="100" align="right" />
      <el-table-column label="模式" width="110">
        <template #default="{ row }">{{ modeLabel(row.count_mode) }}</template>
      </el-table-column>
      <el-table-column label="狀態" width="92">
        <template #default="{ row }">
          <el-tag :type="row.is_confirmed ? 'success' : 'info'" size="small">
            {{ row.is_confirmed ? '已確認' : '未確認' }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column prop="adjust_reason" label="調整原因" min-width="140" show-overflow-tooltip />
      <el-table-column label="操作" width="76">
        <template #default="{ row }">
          <el-button link type="primary" size="small" @click="openEdit(row)">調整</el-button>
        </template>
      </el-table-column>
    </el-table>
    <el-empty
      v-if="!loading && !rows.length"
      description="本月尚未產生快照——計算將以即時人數為準；建議先產生並核對"
      :image-size="60"
    />
    <p class="snap-note">
      薪資計算的獎金人數優先採用快照；手動調整需填原因（≥10 字），調整後受影響發放月會標記需重新計算。
    </p>

    <el-dialog v-model="editVisible" title="調整在籍人數" width="420px">
      <el-form label-width="90px">
        <el-form-item label="班級">{{ editTarget?.classroom_name }}</el-form-item>
        <el-form-item label="在籍人數">
          <el-input-number v-model="editForm.student_count" :min="0" :max="999" :precision="1" :step="1" />
        </el-form-item>
        <el-form-item label="調整原因">
          <el-input
            v-model="editForm.reason"
            type="textarea"
            :rows="3"
            placeholder="例如：3/15 兩位學生退學尚未登錄系統，依點名冊修正"
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="editVisible = false">取消</el-button>
        <el-button type="primary" :loading="editSaving" @click="saveEdit">儲存</el-button>
      </template>
    </el-dialog>
  </el-card>
</template>

<style scoped>
.snap-card {
  margin-bottom: var(--space-4);
}

.snap-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.snap-note {
  margin: var(--space-3) 0 0;
  color: var(--text-tertiary);
  font-size: var(--text-sm);
}
</style>
