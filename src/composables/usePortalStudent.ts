/**
 * usePortalStudent — 教職員入口班級學生詳情狀態 + 電話揭露邏輯
 *
 * 隱私規範：
 * - 後端回傳的電話一律遮罩（parent_phone_masked / emergency_contact_phone_masked / guardians[].phone_masked）
 * - 揭露完整電話需呼叫 POST /reveal-phone，後端會在同交易寫 AuditLog
 * - 同一個 phone key 5 分鐘內不重複打 reveal API（節流，避免誤點灌爆 audit；首次仍會打）
 * - 抽屜關閉時呼叫 reset() 清空 revealedPhones，避免資料殘留
 */

import { ref, shallowRef } from 'vue'
import type { ApiResponse } from '@/api/_generated/typed'
import {
  getPortalStudentDetail,
  revealPortalStudentPhone,
} from '@/api/portal'

const REVEAL_THROTTLE_MS = 5 * 60 * 1000 // 5 分鐘

type StudentDetail = ApiResponse<'/portal/students/{student_id}/detail', 'get'>

export function usePortalStudent() {
  const detail = shallowRef<StudentDetail | null>(null)
  const loading = ref(false)
  const error = ref<unknown>(null)
  const isRevealing = ref(false)

  // key: `${studentId}:${target}:${guardianId ?? ''}` -> { phone, revealedAt: number }
  const revealedPhones = ref(new Map())

  const _key = (studentId: unknown, target: string, guardianId: unknown) => (
    `${studentId ?? ''}:${target}:${guardianId ?? ''}`
  )

  // request-sequence guard：快速切換學生時，較舊（慢）的詳情回應可能晚於較新（快）的
  // 到達，若無守衛會用過期學生的資料覆寫畫面。每次載入 ++loadSeq，await 後只有仍是最新
  // 世代的回應才寫入 detail/error/loading。
  let loadSeq = 0
  // 電話快取以 studentId 隔離；另追蹤目前學生與 reveal generation，切換時清空快取
  // 並讓舊學生仍在途的 reveal 回應失效，避免遲到回應污染新學生畫面／稽核狀態。
  let currentStudentId: unknown = null
  let revealGeneration = 0
  let pendingReveals = 0

  function resetRevealState(nextStudentId: unknown) {
    revealGeneration += 1
    pendingReveals = 0
    isRevealing.value = false
    revealedPhones.value = new Map()
    currentStudentId = nextStudentId
  }

  async function loadDetail(studentId: unknown) {
    if (!studentId) return
    if (studentId !== currentStudentId) {
      resetRevealState(studentId)
    }
    const my = ++loadSeq
    loading.value = true
    error.value = null
    try {
      const res = await getPortalStudentDetail(studentId as number)
      if (my !== loadSeq) return // 過期回應：已有更新的載入，丟棄不覆寫
      detail.value = res.data
    } catch (e) {
      if (my !== loadSeq) return // 過期錯誤：不覆寫較新載入的狀態
      error.value = e
      detail.value = null
      throw e
    } finally {
      if (my === loadSeq) loading.value = false
    }
  }

  async function revealPhone({ studentId, target, guardianId = null }: { studentId: unknown; target: string; guardianId?: unknown }) {
    const key = _key(studentId, target, guardianId)
    const cached = revealedPhones.value.get(key)
    const now = Date.now()
    // 節流：5 分鐘內已揭露過 → 沿用快取，不再打 audit
    if (cached && now - cached.revealedAt < REVEAL_THROTTLE_MS) {
      return cached.phone
    }

    const generation = revealGeneration
    pendingReveals += 1
    isRevealing.value = true
    try {
      const res = await revealPortalStudentPhone(studentId as number, {
        target,
        // 後端 RevealPhoneRequest.guardian_id 為 number | null；guardianId 可能是
        // number/string/null，統一收斂成 number | null。
        guardian_id: guardianId == null ? null : Number(guardianId),
      })
      const phone = res.data?.phone
      if (generation !== revealGeneration || studentId !== currentStudentId) return null
      if (phone) {
        const next = new Map(revealedPhones.value)
        next.set(key, { phone, revealedAt: Date.now() })
        revealedPhones.value = next
      }
      return phone
    } finally {
      if (generation === revealGeneration) {
        pendingReveals = Math.max(0, pendingReveals - 1)
        isRevealing.value = pendingReveals > 0
      }
    }
  }

  function getRevealedPhone(target: string, guardianId: unknown = null) {
    if (currentStudentId == null) return null
    return revealedPhones.value.get(_key(currentStudentId, target, guardianId))?.phone ?? null
  }

  function reset() {
    loadSeq += 1
    detail.value = null
    error.value = null
    loading.value = false
    resetRevealState(null)
  }

  return {
    detail,
    loading,
    error,
    isRevealing,
    revealedPhones,
    loadDetail,
    revealPhone,
    getRevealedPhone,
    reset,
  }
}
