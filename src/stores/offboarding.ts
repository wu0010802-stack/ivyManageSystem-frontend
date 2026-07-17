/**
 * src/stores/offboarding.ts
 *
 * 員工離職 Pinia store（setup syntax）
 *
 * 功能：
 * - detail Map cache by employee_id
 * - fetchDetail(id)：cache-aware，有快取直接回傳
 * - refreshDetail(id)：強制 bypass cache
 * - preview(id, payload)：不寫 cache，只回傳預覽結果
 * - process(id, payload)：執行離職流程，成功後清 cache
 * - invalidate(id)：手動清除指定員工快取
 * - getDetail(id)：getter，同步讀快取
 */
import { ref } from 'vue'
import { defineStore } from 'pinia'
import {
  closeOffboarding,
  getOffboardingDetail,
  previewOffboarding,
  processOffboarding,
} from '@/api/offboarding'
import type { ApiBody, ApiResponse } from '@/api/_generated/typed'

export type OffboardingDetail = ApiResponse<'/offboarding/{employee_id}', 'get'>
export type OffboardingPreviewPayload = ApiBody<'/offboarding/{employee_id}/preview', 'post'>
export type OffboardingPreviewResult = ApiResponse<'/offboarding/{employee_id}/preview', 'post'>
export type OffboardingProcessPayload = ApiBody<'/offboarding/{employee_id}/process', 'post'>
export type OffboardingProcessResult = ApiResponse<'/offboarding/{employee_id}/process', 'post'>
export type OffboardingCloseResult = ApiResponse<'/offboarding/{employee_id}/close', 'post'>

export const useOffboardingStore = defineStore('offboarding', () => {
  // Map cache by employee_id
  const cache = ref<Map<number, OffboardingDetail>>(new Map())
  const loading = ref<Map<number, boolean>>(new Map())

  /** 同步讀取快取（無快取回 undefined） */
  function getDetail(id: number): OffboardingDetail | undefined {
    return cache.value.get(id)
  }

  /** 載入離職詳情（cache-aware；有快取直接回傳，不重打 API） */
  async function fetchDetail(id: number): Promise<OffboardingDetail> {
    const cached = cache.value.get(id)
    if (cached !== undefined) return cached
    return _loadDetail(id)
  }

  /** 強制重新載入（bypass cache） */
  async function refreshDetail(id: number): Promise<OffboardingDetail> {
    return _loadDetail(id)
  }

  /** 預覽離職結算（不寫 cache） */
  async function preview(
    id: number,
    payload: OffboardingPreviewPayload,
  ): Promise<OffboardingPreviewResult> {
    const res = await previewOffboarding(id, payload)
    return res.data
  }

  /** 執行離職流程（成功後清除該員工的 cache） */
  async function process(
    id: number,
    payload: OffboardingProcessPayload,
  ): Promise<OffboardingProcessResult> {
    const res = await processOffboarding(id, payload)
    invalidate(id)
    return res.data
  }

  /** 人工結案（成功後清除該員工 cache，呼叫端 refresh 取最新 closed 狀態） */
  async function close(id: number): Promise<OffboardingCloseResult> {
    const res = await closeOffboarding(id)
    invalidate(id)
    return res.data
  }

  /** 清除快取。
   *  - 傳 id：清單一員工。
   *  - 不傳 id：清空整個快取（clearAuth → _resetStores 對 setup store 的零參數重置會走這條；
   *    離職詳情含資遣費 / 離職結算等 HR 財務 PII，共享平板登出必須能整批清乾淨）。 */
  function invalidate(id?: number): void {
    if (id === undefined) {
      cache.value.clear()
      loading.value.clear()
      return
    }
    cache.value.delete(id)
  }

  // --- 內部工具 ---

  async function _loadDetail(id: number): Promise<OffboardingDetail> {
    loading.value.set(id, true)
    try {
      const res = await getOffboardingDetail(id)
      cache.value.set(id, res.data)
      return res.data
    } finally {
      loading.value.delete(id)
    }
  }

  return {
    cache,
    loading,
    getDetail,
    fetchDetail,
    refreshDetail,
    preview,
    process,
    close,
    invalidate,
  }
})
