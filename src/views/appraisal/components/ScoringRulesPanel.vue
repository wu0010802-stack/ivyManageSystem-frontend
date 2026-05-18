<script setup>
/**
 * ScoringRulesPanel — 14 規則卡 + 切換生效日 + 開編輯 dialog / 歷史 drawer
 *
 * 對應 Task 18 規格：
 * - 14 個 ScoreItemCode 各一張卡，顯示當前生效規則摘要
 * - 切換生效日重抓 listScoringRules
 * - 點 [編輯] 開 RuleEditorDialog（建立新版規則）
 * - 點 [歷史] 開 RuleHistoryDrawer（Task 19 實作完整版）
 */
import { ref, computed, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import { Refresh, Edit, Clock } from '@element-plus/icons-vue'

import { listScoringRules } from '@/api/appraisal'
import { apiError } from '@/utils/error'
import { hasPermission } from '@/utils/auth'
import {
  ITEM_CODE_LABELS,
  AUTO_ITEM_CODES as AUTO_CODES,
} from '@/views/appraisal/scoreItemLabels'
import RuleEditorDialog from './RuleEditorDialog.vue'
import RuleHistoryDrawer from './RuleHistoryDrawer.vue'

// P0-A：規則編輯由後端 APPRAISAL_RULE_WRITE 守衛，UI 對齊。
const canEditRules = computed(() => hasPermission('APPRAISAL_RULE_WRITE'))

const effectiveOn = ref(new Date().toISOString().slice(0, 10))

// P1-12：effective_on 不可選過去日期（規則只能往前生效）。
// disabled-date callback 接 Date 物件，回 true 表示禁用。
function disablePastDates(d) {
  if (!d) return false
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  return d < today
}
const rules = ref([])
const loading = ref(false)

const editingItemCode = ref(null)
const editingExistingRule = ref(null)
const editorVisible = ref(false)

const historyItemCode = ref(null)
const historyVisible = ref(false)

const rulesByCode = computed(() => {
  const m = {}
  for (const r of rules.value) m[r.item_code] = r
  return m
})

const itemCodes = Object.keys(ITEM_CODE_LABELS)

async function load() {
  loading.value = true
  try {
    const res = await listScoringRules(effectiveOn.value)
    rules.value = res.data || []
  } catch (e) {
    ElMessage.error(apiError(e, '載入規則失敗'))
  } finally {
    loading.value = false
  }
}

function openEditor(itemCode) {
  editingItemCode.value = itemCode
  editingExistingRule.value = rulesByCode.value[itemCode] || null
  editorVisible.value = true
}

function openHistory(itemCode) {
  historyItemCode.value = itemCode
  historyVisible.value = true
}

function onRuleCreated() {
  editorVisible.value = false
  load()
}

function fmtRuleSummary(rule) {
  if (!rule) return '尚未設定'
  if (rule.rule_type === 'PER_UNIT') {
    return `每次 ${rule.rule_config.per_unit_delta} 分`
  }
  if (rule.rule_type === 'TIER') {
    const n = Array.isArray(rule.rule_config.tiers) ? rule.rule_config.tiers.length : 0
    return `階梯式（${n} 階）`
  }
  if (rule.rule_type === 'FLAT_THRESHOLD') {
    const c = rule.rule_config
    return `≥${c.threshold} → ${c.above_delta} / <${c.threshold} → ${c.below_delta}`
  }
  if (rule.rule_type === 'DISCIPLINARY_TIERED') {
    const c = rule.rule_config
    return `警告 ${c.warning_delta} / 小過 ${c.minor_delta} / 大過 ${c.major_delta}`
  }
  return ''
}

onMounted(load)

defineExpose({ load, disablePastDates })
</script>

<template>
  <div class="rules-panel">
    <div class="toolbar">
      <el-form-item label="生效日期">
        <el-date-picker
          v-model="effectiveOn"
          value-format="YYYY-MM-DD"
          :disabled-date="disablePastDates"
          @change="load"
          data-test="effective-on-picker"
        />
      </el-form-item>
      <el-button
        :icon="Refresh"
        :loading="loading"
        data-test="refresh-btn"
        @click="load"
      >
        重新整理
      </el-button>
    </div>

    <div v-loading="loading" class="rules-grid" data-test="rules-grid">
      <div
        v-for="code in itemCodes"
        :key="code"
        class="rule-card"
        :data-test="`rule-card-${code}`"
      >
        <div class="rule-card__header">
          <span class="rule-card__label">{{ ITEM_CODE_LABELS[code] }}</span>
          <el-tag
            size="small"
            :type="AUTO_CODES.has(code) ? 'success' : 'info'"
            :data-test="`rule-tag-${code}`"
          >
            {{ AUTO_CODES.has(code) ? 'auto' : 'manual' }}
          </el-tag>
        </div>
        <div class="rule-card__body" :data-test="`rule-summary-${code}`">
          {{ fmtRuleSummary(rulesByCode[code]) }}
        </div>
        <div class="rule-card__actions">
          <el-button
            v-if="canEditRules"
            size="small"
            :icon="Edit"
            :data-test="`edit-btn-${code}`"
            @click="openEditor(code)"
          >
            編輯
          </el-button>
          <el-button
            size="small"
            text
            :icon="Clock"
            :data-test="`history-btn-${code}`"
            @click="openHistory(code)"
          >
            歷史
          </el-button>
        </div>
      </div>
    </div>

    <RuleEditorDialog
      v-model:visible="editorVisible"
      :item-code="editingItemCode"
      :existing-rule="editingExistingRule"
      @created="onRuleCreated"
    />

    <RuleHistoryDrawer
      v-model:visible="historyVisible"
      :item-code="historyItemCode"
    />
  </div>
</template>

<style scoped>
.rules-panel {
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 16px;
}
.toolbar {
  display: flex;
  gap: 12px;
  align-items: center;
}
.rules-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  gap: 12px;
}
.rule-card {
  border: 1px solid var(--el-border-color);
  border-radius: 8px;
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  background: var(--el-bg-color);
}
.rule-card__header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.rule-card__label {
  font-weight: 600;
}
.rule-card__body {
  color: var(--el-text-color-regular);
  font-size: 13px;
  min-height: 20px;
}
.rule-card__actions {
  display: flex;
  gap: 8px;
}
</style>
