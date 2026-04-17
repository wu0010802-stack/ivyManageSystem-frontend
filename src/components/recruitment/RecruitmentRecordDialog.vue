<template>
  <el-dialog
    :model-value="visible"
    :title="mode === 'add' ? '新增訪視記錄' : '編輯訪視記錄'"
    width="680px"
    @update:model-value="$emit('update:visible', $event)"
  >
    <el-form :model="form" :rules="formRules" ref="formRef" label-width="95px" size="small">
      <div class="form-section-title">基本資料</div>
      <el-row :gutter="12">
        <el-col :span="12">
          <el-form-item label="參觀日期" prop="month">
            <el-date-picker
              v-model="form.month_raw"
              type="date"
              value-format="YYYY-MM-DD"
              placeholder="選擇參觀日期（年月日）"
              style="width:100%"
            />
            <div v-if="form.visit_date" style="font-size:11px;color:#909399;margin-top:2px">
              民國：{{ form.visit_date }}（月份：{{ form.month }}）
            </div>
          </el-form-item>
        </el-col>
        <el-col :span="12">
          <el-form-item label="序號">
            <el-input v-model="form.seq_no" placeholder="選填" />
          </el-form-item>
        </el-col>
        <el-col :span="12">
          <el-form-item label="幼生姓名" prop="child_name">
            <el-input v-model="form.child_name" />
          </el-form-item>
        </el-col>
        <el-col :span="12">
          <el-form-item label="適讀班級">
            <el-select v-model="form.grade" clearable style="width:100%">
              <el-option v-for="g in GRADES_ORDER" :key="g" :label="g" :value="g" />
            </el-select>
          </el-form-item>
        </el-col>
        <el-col :span="12">
          <el-form-item label="生日">
            <el-date-picker v-model="form.birthday" type="date" value-format="YYYY-MM-DD" style="width:100%" />
          </el-form-item>
        </el-col>
      </el-row>

      <div class="form-section-title">聯絡與來源</div>
      <el-row :gutter="12">
        <el-col :span="12">
          <el-form-item label="電話">
            <el-input v-model="form.phone" />
          </el-form-item>
        </el-col>
        <el-col :span="12">
          <el-form-item label="行政區">
            <el-autocomplete
              v-model="form.district"
              :fetch-suggestions="districtQuery"
              clearable
              style="width:100%"
            />
          </el-form-item>
        </el-col>
        <el-col :span="24">
          <el-form-item label="地址">
            <el-input v-model="form.address" />
          </el-form-item>
        </el-col>
        <el-col :span="12">
          <el-form-item label="幼生來源">
            <el-autocomplete
              v-model="form.source"
              :fetch-suggestions="sourceQuery"
              clearable
              style="width:100%"
            />
          </el-form-item>
        </el-col>
        <el-col :span="12">
          <el-form-item label="介紹者">
            <el-autocomplete
              v-model="form.referrer"
              :fetch-suggestions="referrerQuery"
              clearable
              style="width:100%"
            />
          </el-form-item>
        </el-col>
      </el-row>

      <div class="form-section-title">預繳狀態</div>
      <el-row :gutter="12">
        <el-col :span="12">
          <el-form-item label="是否預繳">
            <el-switch
              v-model="form.has_deposit"
              active-text="已預繳"
              inactive-text="未預繳"
              @change="onDepositChange"
            />
          </el-form-item>
        </el-col>
        <el-col :span="12">
          <el-form-item label="收預繳人員">
            <el-input v-model="form.deposit_collector" :disabled="!form.has_deposit" placeholder="預繳時填寫" />
          </el-form-item>
        </el-col>
        <el-col :span="12">
          <el-form-item label="已報到/註冊">
            <el-switch v-model="form.enrolled" active-text="是" inactive-text="否" />
          </el-form-item>
        </el-col>
        <el-col :span="12">
          <el-form-item label="轉其他學期">
            <el-switch v-model="form.transfer_term" active-text="是" inactive-text="否" />
          </el-form-item>
        </el-col>
        <template v-if="!form.has_deposit">
          <el-col :span="24">
            <el-form-item label="未預繳原因">
              <el-select v-model="form.no_deposit_reason" clearable placeholder="請選擇原因" style="width:100%">
                <el-option v-for="r in noDepositReasons" :key="r" :label="r" :value="r" />
              </el-select>
            </el-form-item>
          </el-col>
          <el-col :span="24">
            <el-form-item label="原因說明">
              <el-input v-model="form.no_deposit_reason_detail" type="textarea" :rows="2" placeholder="詳細說明（選填）" />
            </el-form-item>
          </el-col>
        </template>
      </el-row>

      <div class="form-section-title">備註</div>
      <el-row :gutter="12">
        <el-col :span="24">
          <el-form-item label="備註">
            <el-input v-model="form.notes" type="textarea" :rows="2" />
          </el-form-item>
        </el-col>
        <el-col :span="24">
          <el-form-item label="電訪回應">
            <el-input v-model="form.parent_response" type="textarea" :rows="2" />
          </el-form-item>
        </el-col>
      </el-row>
    </el-form>
    <template #footer>
      <el-button @click="$emit('update:visible', false)">取消</el-button>
      <el-button type="primary" :loading="saving" @click="handleSave">儲存</el-button>
    </template>
  </el-dialog>
</template>

<script setup>
import { ref, watch } from 'vue'
import { GRADES_ORDER } from '@/constants/recruitment'

const props = defineProps({
  visible: { type: Boolean, required: true },
  mode: { type: String, default: 'add' },
  form: { type: Object, required: true },
  saving: { type: Boolean, default: false },
  districtSuggestions: { type: Array, default: () => [] },
  sourceSuggestions: { type: Array, default: () => [] },
  referrerSuggestions: { type: Array, default: () => [] },
  noDepositReasons: { type: Array, default: () => [] },
})

const emit = defineEmits(['update:visible', 'save'])
const formRef = ref(null)

const formRules = {
  month: [{ required: true, message: '請選擇參觀日期', trigger: 'blur' }],
  child_name: [{ required: true, message: '請填寫姓名', trigger: 'blur' }],
}

// -------- 日期轉換（西元 ↔ 民國）--------
const isoToRoc = (iso) => {
  if (!iso) return ''
  const [y, m, d] = iso.split('-')
  return `${parseInt(y) - 1911}.${m}.${d}`
}
const isoToRocMonth = (iso) => {
  if (!iso) return ''
  const [y, m] = iso.split('-')
  return `${parseInt(y) - 1911}.${m}`
}

// 監聽 month_raw（YYYY-MM-DD）→ 同步 visit_date 與 month（民國格式）
watch(
  () => props.form.month_raw,
  (iso) => {
    if (iso) {
      props.form.visit_date = isoToRoc(iso)
      props.form.month = isoToRocMonth(iso.substring(0, 7))
    } else {
      props.form.visit_date = ''
      props.form.month = ''
    }
  },
)

// -------- autocomplete 建議列表 --------
const _makeSuggestions = (list, query, cb) => {
  const q = (query || '').trim().toLowerCase()
  const items = list
    .filter((v) => !q || v.toLowerCase().includes(q))
    .map((v) => ({ value: v }))
  cb(items)
}

const districtQuery = (query, cb) => {
  _makeSuggestions(props.districtSuggestions.filter(Boolean), query, cb)
}
const sourceQuery = (query, cb) => _makeSuggestions(props.sourceSuggestions, query, cb)
const referrerQuery = (query, cb) => _makeSuggestions(props.referrerSuggestions, query, cb)

const onDepositChange = (val) => {
  if (val) {
    props.form.no_deposit_reason = null
    props.form.no_deposit_reason_detail = ''
  } else {
    props.form.deposit_collector = ''
  }
}

const handleSave = async () => {
  await formRef.value.validate()
  emit('save')
}

defineExpose({ formRef })
</script>
