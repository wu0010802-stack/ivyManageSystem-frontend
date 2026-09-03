<template>
  <nav
    v-if="groups.length"
    class="class-rail"
    :aria-label="label"
    data-test="stmt-class-rail"
  >
    <button
      type="button"
      class="rail-all"
      :class="{ 'rail-all--on': !selectedClass && !selectedGrade }"
      :aria-pressed="!selectedClass && !selectedGrade"
      :title="`全部班級　共 ${total} 人・${totalUnpaid ? `${totalUnpaid} 人未收齊` : '已收齊'}`"
      data-test="stmt-class-rail-all"
      @click="emit('select', { cls: null, grade: null })"
    >
      全部<span v-if="showCounts" class="rail-all__n">{{ totalUnpaid }}</span>
    </button>

    <template v-for="g in groups" :key="g.key">
      <span class="rail-sep" aria-hidden="true" />
      <span class="rail-grade">
        <!-- 年段可選只在能一次篩多個班的情境（月表為前端篩選）；逐筆走伺服器
             分頁、classroom_name 只吃單一班名，故降級為純標籤 -->
        <button
          v-if="gradeSelectable"
          type="button"
          class="rail-grade__lbl"
          :class="{ 'rail-grade__lbl--on': isGradeOn(g.key) }"
          :aria-pressed="isGradeOn(g.key)"
          :title="gradeTitle(g)"
          data-test="stmt-class-rail-grade"
          :data-grade="g.key"
          @click="onGrade(g.key)"
        >
          {{ g.label }}<span v-if="showCounts" class="rail-grade__n">{{ g.unpaidCount }}</span>
        </button>
        <span
          v-else
          class="rail-grade__lbl rail-grade__lbl--static"
          data-test="stmt-class-rail-grade-label"
          :data-grade="g.key"
        >
          {{ g.label }}
        </span>
        <button
          v-for="c in g.classes"
          :key="c.name"
          type="button"
          class="rail-cls"
          :class="{ 'rail-cls--on': c.name === selectedClass }"
          :aria-pressed="c.name === selectedClass"
          :title="chipTitle(c)"
          data-test="stmt-class-rail-class"
          :data-classroom="c.name"
          @click="onClass(c)"
        >
          {{ c.label }}
          <template v-if="showCounts">
            <span v-if="c.unpaidCount" class="rail-owe" data-test="rail-owe">
              {{ c.unpaidCount }}
            </span>
            <el-icon v-else class="rail-ok" data-test="rail-ok" aria-hidden="true">
              <Check />
            </el-icon>
          </template>
        </button>
      </span>
    </template>
  </nav>
</template>

<script setup lang="ts">
/**
 * 班級導覽列：把「年段 › 班級」攤在畫面上，取代原本的班級下拉。
 *
 * 為什麼不是下拉：這頁的日常問題是「哪一班還沒收齊」，下拉把答案藏在一次點擊
 * 之後，且班名與未收人數要逐項讀。攤開後未收人數直接標在班名旁，收齊的班標勾號，
 * 一眼掃完 11 個班。（更早之前的 11 顆 chip 版本佔滿一整列才改成下拉——這版用
 * 短 chip ＋年段分組，1440 寬以年段為單位折兩列，不會把同一年段拆開。）
 *
 * 受控元件：選取狀態（班／年段）由父層持有，本元件只 emit。分組資料一律由父層
 * 以 `buildClassGroups` 產出並與表格分組共用，避免兩處算出不同的班級集合。
 */
import { Check } from '@element-plus/icons-vue'
import type { ClassGroup, GradeGroup } from '@/components/fees/feeClassGrouping'

const props = withDefaults(
  defineProps<{
    groups: GradeGroup[]
    /** 範圍內總人數（只進 title，不畫在 chip 上） */
    total?: number
    /** 範圍內未收齊人數（「全部」的計數） */
    totalUnpaid?: number
    /** 選中的班名（月表的 classroom_name），null＝未指定 */
    selectedClass?: string | null
    /** 選中的年段 key，null＝未指定 */
    selectedGrade?: string | null
    /**
     * 是否顯示人數與已收齊標記。逐筆檢視走伺服器分頁、算不出整月未收人數，
     * 顯示會是錯的，故關閉。
     */
    showCounts?: boolean
    /** 年段標籤是否可點選（能一次篩整個年段）。伺服器分頁的消費端請關閉 */
    gradeSelectable?: boolean
    label?: string
  }>(),
  {
    total: 0,
    totalUnpaid: 0,
    selectedClass: null,
    selectedGrade: null,
    showCounts: true,
    gradeSelectable: true,
    label: '班級篩選',
  },
)

const emit = defineEmits<{
  select: [payload: { cls: string | null; grade: string | null }]
}>()

/** 年段標籤只在「選了整個年段」時作用；選了其中一班時作用態在班 chip 上 */
function isGradeOn(key: string): boolean {
  return !props.selectedClass && props.selectedGrade === key
}

function onGrade(key: string) {
  // 已選整個年段 → 取消；選了該年段某一班 → 放大到整個年段
  if (isGradeOn(key)) emit('select', { cls: null, grade: null })
  else emit('select', { cls: null, grade: key })
}

function onClass(c: ClassGroup) {
  if (c.name === props.selectedClass) emit('select', { cls: null, grade: null })
  else emit('select', { cls: c.name, grade: c.gradeLabel || null })
}

/**
 * 三層 chip 上的數字一律是「未收齊人數」——這頁的問題只有一個「誰還沒收」，
 * 混用總人數與未收人數會讓相鄰的數字讀起來像同一種。總人數放 title。
 */
function chipTitle(c: ClassGroup): string {
  const grade = c.gradeLabel ? `（${c.gradeLabel}）` : ''
  const state = c.unpaidCount ? `${c.unpaidCount} 人未收齊` : '已收齊'
  return `${c.label}${grade}　共 ${c.total} 人・${state}`
}

function gradeTitle(g: GradeGroup): string {
  const state = g.unpaidCount ? `${g.unpaidCount} 人未收齊` : '已收齊'
  return `只看${g.label}　共 ${g.total} 人・${state}`
}
</script>

<style scoped>
.class-rail {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: var(--space-1) var(--space-2);
  margin-top: var(--space-3);
  padding: var(--space-2) var(--space-3);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-lg);
  background: var(--surface-color);
}

.rail-all,
.rail-grade__lbl,
.rail-cls {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
  min-height: 30px;
  border: 1px solid transparent;
  border-radius: var(--radius-md);
  background: none;
  font: inherit;
  font-size: var(--text-base);
  cursor: pointer;
  transition: background var(--transition-fast), color var(--transition-fast),
    border-color var(--transition-fast);
}

.rail-all {
  padding: 0 var(--space-3);
  color: var(--text-secondary);
  font-weight: var(--font-weight-medium);
}

.rail-all:hover {
  background: var(--bg-color-soft);
  color: var(--text-primary);
}

/* 深色作用態與次層頁籤同語彙：這是「範圍最大」的一顆，與班級 chip 的淺色作用態分層 */
.rail-all--on,
.rail-all--on:hover {
  background: var(--el-text-color-primary);
  color: var(--el-bg-color);
}

.rail-all__n {
  font-weight: var(--font-weight-regular);
  opacity: 0.75;
}

.rail-sep {
  width: 1px;
  height: 22px;
  background: var(--border-color);
  margin: 0 var(--space-1);
}

.rail-grade {
  display: inline-flex;
  align-items: center;
  gap: var(--space-1);
}

.rail-grade__lbl {
  padding: 0 var(--space-2);
  color: var(--text-tertiary);
  font-size: var(--text-sm);
  font-weight: var(--font-weight-semibold);
}

.rail-grade__lbl:hover {
  background: var(--bg-color-soft);
  color: var(--text-primary);
}

.rail-grade__lbl--on {
  background: var(--color-primary-lighter);
  color: var(--el-color-primary);
}

.rail-grade__lbl--static {
  cursor: default;
}

.rail-grade__n {
  font-weight: var(--font-weight-regular);
  color: var(--text-tertiary);
}

.rail-grade__lbl--on .rail-grade__n {
  color: inherit;
  opacity: 0.75;
}

.rail-cls {
  padding: 0 var(--space-2) 0 var(--space-3);
  border-color: var(--border-color);
  background: var(--surface-color);
  color: var(--text-primary);
}

.rail-cls:hover {
  border-color: var(--text-tertiary);
}

.rail-cls--on,
.rail-cls--on:hover {
  background: var(--color-primary-lighter);
  border-color: var(--color-primary-light);
  color: var(--el-color-primary);
  font-weight: var(--font-weight-semibold);
}

.rail-owe {
  min-width: 18px;
  padding: 0 var(--space-1);
  border-radius: var(--radius-full);
  background: var(--color-danger-soft);
  color: var(--color-danger-darker);
  font-size: var(--text-xs);
  font-weight: var(--font-weight-semibold);
  line-height: 18px;
  text-align: center;
  font-variant-numeric: tabular-nums;
}

.rail-cls--on .rail-owe {
  background: var(--color-danger);
  color: var(--neutral-0);
}

.rail-ok {
  width: 16px;
  height: 16px;
  border-radius: var(--radius-full);
  background: var(--color-success-soft);
  color: var(--color-success-darker);
  font-size: 11px;
}

/* 行動端：導覽列改橫向捲動單列，避免 11 個班佔掉半個螢幕 */
@media (--to-sm) {
  .class-rail {
    flex-wrap: nowrap;
    overflow-x: auto;
    -webkit-overflow-scrolling: touch;
  }

  .rail-all,
  .rail-grade__lbl,
  .rail-cls {
    flex-shrink: 0;
    min-height: var(--touch-target-min);
  }
}
</style>
