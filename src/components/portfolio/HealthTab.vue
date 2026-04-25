<template>
  <div class="health-tab">
    <!-- 過敏 Section -->
    <el-card class="section">
      <template #header>
        <div class="section-head">
          <span>過敏資訊</span>
          <el-button
            type="primary"
            size="small"
            :disabled="!canWriteHealth"
            @click="openAllergy()"
          >
            新增過敏
          </el-button>
        </div>
      </template>

      <el-empty v-if="allergies.length === 0" description="尚無過敏紀錄" :image-size="80" />

      <div v-else class="allergy-list">
        <div v-for="a in allergies" :key="a.id" class="allergy-row">
          <el-tag :type="severityType(a.severity)" size="large">
            🚨 {{ a.allergen }}
          </el-tag>
          <span class="severity-label">{{ severityLabel(a.severity) }}</span>
          <span v-if="a.reaction_symptom" class="symptom">{{ a.reaction_symptom }}</span>
          <el-tag v-if="!a.active" size="small" type="info">已停用</el-tag>
          <div class="allergy-actions">
            <el-button
              size="small"
              link
              :disabled="!canWriteHealth"
              @click="openAllergy(a)"
            >
              編輯
            </el-button>
            <el-button
              size="small"
              link
              type="danger"
              :disabled="!canWriteHealth"
              @click="confirmDeleteAllergy(a)"
            >
              刪除
            </el-button>
          </div>
        </div>
      </div>
    </el-card>

    <!-- 用藥單 Section -->
    <el-card class="section" style="margin-top: 16px">
      <template #header>
        <div class="section-head">
          <span>用藥單（近 30 日）</span>
          <el-button
            type="primary"
            size="small"
            :disabled="!canWriteHealth"
            @click="openMedOrder()"
          >
            新增用藥單
          </el-button>
        </div>
      </template>

      <el-empty v-if="orders.length === 0" description="尚無用藥紀錄" :image-size="80" />

      <el-table v-else :data="orders" stripe>
        <el-table-column prop="order_date" label="日期" width="120" />
        <el-table-column prop="medication_name" label="藥名" />
        <el-table-column prop="dose" label="劑量" width="100" />
        <el-table-column label="時段">
          <template #default="{ row }">
            <el-tag
              v-for="slot in row.time_slots"
              :key="slot"
              size="small"
              style="margin-right: 4px"
            >
              {{ slot }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="執行狀況" width="220">
          <template #default="{ row }">
            <div class="log-summary">
              <span v-for="lg in row.logs" :key="lg.id" class="log-chip">
                <el-tag
                  :type="logStatusType(lg.status)"
                  size="small"
                >
                  {{ lg.scheduled_time }} · {{ logStatusLabel(lg.status) }}
                </el-tag>
              </span>
            </div>
          </template>
        </el-table-column>
      </el-table>
    </el-card>

    <!-- 新增/編輯過敏 -->
    <el-dialog
      v-model="allergyDialog.visible"
      :title="allergyDialog.mode === 'create' ? '新增過敏' : '編輯過敏'"
      width="520px"
    >
      <el-form :model="allergyDialog.form" label-width="90px">
        <el-form-item label="過敏原" required>
          <el-input v-model="allergyDialog.form.allergen" placeholder="例：花生、牛奶、塵蟎" />
        </el-form-item>
        <el-form-item label="嚴重程度" required>
          <el-select v-model="allergyDialog.form.severity">
            <el-option label="輕微" value="mild" />
            <el-option label="中度" value="moderate" />
            <el-option label="嚴重" value="severe" />
          </el-select>
        </el-form-item>
        <el-form-item label="反應症狀">
          <el-input v-model="allergyDialog.form.reaction_symptom" placeholder="例：紅疹、呼吸急促" />
        </el-form-item>
        <el-form-item label="急救處置">
          <el-input
            v-model="allergyDialog.form.first_aid_note"
            type="textarea"
            :rows="2"
            placeholder="例：立即給 EpiPen 並送醫"
          />
        </el-form-item>
        <el-form-item v-if="allergyDialog.mode === 'edit'" label="是否啟用">
          <el-switch v-model="allergyDialog.form.active" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="allergyDialog.visible = false">取消</el-button>
        <el-button
          type="primary"
          :loading="allergyDialog.saving"
          @click="saveAllergy"
        >
          {{ allergyDialog.mode === 'create' ? '建立' : '儲存' }}
        </el-button>
      </template>
    </el-dialog>

    <!-- 新增用藥單 -->
    <el-dialog
      v-model="medDialog.visible"
      title="新增當日用藥單"
      width="520px"
    >
      <el-form :model="medDialog.form" label-width="90px">
        <el-form-item label="日期" required>
          <el-date-picker
            v-model="medDialog.form.order_date"
            type="date"
            format="YYYY-MM-DD"
            value-format="YYYY-MM-DD"
          />
        </el-form-item>
        <el-form-item label="藥名" required>
          <el-input v-model="medDialog.form.medication_name" placeholder="例：感冒藥" />
        </el-form-item>
        <el-form-item label="劑量" required>
          <el-input v-model="medDialog.form.dose" placeholder="例：1 顆 / 5ml" />
        </el-form-item>
        <el-form-item label="時段" required>
          <div class="slot-editor">
            <el-time-picker
              v-for="(slot, idx) in medDialog.form.time_slots"
              :key="idx"
              :model-value="slotAsDate(slot)"
              format="HH:mm"
              value-format="HH:mm"
              placeholder="HH:MM"
              style="width: 110px; margin-right: 6px; margin-bottom: 6px"
              @update:model-value="(v) => setSlot(idx, v)"
            />
            <el-button size="small" @click="addSlot">+ 時段</el-button>
            <el-button
              v-if="medDialog.form.time_slots.length > 1"
              size="small"
              type="danger"
              @click="removeSlot"
            >
              - 時段
            </el-button>
          </div>
        </el-form-item>
        <el-form-item label="備註">
          <el-input v-model="medDialog.form.note" type="textarea" :rows="2" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="medDialog.visible = false">取消</el-button>
        <el-button
          type="primary"
          :loading="medDialog.saving"
          @click="saveMedOrder"
        >
          建立
        </el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { onMounted, reactive, ref, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import {
  listAllergies,
  createAllergy,
  updateAllergy,
  deleteAllergy,
  listMedicationOrders,
  createMedicationOrder,
} from '@/api/studentHealth'
import { hasPermission } from '@/utils/auth'
import { apiError } from '@/utils/error'

const props = defineProps({
  studentId: { type: Number, required: true },
})

const allergies = ref([])
const orders = ref([])
const canWriteHealth = ref(hasPermission('STUDENTS_HEALTH_WRITE'))

const allergyDialog = reactive({
  visible: false,
  mode: 'create',
  saving: false,
  editingId: null,
  form: {
    allergen: '',
    severity: 'moderate',
    reaction_symptom: '',
    first_aid_note: '',
    active: true,
  },
})

const medDialog = reactive({
  visible: false,
  saving: false,
  form: {
    order_date: new Date().toISOString().slice(0, 10),
    medication_name: '',
    dose: '',
    time_slots: ['08:30'],
    note: '',
  },
})

function severityType(s) {
  return s === 'severe' ? 'danger' : s === 'moderate' ? 'warning' : 'info'
}
function severityLabel(s) {
  return s === 'severe' ? '嚴重' : s === 'moderate' ? '中度' : '輕微'
}
function logStatusType(s) {
  return s === 'administered' ? 'success'
    : s === 'skipped' ? 'info'
    : s === 'correction' ? 'warning'
    : 'warning'
}
function logStatusLabel(s) {
  return { pending: '待餵', administered: '已餵', skipped: '跳過', correction: '修正' }[s] || s
}

async function reload() {
  try {
    const [a, m] = await Promise.all([
      listAllergies(props.studentId, { include_inactive: true }),
      listMedicationOrders(props.studentId),
    ])
    allergies.value = a.data.items || []
    orders.value = m.data.items || []
  } catch (e) {
    apiError(e, '載入健康資料失敗')
  }
}

function openAllergy(a = null) {
  if (a) {
    allergyDialog.mode = 'edit'
    allergyDialog.editingId = a.id
    allergyDialog.form = {
      allergen: a.allergen,
      severity: a.severity,
      reaction_symptom: a.reaction_symptom || '',
      first_aid_note: a.first_aid_note || '',
      active: a.active,
    }
  } else {
    allergyDialog.mode = 'create'
    allergyDialog.editingId = null
    allergyDialog.form = {
      allergen: '',
      severity: 'moderate',
      reaction_symptom: '',
      first_aid_note: '',
      active: true,
    }
  }
  allergyDialog.visible = true
}

async function saveAllergy() {
  if (!allergyDialog.form.allergen?.trim()) {
    ElMessage.warning('請輸入過敏原')
    return
  }
  allergyDialog.saving = true
  try {
    const payload = { ...allergyDialog.form }
    if (allergyDialog.mode === 'create') {
      await createAllergy(props.studentId, payload)
      ElMessage.success('已新增')
    } else {
      await updateAllergy(props.studentId, allergyDialog.editingId, payload)
      ElMessage.success('已更新')
    }
    allergyDialog.visible = false
    await reload()
  } catch (e) {
    apiError(e, '儲存失敗')
  } finally {
    allergyDialog.saving = false
  }
}

async function confirmDeleteAllergy(a) {
  try {
    await ElMessageBox.confirm(
      `確定刪除過敏紀錄「${a.allergen}」？`,
      '刪除過敏',
      { type: 'warning' }
    )
    await deleteAllergy(props.studentId, a.id)
    ElMessage.success('已刪除')
    await reload()
  } catch (e) {
    if (e !== 'cancel') apiError(e, '刪除失敗')
  }
}

function openMedOrder() {
  medDialog.form = {
    order_date: new Date().toISOString().slice(0, 10),
    medication_name: '',
    dose: '',
    time_slots: ['08:30'],
    note: '',
  }
  medDialog.visible = true
}

function slotAsDate(slot) {
  // el-time-picker accepts string when value-format='HH:mm'
  return slot
}

function setSlot(idx, v) {
  medDialog.form.time_slots[idx] = v || ''
}

function addSlot() {
  medDialog.form.time_slots.push('12:00')
}

function removeSlot() {
  medDialog.form.time_slots.pop()
}

async function saveMedOrder() {
  const { medication_name, dose, time_slots } = medDialog.form
  if (!medication_name.trim() || !dose.trim()) {
    ElMessage.warning('請完整填寫藥名與劑量')
    return
  }
  const valid = time_slots.every((s) => /^([01]\d|2[0-3]):([0-5]\d)$/.test(s))
  if (!valid) {
    ElMessage.warning('時段格式錯誤（應為 HH:MM）')
    return
  }
  const uniq = [...new Set(time_slots)]
  if (uniq.length !== time_slots.length) {
    ElMessage.warning('時段不可重複')
    return
  }
  medDialog.saving = true
  try {
    await createMedicationOrder(props.studentId, {
      order_date: medDialog.form.order_date,
      medication_name: medication_name.trim(),
      dose: dose.trim(),
      time_slots,
      note: medDialog.form.note || null,
    })
    ElMessage.success('已新增用藥單')
    medDialog.visible = false
    await reload()
  } catch (e) {
    apiError(e, '新增用藥單失敗')
  } finally {
    medDialog.saving = false
  }
}

watch(() => props.studentId, () => reload())
onMounted(reload)
</script>

<style scoped>
.section-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.allergy-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.allergy-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 8px;
  background: #fafafa;
  border-radius: 4px;
}
.severity-label {
  color: #909399;
  font-size: 13px;
}
.symptom {
  color: #606266;
  font-size: 13px;
  margin-left: 4px;
}
.allergy-actions {
  margin-left: auto;
}
.log-summary {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}
.slot-editor {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
}
</style>
