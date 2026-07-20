<script setup lang="ts">
// BonusConfigPanel「職位標準底薪」tab（2026-07-12 體檢 F2 拆分）：
// 與其他 tab 無共用 state，完全自足——自己 fetch / save / onMounted。
// 掛載時機由父層 el-tabs（非 lazy）與外層 v-if="canReadSalarySettings"
// 決定：只有父層通過權限檢查渲染整個面板時，本元件才會 mount 並觸發 fetch，
// 與拆分前「父層 onMounted 內以 canReadSalarySettings 守衛才 fetch」等效。
import { reactive, ref, onMounted } from 'vue'
import { getPositionSalary, updatePositionSalary, comparePositionSalary, syncPositionSalary } from '@/api/config'
import { ElMessage } from 'element-plus'

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
const compareRows = ref<Record<string, unknown>[]>([])
const compareOutOfSync = ref(0)
const loadingCompare = ref(false)
const syncingAll = ref(false)
const syncingIds = ref(new Set<number>())

const STANDARD_KEY_LABEL: Record<string, string> = {
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

const syncOne = async (row: Record<string, unknown>) => {
  syncingIds.value = new Set([...syncingIds.value, row.employee_id as number])
  try {
    await syncPositionSalary([row.employee_id as number])
    ElMessage.success(`${row.name} 底薪已更新為 $${(row.standard_salary as number).toLocaleString()}`)
    await fetchCompare()
  } catch {
    ElMessage.error('同步失敗')
  } finally {
    const s = new Set(syncingIds.value)
    s.delete(row.employee_id as number)
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

onMounted(() => {
  fetchPositionSalary()
  fetchCompare()
})
</script>

<template>
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
          <el-table-column label="園內職務" prop="position" width="96" />
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
</template>

<style scoped>
.section-title {
  font-size: var(--text-lg);
  font-weight: bold;
  margin: var(--space-5) 0 10px 0;
  color: var(--neutral-300);
  padding-bottom: 6px;
  border-bottom: 1px solid var(--el-border-color-lighter);
}
.box-card {
  background-color: var(--el-fill-color-light);
  border: 1px solid var(--el-border-color-lighter);
}
.label {
  margin-bottom: 5px;
  font-size: var(--text-base);
  color: var(--text-tertiary);
}
.desc-text {
  font-size: var(--text-sm);
  color: var(--text-tertiary);
  line-height: 1.6;
  margin-bottom: 15px;
}
.mt-4 { margin-top: var(--space-4); }
/* .mb-4（用於上方 el-row）在原檔亦無對應規則定義，屬既有 dead class 引用，
   拆分時保留原樣不新增，避免引入視覺差異 */
</style>
