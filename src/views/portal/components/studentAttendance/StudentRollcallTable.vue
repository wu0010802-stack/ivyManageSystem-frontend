<script setup lang="ts">
/**
 * 到園點名名冊（2026-09-14 UI/UX 審查改版）。
 *
 * 三件事變了：
 * 1. **未點名是第一級狀態**。改版前 view 把 `status=null` 預選成「出席」，27 列
 *    一進頁全部亮著同一種藍，「誰還沒點」在畫面上不存在。現在未點名不選中任何
 *    按鈕、列加黃底與「未點」徽章。
 * 2. **狀態語意色**。改版前選中一律 primary 藍，只有缺席有黃底；病假／事假／遲到
 *    選中後與出席列外觀完全相同，掃例外要逐列讀字。
 * 3. **移除「未點名者缺席」批次鈕**。後端每筆轉缺席都會排程家長 LINE 通知
 *    （api/portal/student_attendance.batch_save_class_attendance），一鍵全班缺席
 *    等於同時推播全班家長；整班不到是停課，不是點名情境。才藝課程點名 09-14 已
 *    因同一理由移除「全部缺席」。
 *
 * 控制項改用 el-button-group（與 components/activity/AttendanceMarkControl.vue 同
 * 範式）而非 el-radio-group：radio 的選中態一律 primary，語意色得覆寫 EP 內部
 * class 才做得到；button 的 type 本來就吃語意色，且 null 不會被任何元件改寫。
 */
import { reactive, computed } from 'vue'
import {
  ROLLCALL_STATUSES,
  isUnmarked,
  parseRollcallRemark,
  composeRollcallRemark,
} from '@/utils/studentRollcall'

interface RollcallStudent {
  student_id?: number
  student_no?: string
  name?: string
  status?: string | null
  remark?: string | null
  [key: string]: unknown
}

const props = defineProps<{
  students: RollcallStudent[]
  loading?: boolean
  disabled?: boolean
  /** 全班未點名人數（不是篩選後的），供批次按鈕顯示與停用判斷 */
  pendingCount?: number
  /** 篩選或搜尋後結果為空時的說明，與「這班沒有學生」區分 */
  emptyHint?: string
}>()

const emit = defineEmits<{
  'update-status': [payload: { student_id: number | undefined; status: string; remark: string }]
  'quick-set-all': [status: string]
}>()

type ButtonType = '' | 'primary' | 'success' | 'warning' | 'danger' | 'info'

/** 狀態 → el-button type。遲到用 primary：與出席（success）拉開，又不像缺席那麼重。 */
const STATUS_TYPE: Record<string, ButtonType> = {
  出席: 'success',
  缺席: 'danger',
  病假: 'warning',
  事假: 'warning',
  遲到: 'primary',
}

const pending = computed(() => props.pendingCount ?? 0)

function rowTone(student: RollcallStudent): string {
  if (isUnmarked(student)) return 'is-unmarked'
  if (student.status === '出席') return 'is-present'
  if (student.status === '缺席') return 'is-absent'
  if (student.status === '遲到') return 'is-late'
  return 'is-leave'
}

// 手動點開備註的學生（老師自己寫過備註者自動視為展開）
const openedRemarks = reactive(new Set<number | string>())
function rowKey(student: RollcallStudent): number | string {
  return student.student_id ?? student.student_no ?? ''
}
function isRemarkOpen(student: RollcallStudent): boolean {
  if (parseRollcallRemark(student.remark).text) return true
  return openedRemarks.has(rowKey(student))
}
function openRemark(student: RollcallStudent) {
  openedRemarks.add(rowKey(student))
}

function onPick(student: RollcallStudent, status: string) {
  if (props.disabled) return
  // 重複點已選中的狀態也要 emit：那代表老師確認過這一列（例如家長請假已帶成病假，
  // 老師再點一次病假表示「我看過了」）。父頁據此把它移出未點名集合。
  emit('update-status', {
    student_id: student.student_id,
    status,
    remark: student.remark || '',
  })
}

function onRemarkChange(student: RollcallStudent, value: string) {
  emit('update-status', {
    student_id: student.student_id,
    status: student.status ?? '',
    remark: composeRollcallRemark(student.remark, value),
  })
}
</script>

<template>
  <div class="rollcall-table" v-loading="loading ?? false">
    <div v-if="!students.length" class="empty-state">
      {{ emptyHint || '尚無學生' }}
    </div>

    <template v-else>
      <div class="rollcall-actions">
        <el-button
          size="small"
          type="success"
          plain
          :disabled="disabled || pending === 0"
          @click="emit('quick-set-all', '出席')"
        >
          未點名者全部出席（{{ pending }}）
        </el-button>
      </div>

      <div class="student-list">
        <div
          v-for="s in students"
          :key="s.student_id"
          class="student-row"
          :class="rowTone(s)"
        >
          <div class="student-row__who">
            <span class="student-name">{{ s.name }}</span>
            <span class="student-no">{{ s.student_no }}</span>
            <span v-if="isUnmarked(s)" class="badge badge--unmarked">未點</span>
            <span v-if="parseRollcallRemark(s.remark).fromParentLeave" class="badge badge--leave">
              家長請假
            </span>
            <span v-if="s.status === '缺席'" class="notify-hint">會即時通知家長</span>
            <el-button
              v-if="!isRemarkOpen(s)"
              link
              type="primary"
              class="remark-toggle"
              :aria-label="`為 ${s.name} 加備註`"
              @click="openRemark(s)"
            >
              加備註
            </el-button>
          </div>

          <el-button-group
            class="status-group"
            role="group"
            :aria-label="`${s.name} 的出缺席`"
          >
            <el-button
              v-for="opt in ROLLCALL_STATUSES"
              :key="opt"
              class="status-btn"
              :type="s.status === opt ? (STATUS_TYPE[opt] ?? '') : ''"
              :disabled="disabled"
              :aria-pressed="s.status === opt"
              :aria-label="`${s.name}：${opt}`"
              @click="onPick(s, opt)"
            >
              {{ opt }}
            </el-button>
          </el-button-group>

          <!-- 備註預設收起：一班 27 人時常駐輸入框會讓整頁長到 9,000px 以上，
               而備註是例外才填的東西。老師寫過或點開才展開；家長請假的前綴不進
               輸入框（改用 chip 顯示），送出時由 composeRollcallRemark 接回去。 -->
          <el-input
            v-if="isRemarkOpen(s)"
            :model-value="parseRollcallRemark(s.remark).text"
            :disabled="disabled"
            placeholder="備註（選填）"
            size="small"
            class="remark-input"
            clearable
            @update:model-value="onRemarkChange(s, $event)"
          />
        </div>
      </div>
    </template>
  </div>
</template>

<style scoped>
.rollcall-table {
  display: flex;
  flex-direction: column;
  gap: var(--space-2, 8px);
}

.rollcall-actions {
  display: flex;
  gap: var(--space-2, 8px);
  margin-bottom: var(--space-2, 8px);
  flex-wrap: wrap;
}

.student-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.student-row {
  display: flex;
  gap: var(--space-2, 8px);
  align-items: center;
  padding: 6px var(--space-3, 12px);
  background: var(--el-bg-color);
  border: 1px solid var(--el-border-color);
  border-radius: var(--radius-md, 8px);
  flex-wrap: wrap;
}

.student-row__who {
  display: flex;
  align-items: center;
  gap: var(--space-2, 8px);
  flex: 1;
  min-width: 0;
  flex-wrap: wrap;
}

/* 未點名：整列淡黃，掃一眼就知道還剩誰。已點名的列維持白底，不搶注意力。 */
.student-row.is-unmarked {
  background: var(--color-warning-soft);
}

.student-name {
  font-weight: 600;
  color: var(--el-text-color-primary);
}

.student-no {
  font-size: var(--text-xs, 12px);
  color: var(--el-text-color-secondary);
  font-variant-numeric: tabular-nums;
}

.badge {
  font-size: var(--text-xs, 12px);
  font-weight: 600;
  padding: 1px 8px;
  border-radius: 999px;
  white-space: nowrap;
}

.badge--unmarked {
  border: 1px solid var(--color-warning);
  color: var(--color-warning);
}

.badge--leave {
  background: var(--color-info-soft, #e0f2fe);
  color: var(--color-info-darker);
}

.notify-hint {
  font-size: var(--text-xs, 12px);
  color: var(--color-danger);
  white-space: nowrap;
}

.remark-toggle {
  font-size: var(--text-sm, 13px);
}

.remark-input {
  flex: 1 1 100%;
  min-width: 0;
}

.status-group {
  display: inline-flex;
  flex-shrink: 0;
}

/* 桌機原本是 22px 高的 radio-button，低於最小點擊目標。 */
.status-btn {
  min-height: 30px;
  padding: 4px 10px;
}

.empty-state {
  text-align: center;
  padding: var(--space-6, 24px);
  color: var(--el-text-color-secondary);
}

/* 窄幕：姓名列與五格狀態各一行，卡片高度從改版前的 146px 收到約 100px
 * （學號、姓名、按鈕、加備註原本各佔一行，一屏只放得下 3 個人）。
 * 五格等寬 44px 保留——幼兒園病假事假常見，收進「其他」會讓常用動作變兩步。 */
@media (max-width: 600px) {
  .student-row {
    align-items: stretch;
    padding: var(--space-2, 8px) var(--space-3, 12px);
  }

  /* 父層是 flex row wrap：只給 width:100% 不會換行，status-group 會接在姓名列
   * 後面用剩下的寬度排五格，第五格「遲到」被擠到第二行（實測列高 135px、一屏
   * 只剩 2 人）。要 flex-basis:100% 才真的各自獨佔一行。 */
  .student-row__who {
    flex: 1 1 100%;
  }

  /* ⚠ 這裡不能用 grid 平分五格：el-button-group 帶 ::before/::after clearfix
   * （display:table），在 grid 容器裡會各自佔掉一個 cell，五顆按鈕被推成 4+1
   * 兩行（實測列高 135px、一屏只剩 2 人）。改用 flex + 等分 basis，偽元素寬度
   * 為 0 不佔位。 */
  .status-group {
    flex: 1 1 100%;
    display: flex;
    width: 100%;
  }

  .status-btn {
    flex: 1 1 0;
    width: auto;
    min-width: 0;
    min-height: var(--touch-target-min, 44px);
    padding: 8px 2px;
    font-size: var(--text-xs, 12px);
  }

  .remark-input {
    width: 100%;
  }
}
</style>
