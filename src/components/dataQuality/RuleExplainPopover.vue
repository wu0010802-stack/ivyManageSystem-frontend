<template>
  <el-popover placement="right" :width="360" trigger="click">
    <template #reference>
      <button type="button" class="rule-trigger" :aria-label="`查看規則說明：${meta.label}`">
        <span class="rule-label">{{ meta.label }}</span>
        <el-icon class="rule-icon"><QuestionFilled /></el-icon>
      </button>
    </template>

    <div class="rule-explain">
      <h4 class="rule-explain__title">{{ meta.label }}</h4>

      <dl class="rule-explain__body">
        <dt>這是什麼</dt>
        <dd>{{ meta.what }}</dd>

        <dt>放著不管會怎樣</dt>
        <dd>{{ meta.impact }}</dd>

        <dt>怎麼修</dt>
        <dd>{{ meta.howToFix }}</dd>
      </dl>

      <p v-if="!meta.selfServiceable" class="rule-explain__note">
        此類問題無法在本頁自行修正，需工程人員處理。
      </p>
      <p class="rule-explain__note rule-explain__note--muted">
        本頁的「確認 / 標記已修正 / 忽略」只記錄處理狀態，不會自動更動資料。
      </p>

      <code class="rule-explain__code">{{ ruleCode }}</code>
    </div>
  </el-popover>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { QuestionFilled } from '@element-plus/icons-vue'

import { getRuleMeta } from '@/constants/dataQualityRules'

const props = defineProps<{ ruleCode: string }>()

const meta = computed(() => getRuleMeta(props.ruleCode))
</script>

<style scoped>
.rule-trigger {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 0;
  border: none;
  background: none;
  font: inherit;
  color: inherit;
  text-align: left;
  cursor: pointer;
}
.rule-trigger:hover .rule-label,
.rule-trigger:focus-visible .rule-label {
  text-decoration: underline;
}
.rule-icon {
  color: var(--el-color-info);
  flex-shrink: 0;
}
.rule-explain__title {
  margin: 0 0 12px;
  font-size: 15px;
}
.rule-explain__body {
  margin: 0;
}
.rule-explain__body dt {
  font-size: 12px;
  font-weight: 600;
  color: var(--el-text-color-secondary);
  margin-bottom: 2px;
}
.rule-explain__body dd {
  margin: 0 0 10px;
  font-size: 13px;
  line-height: 1.6;
}
.rule-explain__note {
  margin: 0 0 6px;
  font-size: 12px;
  line-height: 1.5;
  color: var(--el-color-warning);
}
.rule-explain__note--muted {
  color: var(--el-text-color-secondary);
}
.rule-explain__code {
  display: block;
  margin-top: 10px;
  font-size: 11px;
  color: var(--el-text-color-placeholder);
}
</style>
