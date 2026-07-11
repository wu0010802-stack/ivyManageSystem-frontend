import { describe, expect, it } from 'vitest'
import { usePublicRegistrationFlow } from '@/composables/usePublicRegistrationFlow'

describe('usePublicRegistrationFlow', () => {
  it('從寶貝資料依序進到選課與確認，不能跳過未完成步驟', () => {
    const flow = usePublicRegistrationFlow()

    expect(flow.currentStep.value).toBe(1)
    expect(flow.goToStep(3)).toBe(false)

    flow.completeStep(1)
    expect(flow.currentStep.value).toBe(2)
    flow.completeStep(2)
    expect(flow.currentStep.value).toBe(3)
  })

  it('到過的步驟可返回修改，重置後回到第一步', () => {
    const flow = usePublicRegistrationFlow()
    flow.completeStep(1)
    flow.completeStep(2)

    expect(flow.goToStep(1)).toBe(true)
    expect(flow.currentStep.value).toBe(1)
    expect(flow.highestVisitedStep.value).toBe(3)

    flow.resetFlow()
    expect(flow.currentStep.value).toBe(1)
    expect(flow.highestVisitedStep.value).toBe(1)
  })

  it('確認頁驗證失敗時會依錯誤欄位返回可見步驟', () => {
    const flow = usePublicRegistrationFlow()
    flow.completeStep(1)
    flow.completeStep(2)

    expect(flow.goToErrorField('name')).toBe(1)
    expect(flow.currentStep.value).toBe(1)

    expect(flow.goToErrorField('courses')).toBe(2)
    expect(flow.currentStep.value).toBe(2)
  })
})
