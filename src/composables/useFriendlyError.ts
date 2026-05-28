/**
 * useFriendlyError — 將 axios error 轉成 friendly error（message + nextStep + level）。
 *
 * 使用場景：家長端「需要 user 採取下一步」的 catch 區塊（如綁定錯誤、聯絡簿存取
 * 失敗、DSR 請求失敗）。簡單 transient error 仍可用 toast。
 *
 * 對應規範：
 *   - 後端 BusinessError envelope: { detail: { code, message, request_id, ... } }
 *   - parent/api/index.ts interceptor 已展開：error.errorDetail = obj (含 code)
 *   - 已知 code → 用 ERROR_CODE_REGISTRY 提供的 friendly message + nextStep
 *   - 未知 code 或無 envelope → fallback 到 error.displayMessage（interceptor 已 normalize）
 *
 * 設計刻意保留 useXxx 命名以維持 composable 慣例，但內部無 reactive state；
 * caller 自己決定 error 要存進 ref 還是直接顯示。
 */

import { ERROR_CODE_REGISTRY, type FriendlyError } from '@/utils/errorCodeRegistry'

interface ApiErrorShape {
  displayMessage?: string | null
  errorDetail?: unknown
}

const GENERIC_FALLBACK: FriendlyError = {
  message: '發生未預期的錯誤，請稍後再試',
  level: 'error',
}

function _extractCodeAndMessage(detail: unknown): { code?: string; message?: string } {
  if (!detail || typeof detail !== 'object') return {}
  const obj = detail as Record<string, unknown>
  const code = typeof obj.code === 'string' ? obj.code : undefined
  const message = typeof obj.message === 'string' ? obj.message : undefined
  return { code, message }
}

export function useFriendlyError() {
  function getFriendly(error: unknown): FriendlyError {
    if (!error || typeof error !== 'object') return GENERIC_FALLBACK

    const e = error as ApiErrorShape
    const { code, message: detailMessage } = _extractCodeAndMessage(e.errorDetail)

    if (code && ERROR_CODE_REGISTRY[code]) {
      const registry = ERROR_CODE_REGISTRY[code]
      return {
        // 優先用後端傳來的 message（可能因情境客製），無則用 registry 預設
        message: detailMessage || registry.message,
        nextStep: registry.nextStep,
        level: registry.level,
      }
    }

    // 未知 code（含 envelope 無 code、HTTPException 純字串 detail）→ fallback
    const displayMessage = typeof e.displayMessage === 'string' ? e.displayMessage : ''
    if (displayMessage) {
      return { message: displayMessage, level: 'error' }
    }
    return GENERIC_FALLBACK
  }

  return { getFriendly }
}
