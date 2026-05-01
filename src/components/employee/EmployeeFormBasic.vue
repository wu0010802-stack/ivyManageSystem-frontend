<!-- src/components/employee/EmployeeFormBasic.vue -->
<script setup>
import { computed } from 'vue'
import { Lock } from '@element-plus/icons-vue'
import { SALARY_SENSITIVE_FIELDS } from '@/constants/employeeFields'
import {
  POSITION_OPTIONS, SUPERVISOR_ROLE_OPTIONS, EMPLOYEE_TYPE_OPTIONS,
} from '@/constants/employee'

const props = defineProps({
  form: { type: Object, required: true },
  bureauJobTitleOptions: { type: Array, default: () => [] },
  classroomOptions: { type: Array, default: () => [] },
  isSelfEdit: { type: Boolean, default: false },
  pendingSuggestion: { type: Boolean, default: false },
  suggestedSalary: { type: Number, default: null },
})

// 敏感欄位在 self-edit 模式下要呈現唯讀文字 + 鎖頭
const isLocked = (field) => props.isSelfEdit && SALARY_SENSITIVE_FIELDS.includes(field)

// readonly 顯示用 helper
const fmt = (v) => {
  if (v == null || v === '') return '—'
  return v
}

// employee_type 顯示用 label（避免顯示 raw value）
const employeeTypeLabel = computed(() => {
  const opt = EMPLOYEE_TYPE_OPTIONS.find(o => o.value === props.form.employee_type)
  return opt ? opt.label : fmt(props.form.employee_type)
})

// job_title_id 顯示用 name（從 bureauJobTitleOptions 反查，或 fallback form.title）
const jobTitleLabel = computed(() => {
  if (props.form.title) return props.form.title
  const found = props.bureauJobTitleOptions.find(o => o.id === props.form.job_title_id)
  return found ? found.name : fmt(props.form.job_title_id)
})

// classroom 顯示用 name
const classroomLabel = computed(() => {
  const found = props.classroomOptions.find(c => c.id === props.form.classroom_id)
  if (found) return `${found.name} (${found.grade_name || ''})`
  return fmt(props.form.classroom_id)
})
</script>

<template>
  <!-- 基本識別 -->
  <el-row :gutter="20">
    <el-col :span="12">
      <el-form-item label="員工編號" prop="employee_id">
        <el-input v-model="form.employee_id" placeholder="例: EMP001" />
      </el-form-item>
    </el-col>
    <el-col :span="12">
      <el-form-item label="姓名" prop="name">
        <el-input v-model="form.name" />
      </el-form-item>
    </el-col>
  </el-row>

  <!-- 職務 -->
  <el-row :gutter="20">
    <el-col :span="12">
      <el-form-item label="教育局系統" prop="job_title_id">
        <template v-if="isLocked('job_title_id')">
          <span class="readonly-text">{{ jobTitleLabel }} <el-icon><Lock /></el-icon></span>
          <div class="lock-hint">此欄位影響薪資，請由 HR 修改</div>
        </template>
        <el-select v-else v-model="form.job_title_id" placeholder="請選擇教育局系統職稱" style="width: 100%">
          <el-option
            v-for="item in bureauJobTitleOptions"
            :key="item.id"
            :label="item.name"
            :value="item.id"
          />
        </el-select>
      </el-form-item>
    </el-col>
    <el-col :span="12">
      <el-form-item label="職位" prop="position">
        <template v-if="isLocked('position')">
          <span class="readonly-text">{{ fmt(form.position) }} <el-icon><Lock /></el-icon></span>
          <div class="lock-hint">此欄位影響薪資，請由 HR 修改</div>
        </template>
        <el-select
          v-else
          v-model="form.position"
          filterable
          allow-create
          default-first-option
          placeholder="選擇或輸入職位"
          style="width: 100%"
        >
          <el-option v-for="p in POSITION_OPTIONS" :key="p" :label="p" :value="p" />
        </el-select>
      </el-form-item>
    </el-col>
  </el-row>

  <el-row :gutter="20">
    <el-col :span="12">
      <el-form-item label="獎金等級覆蓋">
        <template v-if="isLocked('bonus_grade')">
          <span class="readonly-text">{{ fmt(form.bonus_grade) }} <el-icon><Lock /></el-icon></span>
        </template>
        <template v-else>
          <el-select v-model="form.bonus_grade" clearable filterable allow-create placeholder="自動（依教育局系統）" style="width: 100%">
            <el-option label="A 級（幼兒園教師）" value="A" />
            <el-option label="B 級（教保員）" value="B" />
            <el-option label="C 級（助理教保員）" value="C" />
          </el-select>
          <div style="font-size:12px;color:#909399;margin-top:4px">保留手動覆蓋用於特例調整；請輸入或選擇 A / B / C，空白表示依教育局系統自動判斷</div>
        </template>
      </el-form-item>
    </el-col>
    <!-- 自動套薪資 banner（顯示在 bonus_grade 同行右欄） -->
    <el-col :span="12">
      <el-alert
        v-if="pendingSuggestion"
        type="info"
        :closable="false"
        show-icon
        style="margin-top: 4px;"
      >
        <template #default>
          依職稱建議底薪 {{ Number(suggestedSalary).toLocaleString() }}，請至「薪資」tab 確認套用
        </template>
      </el-alert>
    </el-col>
  </el-row>

  <el-row :gutter="20">
    <el-col :span="12">
      <el-form-item label="部門">
        <el-input v-model="form.department" />
      </el-form-item>
    </el-col>
    <el-col :span="12">
      <el-form-item label="員工類型">
        <template v-if="isLocked('employee_type')">
          <span class="readonly-text">{{ employeeTypeLabel }} <el-icon><Lock /></el-icon></span>
        </template>
        <el-select v-else v-model="form.employee_type" style="width: 100%">
          <el-option
            v-for="opt in EMPLOYEE_TYPE_OPTIONS"
            :key="opt.value"
            :label="opt.label"
            :value="opt.value"
          />
        </el-select>
      </el-form-item>
    </el-col>
  </el-row>

  <!-- 在職資訊 -->
  <el-row :gutter="20">
    <el-col :span="12">
      <el-form-item label="到職日期">
        <template v-if="isLocked('hire_date')">
          <span class="readonly-text">{{ fmt(form.hire_date) }} <el-icon><Lock /></el-icon></span>
          <div class="lock-hint">此欄位影響薪資，請由 HR 修改</div>
        </template>
        <el-date-picker v-else v-model="form.hire_date" type="date" placeholder="選擇日期" style="width: 100%" value-format="YYYY-MM-DD" />
      </el-form-item>
    </el-col>
    <el-col :span="12">
      <el-form-item label="試用期結束">
        <el-date-picker v-model="form.probation_end_date" type="date" placeholder="選擇日期" style="width: 100%" value-format="YYYY-MM-DD" clearable />
      </el-form-item>
    </el-col>
  </el-row>

  <!-- 個資 -->
  <el-row :gutter="20">
    <el-col :span="12">
      <el-form-item label="生日">
        <el-date-picker v-model="form.birthday" type="date" placeholder="選擇日期" style="width: 100%" value-format="YYYY-MM-DD" clearable />
      </el-form-item>
    </el-col>
    <el-col :span="12">
      <el-form-item label="身分證字號">
        <el-input v-model="form.id_number" placeholder="保留遮罩值將不會更新" />
      </el-form-item>
    </el-col>
  </el-row>

  <el-form-item label="主管職">
    <template v-if="isLocked('supervisor_role')">
      <span class="readonly-text">{{ fmt(form.supervisor_role) }} <el-icon><Lock /></el-icon></span>
    </template>
    <el-select v-else v-model="form.supervisor_role" clearable placeholder="無主管職" style="width: 100%">
      <el-option v-for="item in SUPERVISOR_ROLE_OPTIONS" :key="item" :label="item" :value="item" />
    </el-select>
  </el-form-item>

  <el-form-item label="班級">
    <template v-if="isLocked('classroom_id')">
      <span class="readonly-text">{{ classroomLabel }} <el-icon><Lock /></el-icon></span>
    </template>
    <el-select v-else v-model="form.classroom_id" placeholder="選擇班級" clearable style="width: 100%">
      <el-option
        v-for="c in classroomOptions"
        :key="c.id"
        :label="`${c.name} (${c.grade_name || ''})`"
        :value="c.id"
      />
    </el-select>
  </el-form-item>

  <el-divider content-position="left">聯絡與緊急聯絡</el-divider>

  <el-row :gutter="20">
    <el-col :span="12">
      <el-form-item label="聯絡電話">
        <el-input v-model="form.phone" placeholder="例：0912-345-678" />
      </el-form-item>
    </el-col>
    <el-col :span="12">
      <el-form-item label="眷屬人數">
        <el-input-number v-model="form.dependents" :min="0" :max="9" :step="1" style="width: 100%" />
      </el-form-item>
    </el-col>
  </el-row>

  <el-form-item label="通訊地址">
    <el-input v-model="form.address" type="textarea" :rows="2" />
  </el-form-item>

  <el-row :gutter="20">
    <el-col :span="12">
      <el-form-item label="緊急聯絡人">
        <el-input v-model="form.emergency_contact_name" />
      </el-form-item>
    </el-col>
    <el-col :span="12">
      <el-form-item label="緊急聯絡電話">
        <el-input v-model="form.emergency_contact_phone" />
      </el-form-item>
    </el-col>
  </el-row>

  <!-- 工作時間（BASIC_TAB_FIELDS 涵蓋） -->
  <el-row :gutter="20">
    <el-col :span="12">
      <el-form-item label="上班時間">
        <el-time-select v-model="form.work_start_time" start="06:00" step="00:30" end="22:00" style="width: 100%" />
      </el-form-item>
    </el-col>
    <el-col :span="12">
      <el-form-item label="下班時間">
        <el-time-select v-model="form.work_end_time" start="06:00" step="00:30" end="22:00" style="width: 100%" />
      </el-form-item>
    </el-col>
  </el-row>
</template>

<style scoped>
.readonly-text {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  color: var(--el-text-color-regular);
  background: var(--el-fill-color-light);
  padding: 4px 12px;
  border-radius: 4px;
}
.lock-hint {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  margin-top: 4px;
}
</style>
