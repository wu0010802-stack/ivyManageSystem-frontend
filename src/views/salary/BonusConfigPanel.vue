<script setup>
import { reactive, ref, onMounted } from 'vue'
import { getBonusConfig, updateBonusConfig, getGradeTargets, updateGradeTargets } from '@/api/config'
import { ElMessage } from 'element-plus'

const loadingBonus = ref(false)
const activeBonusTab = ref('overtime')

const bonusConfig = reactive({
  head_teacher_ab: 0,
  head_teacher_c: 0,
  assistant_teacher_ab: 0,
  assistant_teacher_c: 0,
  principal_festival: 0,
  director_festival: 0,
  leader_festival: 0,
  driver_festival: 0,
  designer_festival: 0,
  admin_festival: 0,
  principal_dividend: 0,
  director_dividend: 0,
  leader_dividend: 0,
  vice_leader_dividend: 0,
  overtime_head_normal: 0,
  overtime_head_baby: 0,
  overtime_assistant_normal: 0,
  overtime_assistant_baby: 0,
  school_wide_target: 0
})

const gradeTargets = ref([])

const fetchBonusConfig = async () => {
  loadingBonus.value = true
  try {
    const response = await getBonusConfig()
    Object.assign(bonusConfig, response.data)
  } catch (error) {
    ElMessage.error('獎金設定載入失敗')
  } finally {
    loadingBonus.value = false
  }
}

const fetchGradeTargets = async () => {
  try {
    const response = await getGradeTargets()
    gradeTargets.value = Object.entries(response.data).map(([name, data]) => ({
      name,
      ...data
    }))
  } catch (error) {
    ElMessage.error('年級目標載入失敗')
  }
}

const saveBonusConfig = async () => {
  loadingBonus.value = true
  try {
    await updateBonusConfig(bonusConfig)
    ElMessage.success('獎金設定已儲存')
  } catch (error) {
    ElMessage.error('獎金設定儲存失敗')
  } finally {
    loadingBonus.value = false
  }
}

const saveGradeTargets = async () => {
  try {
    const updatePromises = gradeTargets.value.map(grade => {
      const payload = {
        grade_name: grade.name,
        festival_two_teachers: grade.festival_two_teachers,
        festival_one_teacher: grade.festival_one_teacher,
        festival_shared: grade.festival_shared,
        overtime_two_teachers: grade.overtime_two_teachers,
        overtime_one_teacher: grade.overtime_one_teacher,
        overtime_shared: grade.overtime_shared
      }
      return updateGradeTargets(payload)
    })
    await Promise.all(updatePromises)
  } catch (error) {
    ElMessage.error('年級目標儲存失敗')
  }
}

const saveAllBonusSettings = async () => {
  loadingBonus.value = true
  try {
    await saveBonusConfig()
    await saveGradeTargets()
    ElMessage.success('所有獎金設定已儲存')
  } finally {
    loadingBonus.value = false
  }
}

onMounted(() => {
  fetchBonusConfig()
  fetchGradeTargets()
})
</script>

<template>
  <div v-loading="loadingBonus">
    <div class="bonus-actions">
      <el-button type="primary" size="large" @click="saveAllBonusSettings">儲存所有獎金設定</el-button>
    </div>

    <el-tabs v-model="activeBonusTab" type="border-card">
      <!-- 超額獎金 -->
      <el-tab-pane label="超額獎金" name="overtime">
        <div class="section-title">每人獎金金額</div>
        <div class="config-grid">
          <el-card class="box-card" shadow="never">
            <template #header><div class="card-header"><span>大班 / 中班 / 小班</span></div></template>
            <el-row :gutter="20">
              <el-col :span="12">
                <div class="label">班導師</div>
                <el-input-number v-model="bonusConfig.overtime_head_normal" :min="0" style="width: 100%" />
              </el-col>
              <el-col :span="12">
                <div class="label">副班導</div>
                <el-input-number v-model="bonusConfig.overtime_assistant_normal" :min="0" style="width: 100%" />
              </el-col>
            </el-row>
          </el-card>
          <el-card class="box-card" shadow="never">
            <template #header><div class="card-header"><span>幼幼班</span></div></template>
            <el-row :gutter="20">
              <el-col :span="12">
                <div class="label">班導師</div>
                <el-input-number v-model="bonusConfig.overtime_head_baby" :min="0" style="width: 100%" />
              </el-col>
              <el-col :span="12">
                <div class="label">副班導</div>
                <el-input-number v-model="bonusConfig.overtime_assistant_baby" :min="0" style="width: 100%" />
              </el-col>
            </el-row>
          </el-card>
        </div>

        <div class="section-title mt-6">超額獎金目標人數</div>
        <el-table :data="gradeTargets" border style="width: 100%" stripe>
          <el-table-column prop="name" label="年級" width="100" fixed />
          <el-table-column label="1班2師 (班導+副班導)">
            <template #default="scope">
              <el-input-number v-model="scope.row.overtime_two_teachers" :min="0" size="small" controls-position="right" style="width: 100%" />
            </template>
          </el-table-column>
          <el-table-column label="1班1師 (班導)">
            <template #default="scope">
              <el-input-number v-model="scope.row.overtime_one_teacher" :min="0" size="small" controls-position="right" style="width: 100%" />
            </template>
          </el-table-column>
          <el-table-column label="2班共用副班導">
            <template #default="scope">
              <el-input-number v-model="scope.row.overtime_shared" :min="0" size="small" controls-position="right" style="width: 100%" />
            </template>
          </el-table-column>
        </el-table>
      </el-tab-pane>

      <!-- 節慶獎金 -->
      <el-tab-pane label="節慶獎金" name="festival">
        <div class="section-title">節慶獎金目標人數</div>
        <el-table :data="gradeTargets" border style="width: 100%" stripe class="mb-6">
          <el-table-column prop="name" label="年級" width="100" fixed />
          <el-table-column label="1班2師 (班導+副班導)">
            <template #default="scope">
              <el-input-number v-model="scope.row.festival_two_teachers" :min="0" size="small" controls-position="right" style="width: 100%" />
            </template>
          </el-table-column>
          <el-table-column label="1班1師 (班導)">
            <template #default="scope">
              <el-input-number v-model="scope.row.festival_one_teacher" :min="0" size="small" controls-position="right" style="width: 100%" />
            </template>
          </el-table-column>
          <el-table-column label="2班共用副班導">
            <template #default="scope">
              <el-input-number v-model="scope.row.festival_shared" :min="0" size="small" controls-position="right" style="width: 100%" />
            </template>
          </el-table-column>
        </el-table>

        <el-card class="box-card" shadow="never">
          <template #header><div class="card-header"><span>辦公室人員設定</span></div></template>
          <p class="desc-text">
            辦公室人員的節慶獎金使用<b>全校比例</b>（在籍人數 / 目標人數）計算。
          </p>
          <el-form-item label="全校目標人數">
            <el-input-number v-model="bonusConfig.school_wide_target" :min="0" size="large" />
          </el-form-item>
          <el-divider />
          <div class="label mb-2">辦公室人員獎金基數</div>
          <el-row :gutter="20">
            <el-col :span="8">
              <el-form-item label="司機">
                <el-input-number v-model="bonusConfig.driver_festival" :min="0" :step="100" style="width: 100%" />
              </el-form-item>
            </el-col>
            <el-col :span="8">
              <el-form-item label="美編">
                <el-input-number v-model="bonusConfig.designer_festival" :min="0" :step="100" style="width: 100%" />
              </el-form-item>
            </el-col>
            <el-col :span="8">
              <el-form-item label="行政">
                <el-input-number v-model="bonusConfig.admin_festival" :min="0" :step="100" style="width: 100%" />
              </el-form-item>
            </el-col>
          </el-row>
        </el-card>
      </el-tab-pane>

      <!-- 主管獎金 -->
      <el-tab-pane label="主管獎金" name="supervisor">
        <div class="section-title">主管紅利</div>
        <el-card class="box-card mb-6" shadow="never">
          <el-row :gutter="20">
            <el-col :span="12">
              <div class="label">園長</div>
              <el-input-number v-model="bonusConfig.principal_dividend" :min="0" style="width: 100%" />
            </el-col>
            <el-col :span="12">
              <div class="label">主任</div>
              <el-input-number v-model="bonusConfig.director_dividend" :min="0" style="width: 100%" />
            </el-col>
            <el-col :span="12" class="mt-4">
              <div class="label">組長</div>
              <el-input-number v-model="bonusConfig.leader_dividend" :min="0" style="width: 100%" />
            </el-col>
            <el-col :span="12" class="mt-4">
              <div class="label">副組長</div>
              <el-input-number v-model="bonusConfig.vice_leader_dividend" :min="0" style="width: 100%" />
            </el-col>
          </el-row>
        </el-card>

        <div class="section-title">主管節慶獎金基數</div>
        <el-card class="box-card" shadow="never">
          <el-row :gutter="20">
            <el-col :span="8">
              <div class="label">園長</div>
              <el-input-number v-model="bonusConfig.principal_festival" :min="0" style="width: 100%" />
            </el-col>
            <el-col :span="8">
              <div class="label">主任</div>
              <el-input-number v-model="bonusConfig.director_festival" :min="0" style="width: 100%" />
            </el-col>
            <el-col :span="8">
              <div class="label">組長</div>
              <el-input-number v-model="bonusConfig.leader_festival" :min="0" style="width: 100%" />
            </el-col>
          </el-row>
        </el-card>
      </el-tab-pane>

      <!-- 教師基數 -->
      <el-tab-pane label="教師基數" name="teacher_base">
        <div class="section-title">教師節慶獎金基數</div>
        <el-row :gutter="20">
          <el-col :span="12">
            <el-card header="班導師" shadow="never">
              <el-form-item label="A/B 級">
                <el-input-number v-model="bonusConfig.head_teacher_ab" :min="0" />
              </el-form-item>
              <el-form-item label="C 級">
                <el-input-number v-model="bonusConfig.head_teacher_c" :min="0" />
              </el-form-item>
            </el-card>
          </el-col>
          <el-col :span="12">
            <el-card header="副班導" shadow="never">
              <el-form-item label="A/B 級">
                <el-input-number v-model="bonusConfig.assistant_teacher_ab" :min="0" />
              </el-form-item>
              <el-form-item label="C 級">
                <el-input-number v-model="bonusConfig.assistant_teacher_c" :min="0" />
              </el-form-item>
            </el-card>
          </el-col>
        </el-row>
      </el-tab-pane>
    </el-tabs>
  </div>
</template>

<style scoped>
.bonus-actions {
  margin-bottom: var(--space-4);
  text-align: right;
}
.section-title {
  font-size: var(--text-lg);
  font-weight: bold;
  margin: var(--space-5) 0 10px 0;
  color: #c0c4cc;
  border-left: 4px solid #409eff;
  padding-left: 10px;
}
.config-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--space-5);
}
.box-card {
  background-color: #2b303b;
  border: 1px solid #4c4d4f;
  color: #fff;
}
.card-header {
  font-weight: bold;
}
.label {
  margin-bottom: 5px;
  font-size: var(--text-base);
  color: #909399;
}
.desc-text {
  font-size: var(--text-sm);
  color: #909399;
  line-height: 1.6;
  margin-bottom: 15px;
}
.mt-4 { margin-top: var(--space-4); }
.mt-6 { margin-top: var(--space-6); }
.mb-2 { margin-bottom: var(--space-2, 8px); }
.mb-6 { margin-bottom: var(--space-6); }
</style>
