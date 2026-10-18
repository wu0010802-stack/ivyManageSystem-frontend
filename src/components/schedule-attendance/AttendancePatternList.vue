<template>
  <div class="pattern-list" data-test="pattern-list">
    <p class="pattern-list__intro">
      這幾位整個月都是同一種情形，多半是設定或卡號對照的問題，不是每天各自出了狀況。先把設定修好，這些格子會一起消失，不必逐格豁免。
    </p>

    <section v-if="noPunches.length" class="pattern-list__section" data-test="pattern-section-no_punches" aria-labelledby="pattern-no-punches">
      <h3 id="pattern-no-punches">本月幾乎沒有打卡（{{ noPunches.length }} 人）</h3>
      <p class="pattern-list__consequence">正職員工不處理的話，算薪時這些天會算曠職扣款。</p>
      <ul class="pattern-list__items">
        <li v-for="p in noPunches" :key="p.employeeId" class="pattern-list__item" :data-test="`pattern-${p.employeeId}`">
          <p class="pattern-list__who">
            <strong>{{ p.name }}</strong>
            <span v-if="p.roleLabel" class="pattern-list__role">{{ p.roleLabel }}</span>
            <span class="pattern-list__count">待處理 {{ p.issueCount }} 格</span>
          </p>
          <p class="pattern-list__fact">{{ patternSummary(p) }}</p>
          <p class="pattern-list__hint">{{ p.notInImport ? NOT_IN_IMPORT_HINT : FEW_PUNCHES_HINT }}</p>
          <div class="pattern-list__actions">
            <el-button :data-test="`pattern-records-${p.employeeId}`" @click="emit('records', p.employeeId, p.firstDate)">看他整月</el-button>
            <el-button v-if="canImport && p.notInImport" :data-test="`pattern-import-${p.employeeId}`" @click="emit('import')">匯入打卡</el-button>
            <router-link v-if="canViewEmployees" :to="`/employees/${p.employeeId}`" class="pattern-list__link" :data-test="`pattern-employee-${p.employeeId}`">員工資料</router-link>
          </div>
        </li>
      </ul>
    </section>

    <section v-if="offsets.length" class="pattern-list__section" data-test="pattern-section-fixed_offset" aria-labelledby="pattern-fixed-offset">
      <h3 id="pattern-fixed-offset">每天固定遲到或早退（{{ offsets.length }} 人）</h3>
      <p class="pattern-list__consequence">到員工資料按「編輯」改上下班時間或員工類型後，要重新匯入本月打卡，遲到、早退的扣款才會照新時段重算。</p>
      <ul class="pattern-list__items">
        <li v-for="p in offsets" :key="p.employeeId" class="pattern-list__item" :data-test="`pattern-${p.employeeId}`">
          <p class="pattern-list__who">
            <strong>{{ p.name }}</strong>
            <span v-if="p.roleLabel" class="pattern-list__role">{{ p.roleLabel }}</span>
            <span class="pattern-list__count">待處理 {{ p.issueCount }} 格</span>
          </p>
          <p class="pattern-list__fact">{{ patternSummary(p) }}</p>
          <p class="pattern-list__fact">實際多在 {{ p.typicalIn }} 上班、{{ p.typicalOut }} 下班；系統認定的應上班時段是 {{ p.planWindow }}。</p>
          <p class="pattern-list__hint">多半是應上班時段設錯，或這位員工是半天班、時薪制。</p>
          <div class="pattern-list__actions">
            <el-button :data-test="`pattern-records-${p.employeeId}`" @click="emit('records', p.employeeId, p.firstDate)">看他整月</el-button>
            <router-link v-if="canViewEmployees" :to="`/employees/${p.employeeId}`" class="pattern-list__link" :data-test="`pattern-employee-${p.employeeId}`">員工資料</router-link>
          </div>
        </li>
      </ul>
    </section>
  </div>
</template>

<script setup lang="ts">
/** 本月設定檢查清單（型態判斷見 utils/attendancePatterns）：只提示與連到該去的地方，不在這裡改資料。 */
import { computed } from 'vue'
import { hasPermission } from '@/utils/auth'
import { patternSummary, type AttendancePattern, type FixedOffsetPattern, type NoPunchPattern } from '@/utils/attendancePatterns'

const props = defineProps<{ patterns: AttendancePattern[] }>()
const emit = defineEmits<{
  /** 看這個人的整月出勤（帶第一個應上班日） */
  records: [employeeId: number, date: string]
  /** 開匯入打卡（重新匯入時在卡號對照把人對上） */
  import: []
}>()

const NOT_IN_IMPORT_HINT = '多半是打卡機卡號還沒對照到這位員工：重新匯入打卡檔時，在卡號對照把卡號對到這位員工。若這位員工本來就不用打卡，這些天要補登或請假。'
const FEW_PUNCHES_HINT = '多半是卡號對照到別人、這位員工不用打卡，或請假還沒登打。'

const canImport = hasPermission('ATTENDANCE_WRITE')
const canViewEmployees = hasPermission('EMPLOYEES_READ')

const noPunches = computed(() => props.patterns.filter((p): p is NoPunchPattern => p.kind === 'no_punches'))
const offsets = computed(() => props.patterns.filter((p): p is FixedOffsetPattern => p.kind === 'fixed_offset'))
</script>

<style scoped>
.pattern-list { display: grid; gap: var(--space-5); }
.pattern-list p { margin: 0; }
.pattern-list__intro { color: var(--el-text-color-regular); font-size: var(--text-sm); line-height: 1.6; }
.pattern-list__section h3 { margin: 0 0 var(--space-1); font-size: var(--text-base); }
.pattern-list .pattern-list__consequence { margin-bottom: var(--space-2); color: var(--color-warning-darker); font-size: var(--text-sm); }
.pattern-list__items { display: grid; margin: 0; padding: 0; list-style: none; }
.pattern-list__item { display: grid; gap: var(--space-1); padding: var(--space-3) 0; border-top: 1px solid var(--el-border-color-lighter); }
.pattern-list__who { display: flex; flex-wrap: wrap; align-items: baseline; gap: 0 var(--space-2); }
.pattern-list__role { color: var(--el-text-color-secondary); font-size: var(--text-xs); }
.pattern-list__count { margin-left: auto; color: var(--el-text-color-secondary); font-size: var(--text-sm); font-variant-numeric: tabular-nums; }
.pattern-list__fact { font-size: var(--text-sm); }
.pattern-list__hint { color: var(--el-text-color-secondary); font-size: var(--text-sm); }
.pattern-list__actions { display: flex; flex-wrap: wrap; align-items: center; gap: var(--space-2) var(--space-3); margin-top: var(--space-1); }
.pattern-list__actions .el-button { margin-left: 0; }
.pattern-list__link { color: var(--el-color-primary); font-size: var(--text-sm); text-decoration: none; }
.pattern-list__link:hover { text-decoration: underline; }
.pattern-list__link:focus-visible { outline: 2px solid var(--el-color-primary); outline-offset: 2px; }
</style>
