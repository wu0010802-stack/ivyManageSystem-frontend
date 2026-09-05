import type { FormItemRule } from 'element-plus'
import { TW_MOBILE_RE } from '@/utils/phone'

/**
 * Element Plus FormItemRule 產生器（spec 2026-09-06 §3.3）。
 * 統一必填文案：輸入類「請輸入{label}」、選擇類「請選擇{label}」；
 * 格式類規則對空值放行（必填與否交給 required），避免選填欄位被格式規則卡住。
 */

type Callback = (error?: Error) => void

export function required(
  label: string,
  opts: { kind?: 'input' | 'select'; trigger?: 'blur' | 'change' } = {},
): FormItemRule {
  const kind = opts.kind ?? 'input'
  return {
    required: true,
    message: kind === 'select' ? `請選擇${label}` : `請輸入${label}`,
    trigger: opts.trigger ?? (kind === 'select' ? 'change' : 'blur'),
  }
}

export function phone(label = '手機'): FormItemRule {
  return {
    trigger: 'blur',
    validator: (_rule: unknown, value: unknown, cb: Callback) => {
      if (value == null || value === '') return cb()
      if (TW_MOBILE_RE.test(String(value).replace(/[\s-]/g, ''))) return cb()
      cb(new Error(`${label}格式應為 09 開頭共 10 碼`))
    },
  }
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
export function email(): FormItemRule {
  return {
    trigger: 'blur',
    validator: (_rule: unknown, value: unknown, cb: Callback) => {
      if (value == null || value === '') return cb()
      EMAIL_RE.test(String(value)) ? cb() : cb(new Error('Email 格式不正確'))
    },
  }
}

/** 身分證（1 字母＋9 數字）或新式居留證（2 字母＋8 數字）；只驗格式，不驗檢查碼。 */
const ID_NUMBER_RE = /^[A-Z](?:\d{9}|[A-Z]\d{8})$/
export function idNumber(): FormItemRule {
  return {
    trigger: 'blur',
    validator: (_rule: unknown, value: unknown, cb: Callback) => {
      if (value == null || value === '') return cb()
      ID_NUMBER_RE.test(String(value).toUpperCase()) ? cb() : cb(new Error('身分證／居留證字號格式不正確'))
    },
  }
}

export function money(opts: { min?: number } = {}): FormItemRule {
  const min = opts.min ?? 0
  return {
    trigger: 'change',
    validator: (_rule: unknown, value: unknown, cb: Callback) => {
      if (value == null || value === '') return cb()
      const n = Number(value)
      if (Number.isFinite(n) && n >= min) return cb()
      cb(new Error(`請輸入 ${min} 以上的金額`))
    },
  }
}
