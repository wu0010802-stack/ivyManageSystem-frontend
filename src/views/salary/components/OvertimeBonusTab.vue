<script setup lang="ts">
// BonusConfigPanel「超額獎金」tab（2026-07-12 體檢 F2 拆分）：
// 純呈現元件，state（bonusConfig / gradeTargets）與儲存流程仍在父元件
// BonusConfigPanel，因為兩者與「節慶獎金」tab 共用同一份 reactive 物件、
// 且透過父層外部單一「儲存所有薪資設定」按鈕一起送出（見父元件
// saveAllBonusSettings）。此處僅接 props 並直接改 nested 欄位——父層
// bonusConfig 為 reactive()，同一份物件參照，子層修改欄位會直接反映回父層，
// 不需要 emit。
interface OvertimeBonusConfig {
  overtime_head_normal: number
  overtime_head_baby: number
  overtime_assistant_normal: number
  overtime_assistant_baby: number
}

defineProps<{
  bonusConfig: OvertimeBonusConfig
  gradeTargets: Record<string, unknown>[]
}>()
</script>

<template>
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
.config-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--space-5);
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
.mt-6 { margin-top: var(--space-6); }
</style>
