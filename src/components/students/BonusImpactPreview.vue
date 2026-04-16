<template>
  <div class="bonus-impact-preview" v-if="visible">
    <el-divider content-position="left">獎金影響預覽</el-divider>

    <div v-loading="loading" class="preview-body">
      <!-- 非發放月提示 -->
      <el-alert
        v-if="result && !result.is_festival_month"
        type="info"
        :closable="false"
        show-icon
        style="margin-bottom: 12px"
      >
        目前非獎金發放月，影響將在下次節慶月（2、6、9、12月）生效
      </el-alert>

      <!-- 受影響班級 -->
      <template v-if="result?.affected_classrooms?.length">
        <div
          v-for="cls in result.affected_classrooms"
          :key="cls.classroom_id"
          class="classroom-impact"
        >
          <div class="classroom-header">{{ cls.classroom_name }}（{{ cls.grade_name }}）</div>
          <div v-for="t in cls.teachers" :key="t.employee_id" class="teacher-row">
            <span class="teacher-name">{{ t.name }}</span>
            <span class="teacher-role">{{ t.role }}</span>
            <span class="bonus-change">
              ${{ t.current_bonus.toLocaleString() }}
              <el-icon style="margin: 0 4px; vertical-align: middle"><Right /></el-icon>
              ${{ t.projected_bonus.toLocaleString() }}
              <el-tag
                :type="t.change > 0 ? 'success' : t.change < 0 ? 'danger' : 'info'"
                size="small"
                effect="plain"
                style="margin-left: 6px"
              >
                {{ t.change > 0 ? '+' : '' }}{{ t.change.toLocaleString() }}
              </el-tag>
            </span>
          </div>
          <div class="enrollment-hint">
            人數：{{ cls.teachers[0]?.current_enrollment ?? '—' }}
            → {{ cls.teachers[0]?.projected_enrollment ?? '—' }}
            ／目標 {{ cls.teachers[0]?.target_enrollment ?? '—' }}
          </div>
        </div>
      </template>

      <!-- 全校影響（折疊） -->
      <el-collapse v-if="result?.school_wide_impact?.length" class="school-wide-collapse">
        <el-collapse-item title="主管 / 辦公室人員影響" name="sw">
          <div v-for="s in result.school_wide_impact" :key="s.employee_id" class="teacher-row">
            <span class="teacher-name">{{ s.name }}</span>
            <span class="teacher-role">{{ s.category }}</span>
            <span class="bonus-change">
              ${{ s.current_bonus.toLocaleString() }}
              <el-icon style="margin: 0 4px; vertical-align: middle"><Right /></el-icon>
              ${{ s.projected_bonus.toLocaleString() }}
              <el-tag
                :type="s.change > 0 ? 'success' : s.change < 0 ? 'danger' : 'info'"
                size="small"
                effect="plain"
                style="margin-left: 6px"
              >
                {{ s.change > 0 ? '+' : '' }}{{ s.change.toLocaleString() }}
              </el-tag>
            </span>
          </div>
        </el-collapse-item>
      </el-collapse>

      <!-- 無影響 -->
      <div v-if="result && !result.affected_classrooms?.length && !result.school_wide_impact?.length" class="no-impact">
        此操作不影響節慶獎金
      </div>

      <!-- 錯誤 -->
      <div v-if="error" class="error-hint">{{ error }}</div>
    </div>
  </div>
</template>

<script setup>
import { ref, watch, computed } from 'vue'
import { Right } from '@element-plus/icons-vue'
import { previewBonusImpact } from '@/api/students'

const props = defineProps({
  operation: { type: String, required: true },
  classroomId: { type: Number, default: null },
  sourceClassroomId: { type: Number, default: null },
  studentCount: { type: Number, default: 1 },
})

const loading = ref(false)
const result = ref(null)
const error = ref('')
let _timer = null

const visible = computed(() => {
  if (props.operation === 'add') return !!props.classroomId
  if (props.operation === 'transfer') return !!props.classroomId || !!props.sourceClassroomId
  return !!props.sourceClassroomId
})

const fetchPreview = async () => {
  if (!visible.value) {
    result.value = null
    return
  }
  loading.value = true
  error.value = ''
  try {
    const res = await previewBonusImpact({
      operation: props.operation,
      classroom_id: props.classroomId,
      source_classroom_id: props.sourceClassroomId,
      student_count_change: props.studentCount,
    })
    result.value = res.data
  } catch {
    error.value = '無法取得獎金預覽'
    result.value = null
  } finally {
    loading.value = false
  }
}

watch(
  () => [props.operation, props.classroomId, props.sourceClassroomId, props.studentCount],
  () => {
    clearTimeout(_timer)
    _timer = setTimeout(fetchPreview, 400)
  },
  { immediate: true },
)
</script>

<style scoped>
.bonus-impact-preview {
  margin-top: 8px;
}

.preview-body {
  min-height: 40px;
}

.classroom-impact {
  background: #f5f7fa;
  border-radius: 6px;
  padding: 10px 12px;
  margin-bottom: 8px;
}

.classroom-header {
  font-weight: 600;
  font-size: 13px;
  margin-bottom: 6px;
  color: #303133;
}

.teacher-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 3px 0;
  font-size: 13px;
}

.teacher-name {
  font-weight: 500;
  min-width: 50px;
}

.teacher-role {
  color: #909399;
  font-size: 12px;
  min-width: 56px;
}

.bonus-change {
  display: flex;
  align-items: center;
}

.enrollment-hint {
  font-size: 12px;
  color: #909399;
  margin-top: 4px;
}

.school-wide-collapse {
  margin-top: 8px;
}

.no-impact {
  text-align: center;
  color: #c0c4cc;
  padding: 12px 0;
  font-size: 13px;
}

.error-hint {
  color: #f56c6c;
  font-size: 13px;
  text-align: center;
  padding: 8px 0;
}
</style>
