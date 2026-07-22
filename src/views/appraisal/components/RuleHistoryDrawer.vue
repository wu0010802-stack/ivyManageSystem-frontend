<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'

import { getScoringRuleHistory } from '@/api/appraisal'
import { apiError } from '@/utils/error'
import { summarizeRule } from '../ruleSummary'

interface RuleVersion { id: number; rule_type?: string; rule_config?: Record<string, unknown>; effective_from?: string; notes?: string }

const props = defineProps<{
  visible?: boolean
  itemCode?: string | null
}>()
const emit = defineEmits<{ 'update:visible': [value: boolean] }>()

const drawerVisible = computed({
  get: () => props.visible ?? false,
  set: (v: boolean) => emit('update:visible', v),
})

const versions = ref<RuleVersion[]>([])
const loading = ref(false)

async function load() {
  if (!props.itemCode) return
  loading.value = true
  try {
    const { data } = await getScoringRuleHistory(props.itemCode as string)
    versions.value = data
  } catch (e) {
    ElMessage.error(apiError(e, '載入歷史失敗'))
  } finally {
    loading.value = false
  }
}

watch(() => [props.visible, props.itemCode], ([v]) => { if (v) load() }, { immediate: true })
</script>

<template>
  <el-drawer v-model="drawerVisible" :title="`規則歷史：${itemCode}`" size="40%"
             data-test="rule-history-drawer">
    <el-timeline v-loading="loading">
      <el-timeline-item
        v-for="v in versions" :key="v.id"
        :timestamp="v.effective_from" placement="top"
        :data-test="`history-item-${v.id}`"
      >
        <div class="version">
          <div><strong>{{ v.rule_type }}</strong></div>
          <div class="version__summary" data-test="rule-summary-lines">
            <div v-for="line in summarizeRule(v)" :key="line">{{ line }}</div>
          </div>
          <el-collapse>
            <el-collapse-item title="進階：原始設定 JSON">
              <pre>{{ JSON.stringify(v.rule_config, null, 2) }}</pre>
            </el-collapse-item>
          </el-collapse>
          <div v-if="v.notes" class="notes">備註：{{ v.notes }}</div>
        </div>
      </el-timeline-item>
      <el-empty v-if="!loading && versions.length === 0" description="尚無歷史版本" />
    </el-timeline>
  </el-drawer>
</template>

<style scoped>
.version pre { background: var(--el-fill-color-light); padding: var(--space-2); border-radius: 4px; font-size: 12px; }
.version__summary { font-size: var(--text-sm); color: var(--el-text-color-regular); margin: var(--space-1) 0; }
.notes { color: var(--el-text-color-secondary); font-size: 12px; margin-top: var(--space-1); }
</style>
