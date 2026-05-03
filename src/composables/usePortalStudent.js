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
import {
  getPortalStudentDetail,
  revealPortalStudentPhone,
} from '@/api/portal'

const REVEAL_THROTTLE_MS = 5 * 60 * 1000 // 5 分鐘

export function usePortalStudent() {
  const detail = shallowRef(null)
  const loading = ref(false)
  const error = ref(null)
  const isRevealing = ref(false)

  // key: `${target}:${guardianId ?? ''}` -> { phone, revealedAt: number }
  const revealedPhones = ref(new Map())

  const _key = (target, guardianId) => `${target}:${guardianId ?? ''}`

  async function loadDetail(studentId) {
    if (!studentId) return
    loading.value = true
    error.value = null
    try {
      const res = await getPortalStudentDetail(studentId)
      detail.value = res.data
    } catch (e) {
      error.value = e
      detail.value = null
      throw e
    } finally {
      loading.value = false
    }
  }

  async function revealPhone({ studentId, target, guardianId = null }) {
    const key = _key(target, guardianId)
    const cached = revealedPhones.value.get(key)
    const now = Date.now()
    // 節流：5 分鐘內已揭露過 → 沿用快取，不再打 audit
    if (cached && now - cached.revealedAt < REVEAL_THROTTLE_MS) {
      return cached.phone
    }

    isRevealing.value = true
    try {
      const res = await revealPortalStudentPhone(studentId, {
        target,
        guardian_id: guardianId,
      })
      const phone = res.data?.phone
      if (phone) {
        const next = new Map(revealedPhones.value)
        next.set(key, { phone, revealedAt: Date.now() })
        revealedPhones.value = next
      }
      return phone
    } finally {
      isRevealing.value = false
    }
  }

  function getRevealedPhone(target, guardianId = null) {
    return revealedPhones.value.get(_key(target, guardianId))?.phone ?? null
  }

  function reset() {
    detail.value = null
    error.value = null
    revealedPhones.value = new Map()
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
