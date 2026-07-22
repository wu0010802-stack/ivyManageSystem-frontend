<script setup lang="ts">
/**
 * ScoringRulesPanel — 24 規則卡（依性質分五組：考勤/招生/才藝/懲處/加分）+ 切換生效日 + 開編輯 dialog / 歷史 drawer
 *
 * 對應 Task 18 規格：
 * - 24 個 ScoreItemCode 各一張卡，依 ITEM_DOMAIN_GROUPS 分組顯示，顯示當前生效規則摘要
 * - 切換生效日重抓 listScoringRules
 * - 點 [編輯] 開 RuleEditorDialog（建立新版規則）
 * - 點 [歷史] 開 RuleHistoryDrawer（Task 19 實作完整版）
 */
import { ref, computed, onMounted } from 'vue'
import { todayISO } from '@/utils/format'
import { ElMessage } from 'element-plus'
import { Refresh, Edit, Clock } from '@element-plus/icons-vue'

import { listScoringRules } from '@/api/appraisal'
import { apiError } from '@/utils/error'
import { hasPermission } from '@/utils/auth'
import ReadonlyBadge from '@/components/common/ReadonlyBadge.vue'
import { summarizeRuleOneLine } from '../ruleSummary'
import {
  ITEM_CODE_LABELS,
  AUTO_ITEM_CODES as AUTO_CODES,
  ITEM_DOMAIN_GROUPS,
} from '@/views/appraisal/scoreItemLabels'
import RuleEditorDialog from './RuleEditorDialog.vue'
import RuleHistoryDrawer from './RuleHistoryDrawer.vue'

// P0-A：規則編輯由後端 APPRAISAL_RULE_WRITE 守衛，UI 對齊。
const canEditRules = computed(() => hasPermission('APPRAISAL_RULE_WRITE'))

const effectiveOn = ref(todayISO())

interface ScoringRule {
  item_code?: string
  rule_type?: string
  rule_config?: Record<string, unknown>
  effective_from?: string
  notes?: string
  [key: string]: unknown
}

// P1-12：effective_on 不可選過去日期（規則只能往前生效）。
// disabled-date callback 接 Date 物件，回 true 表示禁用。
function disablePastDates(d: Date | null) {
  if (!d) return false
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  return d < today
}
const rules = ref<ScoringRule[]>([])
const loading = ref(false)

const editingItemCode = ref<string | null>(null)
const editingExistingRule = ref<ScoringRule | null>(null)
const editorVisible = ref(false)

const historyItemCode = ref<string | null>(null)
const historyVisible = ref(false)

const rulesByCode = computed(() => {
  const m: Record<string, ScoringRule> = {}
  for (const r of rules.value) if (r.item_code) m[r.item_code] = r
  return m
})

async function load() {
  loading.value = true
  try {
    const res = await listScoringRules(effectiveOn.value)
    rules.value = (res.data || []) as ScoringRule[]
  } catch (e) {
    ElMessage.error(apiError(e, '載入規則失敗'))
  } finally {
    loading.value = false
  }
}

function openEditor(itemCode: string) {
  editingItemCode.value = itemCode
  editingExistingRule.value = rulesByCode.value[itemCode] || null
  editorVisible.value = true
}

function openHistory(itemCode: string) {
  historyItemCode.value = itemCode
  historyVisible.value = true
}

function onRuleCreated() {
  editorVisible.value = false
  load()
}

onMounted(load)

defineExpose({ load, disablePastDates })
</script>

<template>
  <div class="rules-panel">
    <ReadonlyBadge permission-label="考核規則設定" :show="!canEditRules" />
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

    <div v-loading="loading" data-test="rules-grid">
      <div
        v-for="g in ITEM_DOMAIN_GROUPS"
        :key="g.domain"
        class="rule-domain-group"
        :data-test="`rule-domain-group-${g.domain}`"
      >
        <h4 class="rule-domain-group__title">{{ g.domain }}</h4>
        <div class="rules-grid">
          <div
            v-for="code in g.codes"
            :key="code"
            class="rule-card"
            :data-test="`rule-card-${code}`"
          >
            <div class="rule-card__header">
              <span class="rule-card__label">{{ (ITEM_CODE_LABELS as Record<string, string>)[code] }}</span>
              <el-tag
                size="small"
                :type="AUTO_CODES.has(code) ? 'success' : 'info'"
                :data-test="`rule-tag-${code}`"
              >
                {{ AUTO_CODES.has(code) ? 'auto' : 'manual' }}
              </el-tag>
            </div>
            <div class="rule-card__body" :data-test="`rule-summary-${code}`">
              {{ summarizeRuleOneLine(rulesByCode[code]) }}
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
  gap: var(--space-4);
  padding: var(--space-4);
}
.toolbar {
  display: flex;
  gap: var(--space-3);
  align-items: center;
}
.rule-domain-group + .rule-domain-group {
  margin-top: var(--space-4);
}
.rule-domain-group__title {
  margin: 0 0 var(--space-2);
  font-size: var(--text-sm);
  font-weight: 600;
  color: var(--text-secondary);
}
.rules-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  gap: var(--space-3);
}
.rule-card {
  border: 1px solid var(--el-border-color);
  border-radius: 8px;
  padding: var(--space-3);
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
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
  gap: var(--space-2);
}
</style>
