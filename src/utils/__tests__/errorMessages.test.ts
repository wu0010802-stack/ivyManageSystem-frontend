import { describe, it, expect } from 'vitest'
import { friendlyError, GENERIC_NEXT_STEP } from '@/utils/errorMessages'

// friendlyError：全站失敗訊息 helper。每則訊息須回答「發生了什麼＋使用者能做什麼」。
describe('friendlyError', () => {
  const httpError = (status: number, data?: unknown) => ({ response: { status, data } })

  it('無 err：動作 + 通用下一步', () => {
    expect(friendlyError('載入請假清單失敗')).toBe(`載入請假清單失敗：${GENERIC_NEXT_STEP}`)
  })

  it('403：無權限存取 + 帳號權限指引', () => {
    const msg = friendlyError('載入員工資料失敗', httpError(403))
    expect(msg).toBe('載入員工資料失敗：無權限存取。請確認帳號權限或聯絡系統管理員')
  })

  it('404：找不到資料 + 重新整理指引', () => {
    const msg = friendlyError('載入學生資料失敗', httpError(404))
    expect(msg).toContain('載入學生資料失敗：找不到對應資料')
    expect(msg).toContain('請重新整理頁面後再試')
  })

  it('422：驗證失敗 + 檢查欄位指引', () => {
    const msg = friendlyError('儲存加班單失敗', httpError(422))
    expect(msg).toContain('儲存加班單失敗：送出的資料未通過驗證')
    expect(msg).toContain('請檢查欄位內容')
  })

  it('409：資料衝突 + 重新整理指引', () => {
    const msg = friendlyError('更新班級失敗', httpError(409))
    expect(msg).toContain('資料已被其他人異動')
  })

  it('5xx：伺服器錯誤 + 稍後重試指引', () => {
    const msg = friendlyError('刪除失敗', httpError(500))
    expect(msg).toContain('刪除失敗：伺服器發生錯誤')
    expect(msg).toContain('請稍後重試')
  })

  it('網路錯誤（無 response）：檢查連線指引', () => {
    const msg = friendlyError('儲存失敗', new Error('boom'))
    expect(msg).toBe('儲存失敗：網路連線異常，請檢查連線後重試')
  })

  it('逾時（ECONNABORTED）：逾時原因 + 稍後重試', () => {
    const msg = friendlyError('匯出報表失敗', { code: 'ECONNABORTED' })
    expect(msg).toContain('伺服器回應逾時')
  })

  it('後端繁中 detail（字串）透傳，含「請」不再補通用下一步', () => {
    const msg = friendlyError('下載失敗', httpError(400, { detail: '本月薪資尚未封存，請先完成結算' }))
    expect(msg).toBe('下載失敗：本月薪資尚未封存，請先完成結算')
  })

  it('後端繁中 detail 無指示語（無「請」）時補通用下一步', () => {
    const msg = friendlyError('送出失敗', httpError(400, { detail: '該學生已報名此課程' }))
    expect(msg).toBe(`送出失敗：該學生已報名此課程。${GENERIC_NEXT_STEP}`)
  })

  it('interceptor displayMessage（繁中業務訊息）優先透傳', () => {
    const err = { displayMessage: '此員工仍有未結算薪資，請先完成結算', response: { status: 400 } }
    expect(friendlyError('刪除員工失敗', err)).toBe('刪除員工失敗：此員工仍有未結算薪資，請先完成結算')
  })

  it('interceptor 通用 fallback 文案不透傳，改走分類路徑（403 給更完整下一步）', () => {
    const err = { displayMessage: '權限不足，無法執行此操作', response: { status: 403 } }
    expect(friendlyError('儲存失敗', err)).toBe('儲存失敗：無權限存取。請確認帳號權限或聯絡系統管理員')
  })

  it('structured detail（{code, message}）取 message', () => {
    const err = httpError(400, { detail: { code: 'X', message: '報名名額已滿，請改選其他場次' } })
    expect(friendlyError('報名失敗', err)).toBe('報名失敗：報名名額已滿，請改選其他場次')
  })

  it('英文技術訊息不直出（走分類 fallback）', () => {
    const err = { message: 'Request failed with status code 500', response: { status: 500, data: { detail: 'Internal Server Error' } } }
    const msg = friendlyError('載入失敗', err)
    expect(msg).not.toContain('Internal Server Error')
    expect(msg).toContain('伺服器發生錯誤')
  })

  it('含 stack frame 樣式的訊息不直出', () => {
    const err = httpError(500, { detail: '錯誤 at foo.js:12 發生例外' })
    expect(friendlyError('載入失敗', err)).toContain('伺服器發生錯誤')
  })

  it('FastAPI 422 陣列 detail 不會被當字串直出', () => {
    const err = httpError(422, { detail: [{ loc: ['body', 'name'], msg: 'field required' }] })
    const msg = friendlyError('儲存失敗', err)
    expect(msg).toContain('送出的資料未通過驗證')
    expect(msg).not.toContain('field required')
  })

  it('detail 已含動作片語時不重複前綴', () => {
    const err = httpError(400, { detail: '儲存失敗：金額不可為負數，請修正後重試' })
    expect(friendlyError('儲存失敗', err)).toBe('儲存失敗：金額不可為負數，請修正後重試')
  })

  it('非 axios error（純物件 / 字串）fallback 分類：無 response 視為網路異常', () => {
    expect(friendlyError('操作失敗', {})).toContain('網路連線異常')
  })

  it('超長後端訊息（> 200 字）不透傳', () => {
    const err = httpError(400, { detail: `錯誤${'很長'.repeat(150)}` })
    const msg = friendlyError('載入失敗', err)
    expect(msg.length).toBeLessThan(120)
  })

  it('訊息不含驚嘆號與 em dash', () => {
    const samples = [
      friendlyError('載入失敗'),
      friendlyError('儲存失敗', httpError(403)),
      friendlyError('刪除失敗', httpError(500)),
      friendlyError('匯出失敗', new Error('x')),
    ]
    for (const s of samples) {
      expect(s).not.toMatch(/[!！—]/)
    }
  })
})
