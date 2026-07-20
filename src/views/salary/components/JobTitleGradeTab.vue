<script setup lang="ts">
// BonusConfigPanel「職稱等級對應」tab（2026-07-12 體檢 F2 拆分，階段 2-D：
// 職稱→節慶獎金等級對應 job_titles.bonus_grade）：與其他 tab 無共用 state，
// 完全自足——自己 fetch / save / onMounted。掛載時機同 StandardSalaryTab，
// 由父層 el-tabs（非 lazy）+ 外層 v-if="canReadSalarySettings" 決定。
import { ref, onMounted } from 'vue'
import { getTitles, updateTitle } from '@/api/config'
import { ElMessage } from 'element-plus'
import { friendlyError } from '@/utils/errorMessages'

const jobTitles = ref<Record<string, unknown>[]>([])
const loadingTitles = ref(false)
const fetchJobTitles = async () => {
  loadingTitles.value = true
  try {
    const res = await getTitles()
    jobTitles.value = res.data
  } catch (e) {
    ElMessage.error(friendlyError('職稱載入失敗', e))
  } finally {
    loadingTitles.value = false
  }
}
const updateTitleGrade = async (title: Record<string, unknown>) => {
  try {
    await updateTitle(title.id as number, { name: title.name, bonus_grade: title.bonus_grade || null })
    ElMessage.success(`${title.name} 等級已更新`)
  } catch (e) {
    ElMessage.error(friendlyError(`更新職稱 ${title.name} 失敗`, e))
    await fetchJobTitles()  // 失敗時重抓還原
  }
}

onMounted(() => {
  fetchJobTitles()
})
</script>

<template>
  <div v-loading="loadingTitles">
    <div class="section-title">職稱 → 節慶獎金等級</div>
    <p class="desc-text">
      設定每個職稱對應的節慶獎金等級（A/B/C），影響班導/副班導獎金基數選擇。
      非帶班職稱（園長、司機、廚工等）留空即可，走主管 / office_staff 路徑不受此影響。
    </p>
    <el-table :data="jobTitles" border>
      <el-table-column prop="name" label="職稱" width="200" />
      <el-table-column label="等級">
        <template #default="scope">
          <el-select
            v-model="scope.row.bonus_grade"
            placeholder="（不設定）"
            clearable
            size="small"
            style="width: 200px;"
            @change="updateTitleGrade(scope.row)"
          >
            <el-option label="A 級（幼兒園教師）" value="A" />
            <el-option label="B 級（教保員）" value="B" />
            <el-option label="C 級（助理教保員）" value="C" />
          </el-select>
        </template>
      </el-table-column>
      <el-table-column label="說明" min-width="240">
        <template #default="scope">
          <span style="color: var(--el-text-color-secondary); font-size: 12px;">
            {{
              scope.row.bonus_grade === 'A' ? 'A 級：班導獎金 2000 / 副班導 1200' :
              scope.row.bonus_grade === 'B' ? 'B 級：班導獎金 2000 / 副班導 1200' :
              scope.row.bonus_grade === 'C' ? 'C 級：班導獎金 1500 / 副班導 1200' :
              '不適用（走主管 / office_staff 路徑）'
            }}
          </span>
        </template>
      </el-table-column>
    </el-table>
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
.desc-text {
  font-size: var(--text-sm);
  color: var(--text-tertiary);
  line-height: 1.6;
  margin-bottom: 15px;
}
</style>
