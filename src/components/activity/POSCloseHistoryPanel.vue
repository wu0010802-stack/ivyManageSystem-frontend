<template>
  <div v-if="count > 0" class="pos-close-history" v-loading="loading">
    <el-collapse class="pos-close-history__collapse">
      <el-collapse-item name="history">
        <template #title>
          <span class="pos-close-history__title">歷史快照 ({{ count }})</span>
        </template>

        <div
          v-for="(snap, idx) in snapshots"
          :key="snap.id"
          class="pos-close-history__entry"
        >
          <div class="pos-close-history__round">
            第 {{ snapshots.length - idx }} 輪簽核（後被解鎖）
          </div>

          <div class="pos-close-history__cols">
            <!-- 左欄：簽核當時的帳 -->
            <div class="pos-close-history__col">
              <div class="pos-close-history__col-head">簽核當時的帳</div>
              <div class="pos-approval__info-row">
                <span>簽核時間</span>
                <strong>{{ formatDateTimeTW(snap.approved_at) }}</strong>
              </div>
              <div class="pos-approval__info-row">
                <span>簽核人</span>
                <strong>
                  {{ snap.approver_username || '—' }}
                  <em v-if="snap.approver_role">（{{ snap.approver_role }}）</em>
                </strong>
              </div>

              <div class="pos-close-history__stats">
                <div class="pos-close-history__stat">
                  <span>收款</span><strong>{{ formatTWD(snap.payment_total) }}</strong>
                </div>
                <div class="pos-close-history__stat">
                  <span>退款</span><strong>{{ formatTWD(snap.refund_total) }}</strong>
                </div>
                <div class="pos-close-history__stat">
                  <span>淨額</span><strong>{{ formatTWD(snap.net_total) }}</strong>
                </div>
                <div class="pos-close-history__stat">
                  <span>筆數</span><strong>{{ snap.transaction_count }}</strong>
                </div>
              </div>

              <div v-if="methodEntries(snap).length" class="pos-close-history__methods">
                <span
                  v-for="[method, amount] in methodEntries(snap)"
                  :key="method"
                  class="pos-close-history__method-tag"
                >
                  {{ method }} · {{ formatTWD(amount) }}
                </span>
              </div>

              <div v-if="snap.actual_cash_count != null" class="pos-approval__info-row">
                <span>實際現金盤點</span>
                <strong>{{ formatTWD(snap.actual_cash_count) }}</strong>
              </div>
              <div
                v-if="snap.cash_variance != null"
                class="pos-approval__info-row"
                :class="{ 'pos-approval__info-row--danger': snap.cash_variance !== 0 }"
              >
                <span>現金差異</span>
                <strong>
                  {{ snap.cash_variance > 0 ? '+' : '' }}{{ formatTWD(snap.cash_variance) }}
                </strong>
              </div>
              <div v-if="snap.approve_note" class="pos-approval__info-row">
                <span>簽核備註</span>
                <em>{{ snap.approve_note }}</em>
              </div>
            </div>

            <!-- 右欄：解鎖資訊（4-eye 稽核關鍵） -->
            <div class="pos-close-history__col">
              <div class="pos-close-history__col-head">
                解鎖資訊
                <el-tag v-if="snap.is_admin_override" type="danger" size="small">
                  Admin Override
                </el-tag>
              </div>
              <div class="pos-approval__info-row">
                <span>解鎖時間</span>
                <strong>{{ formatDateTimeTW(snap.unlocked_at) }}</strong>
              </div>
              <div class="pos-approval__info-row">
                <span>解鎖人</span>
                <strong>
                  {{ snap.unlocked_by || '—' }}
                  <em v-if="snap.unlocked_by_role">（{{ snap.unlocked_by_role }}）</em>
                </strong>
              </div>
              <div class="pos-close-history__reason-label">解鎖原因</div>
              <div class="pos-close-history__reason">{{ snap.unlock_reason || '—' }}</div>
            </div>
          </div>

          <!-- 上一輪 → 這一輪的帳變動：把只在解鎖當下彈一次的 live_diff 變成可回溯歷史 -->
          <div v-if="deltaOf(idx)" class="pos-close-history__delta">
            上一輪 → 這一輪帳變動：
            <span>收款 {{ signedTWD(deltaOf(idx)!.payment) }}</span>
            <span>淨額 {{ signedTWD(deltaOf(idx)!.net) }}</span>
            <span>筆數 {{ signedNum(deltaOf(idx)!.count) }}</span>
          </div>
        </div>
      </el-collapse-item>
    </el-collapse>
  </div>
</template>

<script setup lang="ts">
/**
 * POS 日結歷史快照（spec H3 / 2026-08-14 審查 P3-14）。
 *
 * 一天可能被解鎖重簽多次，但畫面上原本完全看不出來——解鎖當下的 live_diff 只彈
 * 一次就消失。本面板把每次 unlock 前的完整快照攤開：左欄是「簽核當時的帳長什麼
 * 樣」、右欄是解鎖人與 unlock_reason（4-eye 稽核的關鍵欄），並算出相鄰兩輪的帳
 * 變動，讓事後稽核有跡可循。
 *
 * count === 0（絕大多數日子）時整塊不渲染，避免正常日多出一塊空白。
 */
import { ref, watch } from 'vue'

import { getPOSCloseHistory } from '@/api/activity'
import { formatTWD } from '@/constants/pos'
import { formatDateTimeTW } from '@/utils/format'

interface CloseSnapshot {
  id: number
  close_date: string
  approved_at?: string | null
  approver_username?: string | null
  approver_role?: string | null
  payment_total: number
  refund_total: number
  net_total: number
  transaction_count: number
  by_method: Record<string, number>
  actual_cash_count?: number | null
  cash_variance?: number | null
  approve_note?: string | null
  unlocked_at?: string | null
  unlocked_by?: string | null
  unlocked_by_role?: string | null
  is_admin_override: boolean
  unlock_reason?: string | null
}

const props = defineProps<{ closeDate: string }>()
const emit = defineEmits<{ 'update:count': [number] }>()

const snapshots = ref<CloseSnapshot[]>([])
const count = ref(0)
const loading = ref(false)

// 亂序回應守衛：快速切換日期時，舊日期的慢回應不得覆寫新日期的快照列表。
let reqSeq = 0

function methodEntries(snap: CloseSnapshot): [string, number][] {
  return (Object.entries(snap.by_method || {}) as [string, number][]).sort(
    (a, b) => a[0].localeCompare(b[0]),
  )
}

const signedNum = (n: number) => (n > 0 ? `+${n}` : `${n}`)
const signedTWD = (n: number) => (n > 0 ? `+${formatTWD(n)}` : formatTWD(n))

// snapshots 依 unlocked_at 倒序：idx 為較新一輪，idx + 1 為上一輪。
function deltaOf(idx: number): { payment: number; net: number; count: number } | null {
  const cur = snapshots.value[idx]
  const prev = snapshots.value[idx + 1]
  if (!cur || !prev) return null
  const delta = {
    payment: cur.payment_total - prev.payment_total,
    net: cur.net_total - prev.net_total,
    count: cur.transaction_count - prev.transaction_count,
  }
  if (delta.payment === 0 && delta.net === 0 && delta.count === 0) return null
  return delta
}

async function load() {
  if (!props.closeDate) {
    snapshots.value = []
    count.value = 0
    emit('update:count', 0)
    return
  }
  const seq = ++reqSeq
  loading.value = true
  try {
    const res = await getPOSCloseHistory(props.closeDate)
    if (seq !== reqSeq) return
    const data = res.data as { count?: number; snapshots?: CloseSnapshot[] }
    snapshots.value = data?.snapshots || []
    count.value = data?.count ?? snapshots.value.length
    emit('update:count', count.value)
  } catch {
    if (seq !== reqSeq) return
    // 歷史快照屬輔助稽核資訊，讀取失敗不打斷簽核主流程，只安靜收斂為「無紀錄」。
    snapshots.value = []
    count.value = 0
    emit('update:count', 0)
  } finally {
    if (seq === reqSeq) loading.value = false
  }
}

watch(() => props.closeDate, load, { immediate: true })
</script>

<style scoped>
.pos-close-history {
  margin-top: 4px;
}

.pos-close-history__title {
  font-weight: 600;
  font-size: 13px;
  color: var(--neutral-600);
}

.pos-close-history__entry {
  border: 1px solid var(--border-color);
  border-radius: 8px;
  padding: 10px 12px;
  margin-bottom: 10px;
}

.pos-close-history__round {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-secondary);
  margin-bottom: 6px;
}

.pos-close-history__cols {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}

.pos-close-history__col-head {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  font-weight: 600;
  color: var(--text-secondary);
  margin-bottom: 4px;
}

.pos-close-history__stats {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 4px 12px;
  margin: 6px 0;
}

.pos-close-history__stat {
  display: flex;
  justify-content: space-between;
  font-size: 13px;
  color: var(--neutral-600);
}

.pos-close-history__methods {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
  font-size: 12px;
  color: var(--text-secondary);
  margin-bottom: 6px;
}

.pos-close-history__method-tag {
  background: var(--bg-color-soft);
  padding: 2px 8px;
  border-radius: 999px;
}

.pos-approval__info-row {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  font-size: 13px;
  color: var(--neutral-600);
}

.pos-approval__info-row em {
  font-style: normal;
  color: var(--text-secondary);
}

/* 差異列強調字走 *-darker（a11y.css 的 html.dark 已翻成亮階）。*-hover 是互動態
   token、dark 刻意未覆寫，當文字色用在深色底只有 2.5–3.6:1（P3-10）。守衛見
   __tests__/POSDarkContrast.test.ts。 */
.pos-approval__info-row--danger strong {
  color: var(--color-danger-darker);
}

.pos-close-history__reason-label {
  font-size: 12px;
  color: var(--text-secondary);
  margin-top: 6px;
}

.pos-close-history__reason {
  white-space: pre-wrap;
  font-size: 13px;
  color: var(--neutral-600);
  background: var(--bg-color-soft);
  border-radius: 6px;
  padding: 6px 8px;
  margin-top: 2px;
}

.pos-close-history__delta {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  font-size: 12px;
  color: var(--text-secondary);
  border-top: 1px dashed var(--border-color);
  padding-top: 6px;
  margin-top: 8px;
}

@media (max-width: 1000px) {
  .pos-close-history__cols {
    grid-template-columns: 1fr;
  }
}
</style>
