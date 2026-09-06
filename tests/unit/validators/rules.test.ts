import { describe, expect, it } from 'vitest'
import type { FormItemRule } from 'element-plus'
import { email, idNumber, money, phone, required } from '@/validators/rules'

type Validator = (rule: unknown, value: unknown, cb: (err?: Error) => void) => void
function runValidator(rule: FormItemRule, value: unknown): string | null {
  let out: string | null = null
  ;(rule.validator as Validator)(rule, value, (err) => { out = err ? err.message : null })
  return out
}

describe('validators/rules 文案與規則', () => {
  it('required：輸入類「請輸入{label}」、選擇類「請選擇{label}」', () => {
    expect(required('課程名稱')).toMatchObject({ required: true, message: '請輸入課程名稱', trigger: 'blur' })
    expect(required('年級', { kind: 'select' })).toMatchObject({ required: true, message: '請選擇年級', trigger: 'change' })
  })

  it('phone：空值放行、09 開頭十碼通過、其他拒絕', () => {
    const r = phone()
    expect(runValidator(r, '')).toBeNull()
    expect(runValidator(r, '0912345678')).toBeNull()
    expect(runValidator(r, '02-12345678')).toBe('手機格式應為 09 開頭共 10 碼')
  })

  it('phone：改用 normalizeMobile，句點分隔的手機號碼也通過', () => {
    expect(runValidator(phone(), '0912.345.678')).toBeNull()
  })

  it('email：格式錯誤拒絕', () => {
    expect(runValidator(email(), 'a@b.c')).toBeNull()
    expect(runValidator(email(), 'nope')).toBe('Email 格式不正確')
  })

  it('idNumber：身分證與居留證通過、亂碼拒絕', () => {
    expect(runValidator(idNumber(), 'A123456789')).toBeNull()
    expect(runValidator(idNumber(), 'AB12345678')).toBeNull()
    expect(runValidator(idNumber(), '1234')).toBe('身分證／居留證字號格式不正確')
  })

  it('money：低於 min 拒絕、null 放行（必填交給 required）', () => {
    const r = money({ min: 0 })
    expect(runValidator(r, null)).toBeNull()
    expect(runValidator(r, 100)).toBeNull()
    expect(runValidator(r, -1)).toBe('請輸入 0 以上的金額')
  })
})
