<template>
  <el-card class="pos-signoff" shadow="never">
    <template #header>
      <div class="pos-signoff__head">
        <span>老闆簽收帳本</span>
        <el-button
          v-if="canApprove"
          type="primary"
          size="small"
          @click="openDialog"
        >
          記錄簽收
        </el-button>
      </div>
    </template>

    <el-table v-loading="loading" :data="items" size="small">
      <el-table-column label="簽收時間" width="150">
        <template #default="{ row }">{{ formatTaipeiDateTimeMinute(row.signed_at) }}</template>
      </el-table-column>
      <el-table-column label="金額" align="right" width="110">
        <template #default="{ row }">
          <span :class="{ 'pos-signoff__voided': row.voided_at }">
            {{ formatTWD(row.amount) }}
          </span>
        </template>
      </el-table-column>
      <el-table-column label="簽收人" prop="signed_by" width="100" />
      <el-table-column label="備註" prop="note" min-width="140" show-overflow-tooltip />
      <el-table-column label="狀態" width="90">
        <template #default="{ row }">
          <el-tooltip
            v-if="row.voided_at"
            :content="`作廢原因：${row.void_reason || '—'}（${row.voided_by || '—'}）`"
          >
            <el-tag type="info" size="small">已作廢</el-tag>
          </el-tooltip>
          <el-tag v-else type="success" size="small">有效</el-tag>
        </template>
      </el-table-column>
      <el-table-column v-if="canApprove" label="操作" width="80">
        <template #default="{ row }">
          <el-button
            v-if="!row.voided_at"
            size="small"
            link
            type="danger"
            @click="askVoid(row)"
          >
            作廢
          </el-button>
        </template>
      </el-table-column>
    </el-table>
    <el-empty
      v-if="!loading && items.length === 0"
      description="尚未記錄任何簽收"
      :image-size="48"
    />

    <el-dialog v-model="dialogVisible" title="記錄簽收" width="420px" align-center>
      <el-form label-width="90px" @submit.prevent>
        <el-form-item label="簽收金額" required>
          <el-input-number
            v-model="form.amount"
            :min="1"
            :max="99999999"
            :controls="false"
            style="width: 100%"
          />
        </el-form-item>
        <el-form-item label="建議金額">
          <span class="pos-signoff__suggest">
            {{ formatTWD(suggestAmount) }}（POS 淨實收 − 已簽收）
            <el-button
              size="small"
              link
              type="primary"
              :disabled="suggestAmount <= 0"
              @click="form.amount = suggestAmount"
            >
              帶入
            </el-button>
          </span>
        </el-form-item>
        <el-form-item label="備註">
          <el-input v-model="form.note" type="textarea" :rows="2" maxlength="500" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button
          type="primary"
          :loading="submitting"
          :disabled="!form.amount || form.amount <= 0"
          @click="submitSignoff"
        >
          確認簽收
        </el-button>
      </template>
    </el-dialog>
  </el-card>
</template>

<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'

import {
  createPOSSemesterSignoff,
  getPOSSemesterSignoffs,
  voidPOSSemesterSignoff,
} from '@/api/activity'
import { formatTWD } from '@/constants/pos'
import { formatTaipeiDateTimeMinute } from '@/utils/format'
import { hasPermission } from '@/utils/auth'

const props = defineProps<{
  schoolYear: number | null
  semester: number | null
  posNetPaid: number
}>()

const emit = defineEmits<{ changed: [] }>()

const canApprove = computed(() => hasPermission('ACTIVITY_PAYMENT_APPROVE'))

const loading = ref(false)
const submitting = ref(false)
const dialogVisible = ref(false)
const items = ref<Record<string, unknown>[]>([])
const signoffTotal = ref(0)

const form = reactive<{ amount: number | null; note: string }>({
  amount: null,
  note: '',
})

const suggestAmount = computed(() => Math.max(0, props.posNetPaid - signoffTotal.value))

// 請求序號守衛：切學期時舊回應不得覆寫新學期資料（比對頁面既有慣例）
let reloadSeq = 0

async function reload() {
  if (!props.schoolYear || !props.semester) return
  const seq = ++reloadSeq
  loading.value = true
  try {
    const res = await getPOSSemesterSignoffs({
      school_year: props.schoolYear,
      semester: props.semester,
    })
    if (seq !== reloadSeq) return
    items.value = (res.data.items || []) as Record<string, unknown>[]
    signoffTotal.value = Number(res.data.signoff_total || 0)
  } catch {
    if (seq !== reloadSeq) return
    ElMessage.error('簽收記錄載入失敗')
  } finally {
    if (seq === reloadSeq) loading.value = false
  }
}

function openDialog() {
  form.amount = null
  form.note = ''
  dialogVisible.value = true
}

async function submitSignoff() {
  if (!form.amount || form.amount <= 0 || !props.schoolYear || !props.semester) return
  submitting.value = true
  try {
    await createPOSSemesterSignoff({
      school_year: props.schoolYear,
      semester: props.semester,
      amount: form.amount,
      note: form.note.trim() || null,
    })
    ElMessage.success('簽收已登記')
    dialogVisible.value = false
    await reload()
    emit('changed')
  } catch {
    ElMessage.error('簽收登記失敗')
  } finally {
    submitting.value = false
  }
}

async function askVoid(row: Record<string, unknown>) {
  let reason = ''
  try {
    const result = await ElMessageBox.prompt('請輸入作廢原因（必填）', '作廢簽收', {
      inputValidator: (v: string) => (v && v.trim() ? true : '原因不可為空'),
    })
    reason = (result as { value: string }).value.trim()
  } catch {
    return // 使用者取消
  }
  try {
    await voidPOSSemesterSignoff(Number(row.id), { reason })
    ElMessage.success('已作廢')
    await reload()
    emit('changed')
  } catch {
    ElMessage.error('作廢失敗')
  }
}

watch(() => [props.schoolYear, props.semester], reload, { immediate: true })
</script>

<style scoped>
.pos-signoff__head {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.pos-signoff__voided {
  text-decoration: line-through;
  color: var(--text-tertiary);
}

.pos-signoff__suggest {
  font-size: 13px;
  color: var(--text-secondary);
}
</style>
