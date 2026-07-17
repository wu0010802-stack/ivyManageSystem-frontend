<script setup lang="ts">
// BonusConfigPanel「節慶獎金」tab（2026-07-12 體檢 F2 拆分）：
// 同 OvertimeBonusTab，state 與儲存流程留在父元件 BonusConfigPanel
// （與「超額獎金」tab 共用同一份 bonusConfig / gradeTargets reactive 物件，
// 由父層外部單一「儲存所有薪資設定」按鈕一起送出）。此處僅接 props 直改
// nested 欄位，同一份物件參照會直接反映回父層。
interface FestivalBonusConfig {
  head_teacher_ab: number
  head_teacher_c: number
  assistant_teacher_ab: number
  assistant_teacher_c: number
  principal_festival: number
  director_festival: number
  leader_festival: number
  principal_dividend: number
  director_dividend: number
  leader_dividend: number
  vice_leader_dividend: number
  school_wide_target: number
  enrollment_count_mode: string
  driver_festival: number
  designer_festival: number
  admin_festival: number
  meeting_default_hours: number
  meeting_absence_penalty: number
  art_teacher_festival: number
}

defineProps<{
  bonusConfig: FestivalBonusConfig
  gradeTargets: Record<string, unknown>[]
}>()
</script>

<template>
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
    <el-form-item label="在籍人數模式">
      <el-select v-model="bonusConfig.enrollment_count_mode" style="width: 220px">
        <el-option label="月底快照（預設）" value="month_end" />
        <el-option label="按日加權平均" value="daily_weighted" />
      </el-select>
      <div class="desc-text mt-1">
        節慶/超額獎金的班級與全校在籍人數計法：月底快照＝以該月最後一天在籍為準；
        按日加權＝Σ每日在籍 ÷ 當月天數（學生月中進出按天比例計，1 位小數）。
        已產生的人數快照不受切換影響，重新產生快照後才套用新模式。
      </div>
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

  <!-- 階段 2-B：園規常數（會議與美語/才藝教師獎金）-->
  <el-card class="box-card" shadow="never">
    <template #header><div class="card-header"><span>園規常數</span></div></template>
    <p class="desc-text">園務會議計薪小時、缺席扣款、美語/才藝教師節慶獎金基數。原本寫死於程式碼，現可線上調整。</p>
    <el-row :gutter="20">
      <el-col :span="8">
        <el-form-item>
          <template #label>
            <el-tooltip content="每場園務會議計幾小時加班費（業主實務 2 小時）" placement="top">
              <span>園務會議時數</span>
            </el-tooltip>
          </template>
          <el-input-number
            v-model="bonusConfig.meeting_default_hours"
            :min="0" :max="12" :step="0.5" :precision="1"
            controls-position="right" style="width: 100%"
          />
        </el-form-item>
      </el-col>
      <el-col :span="8">
        <el-form-item>
          <template #label>
            <el-tooltip content="缺席園務會議每次扣節慶獎金金額" placement="top">
              <span>會議缺席扣款</span>
            </el-tooltip>
          </template>
          <el-input-number
            v-model="bonusConfig.meeting_absence_penalty"
            :min="0" :max="10000" :step="50"
            controls-position="right" style="width: 100%"
          />
        </el-form-item>
      </el-col>
      <el-col :span="8">
        <el-form-item>
          <template #label>
            <el-tooltip content="美語/才藝教師節慶獎金基數（A/B/C 等級皆同）" placement="top">
              <span>美師節慶獎金</span>
            </el-tooltip>
          </template>
          <el-input-number
            v-model="bonusConfig.art_teacher_festival"
            :min="0" :step="100"
            controls-position="right" style="width: 100%"
          />
        </el-form-item>
      </el-col>
    </el-row>
  </el-card>
</template>

<style scoped>
.section-title {
  font-size: var(--text-lg);
  font-weight: bold;
  margin: var(--space-5) 0 10px 0;
  color: var(--neutral-300);
  border-left: 4px solid var(--color-info);
  padding-left: 10px;
}
.box-card {
  background-color: var(--el-fill-color-light);
  border: 1px solid var(--el-border-color-lighter);
}
.card-header {
  font-weight: bold;
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
.mb-2 { margin-bottom: var(--space-2, 8px); }
.mb-6 { margin-bottom: var(--space-6); }
</style>
