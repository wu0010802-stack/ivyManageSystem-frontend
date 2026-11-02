import { describe, it, expect } from 'vitest'
import { validationFieldMessage } from '@/utils/error'

// day-qa F11（2026-11-02）：PIN 2580 被後端以常見弱碼 422 擋下，畫面只顯示「設定失敗，請重試」
describe('validationFieldMessage', () => {
  const pin422 = {
    response: {
      status: 422,
      data: {
        detail: [
          {
            type: 'value_error',
            loc: ['body', 'pin'],
            msg: 'Value error, PIN 過於簡單：屬常見弱碼，請改用其他數字組合',
            input: '2580',
          },
        ],
      },
    },
  }

  it('取出指定欄位的後端驗證訊息並去掉 pydantic 前綴', () => {
    expect(validationFieldMessage(pin422, 'pin')).toBe('PIN 過於簡單：屬常見弱碼，請改用其他數字組合')
  })

  it('其他欄位、非陣列 detail、非 axios 錯誤一律回 null（交給通用訊息）', () => {
    expect(validationFieldMessage(pin422, 'name')).toBeNull()
    expect(validationFieldMessage({ response: { data: { detail: '找不到員工' } } }, 'pin')).toBeNull()
    expect(validationFieldMessage(new Error('Network Error'), 'pin')).toBeNull()
    expect(validationFieldMessage(null, 'pin')).toBeNull()
  })
})
