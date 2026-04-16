<script setup>
import { reactive, ref, onMounted } from 'vue'
import { getBonusConfig, updateBonusConfig, getGradeTargets, updateGradeTargets, getPositionSalary, updatePositionSalary, comparePositionSalary, syncPositionSalary } from '@/api/config'
import { ElMessage } from 'element-plus'
import { hasPermission } from '@/utils/auth'

const loadingBonus = ref(false)
const activeBonusTab = ref('overtime')
const canReadSalarySettings = hasPermission('SETTINGS_READ')

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
    ElMessage.error('薪資設定載入失敗')
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
    ElMessage.success('薪資設定已儲存')
  } catch (error) {
    ElMessage.error('薪資設定儲存失敗')
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

const positionSalary = reactive({
  head_teacher_a: 39240,
  head_teacher_b: 37160,
  head_teacher_c: 33000,
  assistant_teacher_a: 35240,
  assistant_teacher_b: 33000,
  assistant_teacher_c: 29500,
  admin_staff: 37160,
  english_teacher: 32500,
  art_teacher: 30000,
  designer: 30000,
  nurse: 29800,
  driver: 30000,
  kitchen_staff: 29700,
  director: null,
  principal: null,
})
const loadingPositionSalary = ref(false)
const compareRows = ref([])
const compareOutOfSync = ref(0)
const loadingCompare = ref(false)
const syncingAll = ref(false)
const syncingIds = ref(new Set())

const STANDARD_KEY_LABEL = {
  head_teacher_a: '班導師 A 級', head_teacher_b: '班導師 B 級', head_teacher_c: '班導師 C 級',
  assistant_teacher_a: '副班導師 A 級', assistant_teacher_b: '副班導師 B 級', assistant_teacher_c: '副班導師 C 級',
  admin_staff: '行政', english_teacher: '美語', art_teacher: '藝術',
  designer: '美編', nurse: '護理', driver: '司機', kitchen_staff: '廚房',
  director: '主任', principal: '園長',
}

const fetchPositionSalary = async () => {
  loadingPositionSalary.value = true
  try {
    const response = await getPositionSalary()
    Object.assign(positionSalary, response.data)
  } catch (error) {
    ElMessage.error('職位底薪設定載入失敗')
  } finally {
    loadingPositionSalary.value = false
  }
}

const savePositionSalary = async () => {
  loadingPositionSalary.value = true
  try {
    await updatePositionSalary(positionSalary)
    ElMessage.success('職位標準底薪設定已儲存')
    await fetchCompare()
  } catch (error) {
    ElMessage.error('職位底薪設定儲存失敗')
  } finally {
    loadingPositionSalary.value = false
  }
}

const fetchCompare = async () => {
  loadingCompare.value = true
  try {
    const res = await comparePositionSalary()
    compareRows.value = res.data.employees
    compareOutOfSync.value = res.data.out_of_sync
  } catch {
    ElMessage.error('載入比對資料失敗')
  } finally {
    loadingCompare.value = false
  }
}

const syncOne = async (row) => {
  syncingIds.value = new Set([...syncingIds.value, row.employee_id])
  try {
    await syncPositionSalary([row.employee_id])
    ElMessage.success(`${row.name} 底薪已更新為 $${row.standard_salary.toLocaleString()}`)
    await fetchCompare()
  } catch {
    ElMessage.error('同步失敗')
  } finally {
    const s = new Set(syncingIds.value)
    s.delete(row.employee_id)
    syncingIds.value = s
  }
}

const syncAll = async () => {
  syncingAll.value = true
  try {
    const res = await syncPositionSalary([])
    ElMessage.success(`已同步 ${res.data.total_updated} 位員工底薪至職位標準`)
    await fetchCompare()
  } catch {
    ElMessage.error('批次同步失敗')
  } finally {
    syncingAll.value = false
  }
}

const saveAllBonusSettings = async () => {
  loadingBonus.value = true
  try {
    await saveBonusConfig()
    await saveGradeTargets()
    ElMessage.success('所有薪資設定已儲存')
  } finally {
    loadingBonus.value = false
  }
}

onMounted(() => {
  if (!canReadSalarySettings) return
  fetchBonusConfig()
  fetchGradeTargets()
  fetchPositionSalary()
  fetchCompare()
})
</script>

<template>
  <div v-if="canReadSalarySettings" v-loading="loadingBonus">
    <div class="bonus-actions">
      <el-button type="primary" size="large" @click="saveAllBonusSettings">儲存所有薪資設定</el-button>
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

      <!-- 節慶獎金（合併：教師基數 + 主管獎金 + 目標人數） -->
      <el-tab-pane label="節慶獎金" name="festival">
        <!-- 教師節慶獎金基數 -->
        <div class="section-title">教師節慶獎金基數</div>
        <el-row :gutter="20" class="mb-6">
          <el-col :span="12">
            <el-card header="班導師" shadow="never" class="box-card">
              <el-form-item label="A/B 級">
                <el-input-number v-model="bonusConfig.head_teacher_ab" :min="0" style="width: 100%" />
              </el-form-item>
              <el-form-item label="C 級">
                <el-input-number v-model="bonusConfig.head_teacher_c" :min="0" style="width: 100%" />
              </el-form-item>
            </el-card>
          </el-col>
          <el-col :span="12">
            <el-card header="副班導" shadow="never" class="box-card">
              <el-form-item label="A/B 級">
                <el-input-number v-model="bonusConfig.assistant_teacher_ab" :min="0" style="width: 100%" />
              </el-form-item>
              <el-form-item label="C 級">
                <el-input-number v-model="bonusConfig.assistant_teacher_c" :min="0" style="width: 100%" />
              </el-form-item>
            </el-card>
          </el-col>
        </el-row>

        <!-- 主管獎金 -->
        <div class="section-title">主管節慶獎金基數</div>
        <el-card class="box-card mb-6" shadow="never">
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

        <!-- 節慶獎金目標人數 -->
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

        <!-- 非帶班職位設定 -->
        <el-card class="box-card" shadow="never">
          <template #header><div class="card-header"><span>非帶班職位設定</span></div></template>
          <p class="desc-text">
            司機、美編、行政等非帶班職位的節慶獎金使用<b>全校比例</b>（在籍人數 / 目標人數）計算。
          </p>
          <el-form-item label="全校目標人數">
            <el-input-number v-model="bonusConfig.school_wide_target" :min="0" size="large" />
          </el-form-item>
          <el-divider />
          <div class="label mb-2">非帶班職位獎金基數</div>
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

      <!-- 職位標準底薪 -->
      <el-tab-pane label="職位標準底薪" name="position_salary">
        <div v-loading="loadingPositionSalary">
          <div class="section-title">職位標準底薪設定</div>
          <p class="desc-text">設定各職位的標準底薪，供新增員工時自動建議。特例可在員工編輯頁手動調整。</p>

          <!-- 教師職位（分 A/B/C 級） -->
          <el-row :gutter="20" class="mb-4">
            <el-col :span="12">
              <el-card header="班導師" shadow="never" class="box-card">
                <el-form label-width="80px">
                  <el-form-item label="A 級">
                    <el-input-number v-model="positionSalary.head_teacher_a" :min="0" :step="100" style="width: 100%" />
                  </el-form-item>
                  <el-form-item label="B 級">
                    <el-input-number v-model="positionSalary.head_teacher_b" :min="0" :step="100" style="width: 100%" />
                  </el-form-item>
                  <el-form-item label="C 級">
                    <el-input-number v-model="positionSalary.head_teacher_c" :min="0" :step="100" style="width: 100%" />
                  </el-form-item>
                </el-form>
              </el-card>
            </el-col>
            <el-col :span="12">
              <el-card header="副班導師" shadow="never" class="box-card">
                <el-form label-width="80px">
                  <el-form-item label="A 級">
                    <el-input-number v-model="positionSalary.assistant_teacher_a" :min="0" :step="100" style="width: 100%" />
                  </el-form-item>
                  <el-form-item label="B 級">
                    <el-input-number v-model="positionSalary.assistant_teacher_b" :min="0" :step="100" style="width: 100%" />
                  </el-form-item>
                  <el-form-item label="C 級">
                    <el-input-number v-model="positionSalary.assistant_teacher_c" :min="0" :step="100" style="width: 100%" />
                  </el-form-item>
                </el-form>
              </el-card>
            </el-col>
          </el-row>

          <!-- 其他職位（固定底薪） -->
          <el-row :gutter="20">
            <el-col :span="8">
              <el-card header="行政" shadow="never" class="box-card">
                <div class="label">基本薪俸</div>
                <el-input-number v-model="positionSalary.admin_staff" :min="0" :step="100" style="width: 100%" />
              </el-card>
            </el-col>
            <el-col :span="8">
              <el-card header="美語" shadow="never" class="box-card">
                <div class="label">基本薪俸</div>
                <el-input-number v-model="positionSalary.english_teacher" :min="0" :step="100" style="width: 100%" />
              </el-card>
            </el-col>
            <el-col :span="8">
              <el-card header="藝術" shadow="never" class="box-card">
                <div class="label">基本薪俸</div>
                <el-input-number v-model="positionSalary.art_teacher" :min="0" :step="100" style="width: 100%" />
              </el-card>
            </el-col>
            <el-col :span="8" class="mt-4">
              <el-card header="美編" shadow="never" class="box-card">
                <div class="label">基本薪俸</div>
                <el-input-number v-model="positionSalary.designer" :min="0" :step="100" style="width: 100%" />
              </el-card>
            </el-col>
            <el-col :span="8" class="mt-4">
              <el-card header="護理人員" shadow="never" class="box-card">
                <div class="label">基本薪俸</div>
                <el-input-number v-model="positionSalary.nurse" :min="0" :step="100" style="width: 100%" />
              </el-card>
            </el-col>
            <el-col :span="8" class="mt-4">
              <el-card header="司機" shadow="never" class="box-card">
                <div class="label">基本薪俸</div>
                <el-input-number v-model="positionSalary.driver" :min="0" :step="100" style="width: 100%" />
              </el-card>
            </el-col>
            <el-col :span="8" class="mt-4">
              <el-card header="廚房" shadow="never" class="box-card">
                <div class="label">基本薪俸</div>
                <el-input-number v-model="positionSalary.kitchen_staff" :min="0" :step="100" style="width: 100%" />
              </el-card>
            </el-col>
            <el-col :span="8" class="mt-4">
              <el-card header="主任" shadow="never" class="box-card">
                <div class="label">基本薪俸</div>
                <el-input-number v-model="positionSalary.director" :min="0" :step="100" style="width: 100%" placeholder="未設定" />
              </el-card>
            </el-col>
            <el-col :span="8" class="mt-4">
              <el-card header="園長" shadow="never" class="box-card">
                <div class="label">基本薪俸（留空表示不套用標準）</div>
                <el-input-number v-model="positionSalary.principal" :min="0" :step="100" style="width: 100%" placeholder="未設定" />
              </el-card>
            </el-col>
          </el-row>

          <div class="mt-4" style="text-align: right">
            <el-button type="primary" @click="savePositionSalary">儲存職位底薪設定</el-button>
          </div>

          <!-- 員工底薪比對 -->
          <el-divider />
          <div class="section-title" style="display: flex; align-items: center; gap: 12px">
            員工底薪比對
            <el-tag v-if="compareOutOfSync > 0" type="danger" size="small">
              {{ compareOutOfSync }} 人不符標準
            </el-tag>
            <el-tag v-else-if="compareRows.length > 0" type="success" size="small">全員已符合標準</el-tag>
          </div>
          <p class="desc-text">薪資計算時會自動套用上方標準底薪，此表顯示員工資料庫中的底薪是否已同步（僅供參考，不影響計算結果）。</p>

          <div v-loading="loadingCompare">
            <div v-if="compareRows.length > 0">
              <div style="text-align: right; margin-bottom: 8px">
                <el-button
                  type="warning"
                  size="small"
                  :loading="syncingAll"
                  :disabled="compareOutOfSync === 0"
                  @click="syncAll"
                >
                  批次同步全部（{{ compareOutOfSync }} 人）
                </el-button>
                <el-button size="small" :loading="loadingCompare" @click="fetchCompare">重新整理</el-button>
              </div>

              <el-table :data="compareRows" size="small" border stripe>
                <el-table-column label="姓名" prop="name" width="90" />
                <el-table-column label="職稱" prop="title" width="90" />
                <el-table-column label="職位" prop="position" width="80" />
                <el-table-column label="等級" width="60">
                  <template #default="{ row }">{{ row.bonus_grade || '—' }}</template>
                </el-table-column>
                <el-table-column label="對應標準" width="120">
                  <template #default="{ row }">{{ STANDARD_KEY_LABEL[row.standard_key] || row.standard_key }}</template>
                </el-table-column>
                <el-table-column label="目前底薪" width="110" align="right">
                  <template #default="{ row }">
                    <span :style="row.in_sync ? '' : 'color: var(--el-color-danger)'">
                      ${{ row.current_salary.toLocaleString() }}
                    </span>
                  </template>
                </el-table-column>
                <el-table-column label="標準底薪" width="110" align="right">
                  <template #default="{ row }">
                    ${{ row.standard_salary.toLocaleString() }}
                  </template>
                </el-table-column>
                <el-table-column label="差異" width="100" align="right">
                  <template #default="{ row }">
                    <span v-if="row.in_sync" style="color: var(--el-color-success)">✓ 符合</span>
                    <span v-else :style="row.diff > 0 ? 'color: var(--el-color-success)' : 'color: var(--el-color-danger)'">
                      {{ row.diff > 0 ? '+' : '' }}{{ row.diff.toLocaleString() }}
                    </span>
                  </template>
                </el-table-column>
                <el-table-column label="操作" width="90" align="center">
                  <template #default="{ row }">
                    <el-button
                      v-if="!row.in_sync"
                      type="primary"
                      size="small"
                      :loading="syncingIds.has(row.employee_id)"
                      @click="syncOne(row)"
                    >同步</el-button>
                    <span v-else style="color: var(--el-color-success); font-size: 12px">已同步</span>
                  </template>
                </el-table-column>
              </el-table>
            </div>
            <el-empty v-else description="無可比對員工" :image-size="60" />
          </div>
        </div>
      </el-tab-pane>
    </el-tabs>
  </div>
  <el-alert v-else type="warning" :closable="false" show-icon title="目前帳號沒有查看薪資設定的權限" />
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
