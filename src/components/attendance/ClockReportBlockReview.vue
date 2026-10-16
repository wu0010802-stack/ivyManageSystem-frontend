<script setup lang="ts">
/**
 * ClockReportBlockReview — 打卡鐘報表中「只能推估日期」的區塊人工確認
 *
 * 報表把留白格直接省略，系統只能依欄位位置推算每一格是哪一天；這裡並排顯示報表原文與
 * 推估結果，由行政對照後逐塊勾選「對應正確」。未確認的區塊，該員工整月都不會匯入。
 * 推估日期不對時可改到同區塊的另一天（2026-10-16，後端重驗限定在原區塊範圍內）；
 * 修正由父層保存（moves），重新預覽後才套用到匯入列。
 */
import { computed } from 'vue'
import type { ApiResponse } from '@/api/_generated/typed'

type Block = NonNullable<ApiResponse<'/attendance/upload/preview-clock-report', 'post'>['blocks']>[number]

/** 區塊代號 → { 原推估日期: 改成的日期 } */
export type BlockDateMoves = Record<string, Record<string, string>>

const props = defineProps<{
  blocks: Block[]
  confirmed: Set<string>
  moves?: BlockDateMoves
  disabled?: boolean
  dirty?: boolean
}>()

const emit = defineEmits<{
  (e: 'toggle', blockId: string, checked: boolean): void
  (e: 'move', blockId: string, from: string, to: string): void
  (e: 'reapply'): void
}>()

const DAY_LABEL_RE = /(\d\d) ([一二三四五六日])/g

/** 區塊日期列上屬於報表月份的每一天（跨進下個月的格子不屬於這份報表，略過）。 */
function blockDays(block: Block): { value: string, label: string }[] {
  const month = block.proposals[0]?.date.slice(0, 7)
  if (!month) return []
  return [...block.date_line.matchAll(DAY_LABEL_RE)]
    .filter(([, day]) => Number(day) >= block.first_day)
    .map(([, day, weekday]) => ({ value: `${month}-${day}`, label: `${month.slice(5)}/${day}（${weekday}）` }))
}

function effectiveDate(block: Block, date: string): string {
  return props.moves?.[block.block_id]?.[date] ?? date
}

/** 同區塊其他推估格已佔用的日期（以修正後的日期計）。 */
function takenByOthers(block: Block, date: string): Set<string> {
  return new Set(block.proposals.filter(p => p.date !== date).map(p => effectiveDate(block, p.date)))
}

function onMove(block: Block, from: string, event: Event) {
  emit('move', block.block_id, from, (event.target as HTMLSelectElement).value)
}

const LAYOUT_LABEL: Record<Block['layout'], string> = {
  interleaved: '每天兩個欄位',
  grid: '依欄位位置推算（有留白格）',
}

const pendingCount = computed(() => props.blocks.filter(block => !props.confirmed.has(block.block_id)).length)

function onToggle(blockId: string, event: Event) {
  emit('toggle', blockId, (event.target as HTMLInputElement).checked)
}
</script>

<template>
  <section class="clock-block-review" aria-label="推估區塊確認">
    <h4>推估區塊確認（{{ blocks.length }} 個）</h4>
    <p class="clock-block-review__note">
      這些區塊的報表有留白格或兩個欄位並排，日期是系統依欄位位置推算的。請對照原文確認每一天都對得上；
      日期不對可直接改到同區塊的其他天。未確認的區塊，該員工整月都不會匯入。
    </p>
    <article v-for="block in blocks" :key="block.block_id" class="clock-block-review__block" :data-block-id="block.block_id">
      <header>
        <strong>{{ block.source_name }}</strong>
        <span>卡號 {{ block.source_employee_number }} · {{ block.department }} · {{ block.first_day }} 日起 · {{ LAYOUT_LABEL[block.layout] }}</span>
      </header>
      <pre class="clock-block-review__raw" aria-label="報表原文">{{ [block.date_line, ...block.raw_lines].join('\n') }}</pre>
      <table class="clock-block-review__table">
        <caption>推估結果</caption>
        <thead><tr><th>日期</th><th>上班</th><th>下班</th></tr></thead>
        <tbody>
          <tr v-for="proposal in block.proposals" :key="proposal.date">
            <td>
              <select
                :value="effectiveDate(block, proposal.date)"
                :disabled="disabled"
                :aria-label="`${block.source_name} 推估為 ${proposal.date} 的打卡日期`"
                @change="onMove(block, proposal.date, $event)"
              >
                <option
                  v-for="day in blockDays(block)"
                  :key="day.value"
                  :value="day.value"
                  :disabled="takenByOthers(block, proposal.date).has(day.value)"
                >{{ day.label }}</option>
              </select>
              <span v-if="effectiveDate(block, proposal.date) !== proposal.date" class="clock-block-review__moved">已改</span>
            </td>
            <td>{{ proposal.punch_in ?? '缺卡' }}</td><td>{{ proposal.punch_out ?? '缺卡' }}</td>
          </tr>
        </tbody>
      </table>
      <label>
        <input
          type="checkbox"
          :checked="confirmed.has(block.block_id)"
          :disabled="disabled"
          :aria-label="`${block.source_name} ${block.first_day} 日起的推估結果對應正確`"
          @change="onToggle(block.block_id, $event)"
        />
        對應正確
      </label>
    </article>
    <p role="status">
      <template v-if="pendingCount > 0">尚有 {{ pendingCount }} 個區塊未確認；這些員工整月都不會匯入。</template>
      <template v-else>所有區塊皆已確認。</template>
      <template v-if="dirty">確認結果已變更，請重新預覽後再匯入。</template>
    </p>
    <el-button data-reapply :disabled="disabled || !dirty" @click="emit('reapply')">依確認結果重新預覽</el-button>
  </section>
</template>

<style scoped>
.clock-block-review { margin-block: 12px; padding: 12px; border: 1px solid var(--el-color-warning); border-radius: 4px; }
.clock-block-review h4 { margin: 0 0 6px; }
.clock-block-review__note { margin: 0 0 8px; color: var(--el-text-color-secondary, #909399); font-size: 13px; }
.clock-block-review__block { margin-block: 12px; padding-block-end: 12px; border-bottom: 1px solid var(--el-border-color); }
.clock-block-review__block header { display: flex; flex-wrap: wrap; gap: 8px; align-items: baseline; margin-block-end: 6px; }
.clock-block-review__raw { overflow-x: auto; margin: 0 0 8px; padding: 8px; background: var(--el-fill-color-light); font-family: ui-monospace, Menlo, Consolas, monospace; font-size: 12px; line-height: 1.5; }
.clock-block-review__table { border-collapse: collapse; margin-block-end: 8px; font-size: 13px; }
.clock-block-review__table th, .clock-block-review__table td { padding: 4px 12px; text-align: left; border-bottom: 1px solid var(--el-border-color); }
.clock-block-review__table caption { text-align: left; font-size: 12px; color: var(--el-text-color-secondary, #909399); }
.clock-block-review__moved { margin-inline-start: 6px; color: var(--el-color-warning); font-size: 12px; }
</style>
