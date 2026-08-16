<script setup lang="ts">
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Setting } from '@element-plus/icons-vue'
import { hasPermission } from '@/utils/auth'

interface SectionDef { key: string; label: string; to: string; can: () => boolean }

// V2 IA 簡化（2026-08-16）：六段 segmented（總覽/考核/年終/發放/規則設定/例外中心）
// 收斂為三段（待辦/考核/年終）+ 齒輪。發放併入年終網域（由年終清單/工作區內連結導覽，
// 路由 /appraisal-year-end/year-end/payout 不變）；規則設定改齒輪按鈕（不佔 segmented 名額，
// 路由 /appraisal-year-end/rules 不變）；例外中心併入待辦頁（由待辦頁例外卡導覽，
// 路由 /appraisal-year-end/exceptions 不變）。
const SECTIONS: SectionDef[] = [
  { key: 'todo', label: '待辦', to: '/appraisal-year-end/todo',
    can: () => ['APPRAISAL_READ', 'YEAR_END_READ', 'SETTINGS_READ', 'SALARY_READ', 'APPRAISAL_FINALIZE'].some((p) => hasPermission(p)) },
  { key: 'appraisal', label: '考核', to: '/appraisal-year-end/appraisal', can: () => hasPermission('APPRAISAL_READ') },
  { key: 'year-end', label: '年終', to: '/appraisal-year-end/year-end',
    can: () => hasPermission('YEAR_END_READ') || hasPermission('APPRAISAL_FINALIZE') },
]

const route = useRoute()
const router = useRouter()
const sections = computed(() => SECTIONS.filter((s) => s.can()))
const canRules = computed(() => hasPermission('APPRAISAL_READ') || hasPermission('SETTINGS_READ'))
// payout／規則設定／例外中心不在 SECTIONS 名單內：payout 折算回「年終」高亮，
// rules／exceptions 不特別高亮任何段（'' 不匹配任何 option.value）。
const activeKey = computed(() => {
  if (route.path.startsWith('/appraisal-year-end/year-end/payout')) return 'year-end'
  const seg = route.path.split('/')[2] ?? 'todo'
  if (seg === 'overview') return 'todo'
  if (seg === 'rules' || seg === 'exceptions') return ''
  return seg
})
const segmentedOptions = computed(() => sections.value.map((s) => ({ label: s.label, value: s.key })))
const onSectionChange = (val: string | number) => {
  const target = SECTIONS.find((s) => s.key === String(val))
  if (target && activeKey.value !== target.key) router.push(target.to)
}
const goRules = () => router.push('/appraisal-year-end/rules')

const crumbs = computed(() => {
  const tail = route.matched
    .filter((m) => m.path !== '/appraisal-year-end' && (m.meta?.title || m.meta?.breadcrumb))
    .flatMap((m) => {
      const bc = m.meta?.breadcrumb as string[] | undefined
      if (Array.isArray(bc) && bc.length > 0) return bc.map(String)
      return m.meta?.title ? [String(m.meta.title)] : []
    })
  const extra = (route.meta?.breadcrumbExtra as string | undefined)
  return ['考核與年終', ...tail, ...(extra ? [extra] : [])]
})
</script>

<template>
  <div class="aye-layout">
    <div class="aye-topbar">
      <el-segmented
        v-if="segmentedOptions.length > 0"
        class="aye-nav"
        :model-value="activeKey"
        :options="segmentedOptions"
        size="large"
        @change="onSectionChange"
      />
      <button
        v-if="canRules"
        type="button"
        class="aye-gear"
        aria-label="規則與進階設定"
        title="規則與進階設定"
        @click="goRules"
      >
        <el-icon><Setting /></el-icon>
      </button>
    </div>
    <el-breadcrumb v-if="crumbs.length > 1" class="aye-breadcrumb" separator="›">
      <el-breadcrumb-item v-for="(c, i) in crumbs" :key="i">{{ c }}</el-breadcrumb-item>
    </el-breadcrumb>
    <div class="aye-body">
      <router-view />
    </div>
    <el-empty v-if="segmentedOptions.length === 0" description="無權限檢視此頁" />
  </div>
</template>

<style scoped>
.aye-layout { padding: var(--space-5); }
.aye-topbar { display: flex; align-items: center; gap: var(--space-3); margin-bottom: var(--space-3); }
.aye-nav { flex: 0 0 auto; }
.aye-gear {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  border-radius: var(--radius-md, 8px);
  border: 1px solid var(--el-border-color);
  background: var(--el-bg-color);
  color: var(--el-text-color-regular);
  cursor: pointer;
  transition: border-color 150ms, color 150ms;
}
.aye-gear:hover { border-color: var(--el-color-primary); color: var(--el-color-primary); }
.aye-gear:focus-visible { outline: 2px solid var(--el-color-primary); outline-offset: 2px; }
.aye-breadcrumb { margin-bottom: var(--space-4); }
</style>
