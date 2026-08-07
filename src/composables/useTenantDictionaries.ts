/**
 * per-tenant 字典（frontend-core §2.10 階段 A、contracts CT-FIX-09 / P32b）。
 *
 * ## 問題
 *
 * `src/constants/employee.ts` 硬編了兩組字典：
 *   - `TITLE_TO_GRADE`      職稱 → 節慶獎金職等（A/B/C）
 *   - `POSITION_SALARY_KEY` 職稱 → `position_salary_configs` 的欄位 key
 *
 * 它們決定的是**寫入型**行為（員工表單依此帶出職等與標準底薪）。多租戶下 B 校的
 * `job_titles` 與義華不同 → 查無鍵 → 職等空白、薪資欄位算成空。這是資料正確性缺陷，
 * 不是顯示問題（scan-frontend GAP-04）。
 *
 * ## 做法
 *
 * 權威來源改成後端 `GET /api/config/position-mapping`（per-tenant，依該租戶的
 * `job_titles.bonus_grade` 與 `position_salary_configs` 實際可用欄位推導，與
 * `services/salary/engine.py::_resolve_standard_base` 同口徑）。前端兩組常數**降級為
 * fallback**：API 尚未載入完成或失敗時沿用，行為與改造前相同（單租戶下兩者等價）。
 *
 * ## 為什麼不用 `useCachedAsync`
 *
 * `useCachedAsync` 綁 `onUnmounted`，只能在元件 setup 內呼叫；但 `employeeDisplay.ts`
 * 是**純同步 util**（表格 render 期呼叫），拿不到 async 值。因此改用 module-level
 * 快取 + 同步 getter，並掛 `onAdminSessionReset` 讓登入/登出/代操作/acting tenant
 * 切換時一併失效（`advanceAdminSession()` 是那條失效鏈的單一入口，CT-A-06）。
 */
import { computed, ref, type ComputedRef, type Ref } from 'vue'
import { getPositionMapping } from '@/api/config'
import { POSITION_SALARY_KEY, TITLE_TO_GRADE } from '@/constants/employee'
import { onAdminSessionReset } from '@/utils/adminSession'

interface PositionMapping {
  title_to_grade: Record<string, string>
  position_salary_key: Record<string, string>
}

let _mapping: PositionMapping | null = null
let _inflight: Promise<PositionMapping | null> | null = null
const _loaded = ref(false)
const _failed = ref(false)

// acting tenant / 身分切換 → 字典必須跟著換（A 校的職稱表不能留在 B 校畫面上）。
onAdminSessionReset(() => {
  _mapping = null
  _inflight = null
  _loaded.value = false
  _failed.value = false
})

function normalize(raw: unknown): PositionMapping | null {
  if (!raw || typeof raw !== 'object') return null
  const obj = raw as Record<string, unknown>
  const pick = (key: string): Record<string, string> => {
    const v = obj[key]
    if (!v || typeof v !== 'object') return {}
    const out: Record<string, string> = {}
    for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
      if (typeof val === 'string' && val) out[k] = val
    }
    return out
  }
  return { title_to_grade: pick('title_to_grade'), position_salary_key: pick('position_salary_key') }
}

/** 載入 per-tenant 對照（併發共用同一個 inflight）。失敗只記旗標，不 throw。 */
export function loadPositionMapping(): Promise<PositionMapping | null> {
  if (_mapping) return Promise.resolve(_mapping)
  if (_inflight) return _inflight
  _inflight = getPositionMapping()
    .then((res) => {
      const parsed = normalize((res as { data?: unknown }).data)
      if (parsed) {
        _mapping = parsed
        _loaded.value = true
        _failed.value = false
      } else {
        _failed.value = true
      }
      return _mapping
    })
    .catch(() => {
      // 401/403/網路失敗一律退 fallback 常數——寧可用改造前的值，也不要讓員工表單
      // 整個算不出職等（那會讓使用者以為「這個人沒有職等」而手動填錯）。
      _failed.value = true
      return null
    })
    .finally(() => {
      _inflight = null
    })
  return _inflight
}

/**
 * 職稱 → 職等（A/B/C）。**同步**：尚未載入 / 載入失敗時回 `TITLE_TO_GRADE` 常數。
 * 供 `employeeDisplay.ts` 等純 util 使用。
 */
export function getTitleToGrade(): Record<string, string> {
  return _mapping?.title_to_grade ?? (TITLE_TO_GRADE as Record<string, string>)
}

/**
 * 職稱 → `position_salary_configs` 欄位 key。**同步**：尚未載入 / 失敗時回
 * `POSITION_SALARY_KEY` 常數。
 */
export function getPositionSalaryKey(): Record<string, string> {
  return _mapping?.position_salary_key ?? (POSITION_SALARY_KEY as Record<string, string>)
}

export interface UseTenantDictionariesReturn {
  /** API 值已就緒（false 表示目前用的是 fallback 常數）。 */
  loaded: Ref<boolean>
  /** API 失敗（已退 fallback）。UI 可據此提示「職等/建議薪資可能不準」。 */
  failed: Ref<boolean>
  titleToGrade: ComputedRef<Record<string, string>>
  positionSalaryKey: ComputedRef<Record<string, string>>
  reload: () => Promise<unknown>
}

/**
 * 元件用入口：mount 時觸發載入，回傳響應式對照表。
 * 多個元件同時呼叫只會發一次請求（module-level inflight 共用）。
 */
export function useTenantDictionaries(): UseTenantDictionariesReturn {
  loadPositionMapping().catch(() => {})
  return {
    loaded: _loaded,
    failed: _failed,
    // 顯式讀一次 _loaded 建立依賴，讓 API 回來後 computed 會重算。
    // `_mapping` 刻意是普通變數而非 ref：同步 getter（employeeDisplay 那條純 util
    // 路徑）也要讀得到，包成 ref 會逼那條路徑變 async。
    titleToGrade: computed(() => {
      void _loaded.value
      return getTitleToGrade()
    }),
    positionSalaryKey: computed(() => {
      void _loaded.value
      return getPositionSalaryKey()
    }),
    reload: () => {
      _mapping = null
      _loaded.value = false
      return loadPositionMapping()
    },
  }
}

/** 測試專用：清掉 module-level 快取。 */
export function _resetTenantDictionariesForTests(): void {
  _mapping = null
  _inflight = null
  _loaded.value = false
  _failed.value = false
}
