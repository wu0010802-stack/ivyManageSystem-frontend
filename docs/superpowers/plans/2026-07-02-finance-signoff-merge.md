# 收支簽收整合（廠商付款 × 雜項收款 合併單頁）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把「廠商付款簽收」與「雜項收款簽收」兩個近乎複製貼上的前端功能合併為單一頁面 `/finance-signoffs`（頁內 tab 切換），以 config 驅動的共用元件消除 ~1400 行重複碼；後端零改動。

**Architecture:** 新建 `SignoffPanel.vue`（一套完整面板：KPI/篩選/列表/表單 dialog）與 `SignoffSignDialog.vue`（簽名板），由 `src/config/signoffModules.ts` 的兩份 `SignoffModuleConfig`（vendor / misc）注入 api 函式、鏡像欄位映射、類別欄設定、權限碼與文案。`FinanceSignoffView.vue` 為薄 tab 容器，依權限決定可見 tab 並雙向同步 `?tab` query。舊路由改 redirect 保留深連結。

**Tech Stack:** Vue 3 `<script setup lang="ts">`、Element Plus、vue-router 4（hash 模式）、Vitest + @vue/test-utils（happy-dom）。

**Spec:** `docs/superpowers/specs/2026-07-02-finance-signoff-merge-design.md`

## Global Constraints

- **純前端**：不改 ivy-backend、不跑 OpenAPI codegen、不動 `src/api/index.ts` axios wrapper。
- **TS-only**：新檔一律 `.ts` / `<script setup lang="ts">`；禁 `: any` / `as any`（ESLint `no-explicit-any` blocking）；新測試檔用 `.ts`。
- **Commit**：Conventional Commits、繁體中文、一個 commit 一件事；訊息結尾加 `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`。
- **Gate**：每個 task 結束前該 task 的測試綠；最終 `npm test` + `npm run typecheck` + `npm run lint` 全綠（`cd ~/Desktop/ivy-frontend` 下執行）。
- **CSS class 前綴**：新共用元件一律 `so-`（SignoffPanel）/ `fs-`（FinanceSignoffView）；不得殘留 `vp-` / `mr-`。
- **文案**：共用元件內不得硬編任何 vendor/misc 特定字樣（「廠商」「繳款方」「付款」「收款」等），一律走 config `texts`。
- **分支**：在 `~/Desktop/ivy-frontend` 開 feature 分支 `feat/finance-signoff-merge`（從目前 local main），完成後由整合流程決定 merge。共用 checkout：每次 commit 前先 `git branch --show-current` 確認在 feature 分支上。
- 後端欄位名對照（config 的 `fields.*.key` 必須逐字一致）：vendor = `vendor_name` / `payment_date` / `invoice_number`；misc = `payer_name` / `receipt_date` / `receipt_number`；共通 = `amount` / `payment_method` / `description` / `notes` / `status` / `category`（misc 限定）。

---

### Task 0: 開分支

**Files:** 無（git 操作）

- [ ] **Step 1: 確認乾淨並開分支**

```bash
cd ~/Desktop/ivy-frontend
git status --porcelain        # 預期：空（若有平行 session WIP，停下回報，不要動別人的檔案）
git checkout -b feat/finance-signoff-merge
```

---

### Task 1: 抽共用常數 `src/constants/signoff.ts`

`PAYMENT_METHOD_OPTIONS` / `paymentMethodLabel` 目前在 `src/api/vendorPayment.ts` 與 `src/api/miscReceipt.ts` 重複定義（值相同）；`CATEGORY_OPTIONS` / `categoryLabel` 在 miscReceipt.ts；Summary interface 兩檔各一份（shape 相同）。收斂到一個常數檔，api 模組 re-export 維持既有 import 路徑不破壞呼叫端。

**Files:**
- Create: `src/constants/signoff.ts`
- Create: `src/constants/__tests__/signoff.spec.ts`
- Modify: `src/api/vendorPayment.ts:3-11,50-59`（刪本地定義改 re-export）
- Modify: `src/api/miscReceipt.ts:3-11,50-71`（同上）

**Interfaces:**
- Produces: `PAYMENT_METHOD_OPTIONS: {value,label}[]`（5 項）、`paymentMethodLabel(value: string): string`、`CATEGORY_OPTIONS`（6 項）、`categoryLabel(value: string): string`、`interface SignoffSummary { total_count/total_amount/pending_count/pending_amount/signed_count/signed_amount: number }`——Task 2/4 直接 import。
- 既有呼叫端不變：`@/api/vendorPayment` 與 `@/api/miscReceipt` 繼續 export 同名符號（re-export）。

- [ ] **Step 1: 寫失敗測試**

建 `src/constants/__tests__/signoff.spec.ts`：

```ts
import { describe, it, expect } from 'vitest'
import {
  PAYMENT_METHOD_OPTIONS,
  paymentMethodLabel,
  CATEGORY_OPTIONS,
  categoryLabel,
} from '@/constants/signoff'

describe('constants/signoff', () => {
  it('PAYMENT_METHOD_OPTIONS 有 5 種收付方式', () => {
    expect(PAYMENT_METHOD_OPTIONS.map((o) => o.value)).toEqual([
      'cash', 'bank_transfer', 'check', 'linepay', 'other',
    ])
  })

  it('paymentMethodLabel 對應中文，未知值原樣回傳', () => {
    expect(paymentMethodLabel('cash')).toBe('現金')
    expect(paymentMethodLabel('bank_transfer')).toBe('銀行匯款')
    expect(paymentMethodLabel('check')).toBe('支票')
    expect(paymentMethodLabel('linepay')).toBe('LINE Pay')
    expect(paymentMethodLabel('other')).toBe('其他')
    expect(paymentMethodLabel('未知')).toBe('未知')
  })

  it('CATEGORY_OPTIONS 有 6 種雜項收款類別', () => {
    expect(CATEGORY_OPTIONS.map((o) => o.value)).toEqual([
      'rent', 'donation', 'subsidy', 'secondhand_sale', 'refund_recovery', 'other',
    ])
  })

  it('categoryLabel 對應中文，未知值原樣回傳', () => {
    expect(categoryLabel('donation')).toBe('捐款')
    expect(categoryLabel('unknown')).toBe('unknown')
  })
})
```

- [ ] **Step 2: 跑測試確認失敗**

```bash
cd ~/Desktop/ivy-frontend && npx vitest run src/constants/__tests__/signoff.spec.ts
```
預期：FAIL（模組不存在 `@/constants/signoff`）。

- [ ] **Step 3: 建 `src/constants/signoff.ts`**

```ts
/**
 * 收支簽收（廠商付款／雜項收款）共用常數。
 * 原本 PAYMENT_METHOD_OPTIONS / paymentMethodLabel 在 vendorPayment.ts 與
 * miscReceipt.ts 重複定義（值相同），Summary interface 亦兩檔各一份；
 * 收斂於此，兩 api 模組 re-export 維持既有 import 路徑。
 */
export const PAYMENT_METHOD_OPTIONS = [
  { value: 'cash', label: '現金' },
  { value: 'bank_transfer', label: '銀行匯款' },
  { value: 'check', label: '支票' },
  { value: 'linepay', label: 'LINE Pay' },
  { value: 'other', label: '其他' },
]

export const paymentMethodLabel = (value: string) =>
  PAYMENT_METHOD_OPTIONS.find((o) => o.value === value)?.label || value

export const CATEGORY_OPTIONS = [
  { value: 'rent', label: '場地租金' },
  { value: 'donation', label: '捐款' },
  { value: 'subsidy', label: '補助款' },
  { value: 'secondhand_sale', label: '二手義賣' },
  { value: 'refund_recovery', label: '退費回收' },
  { value: 'other', label: '其他' },
]

export const categoryLabel = (value: string) =>
  CATEGORY_OPTIONS.find((o) => o.value === value)?.label || value

/** 區間彙總（跨狀態），對應後端 GET /vendor-payments/summary 與 /misc-receipts/summary（shape 相同）。 */
export interface SignoffSummary {
  total_count: number
  total_amount: number
  pending_count: number
  pending_amount: number
  signed_count: number
  signed_amount: number
}
```

- [ ] **Step 4: 改兩個 api 模組為 re-export**

`src/api/vendorPayment.ts`——刪除檔頭的 `VendorPaymentSummary` interface（第 3-11 行）與檔尾的 `PAYMENT_METHOD_OPTIONS` / `paymentMethodLabel`（第 50-59 行），改為：

```ts
// 檔頭（import api 之後）加：
export { PAYMENT_METHOD_OPTIONS, paymentMethodLabel } from '@/constants/signoff'
export type { SignoffSummary as VendorPaymentSummary } from '@/constants/signoff'
```

`src/api/miscReceipt.ts`——刪除 `MiscReceiptSummary` interface（第 3-11 行）與檔尾 `PAYMENT_METHOD_OPTIONS` / `paymentMethodLabel` / `CATEGORY_OPTIONS` / `categoryLabel`（第 50-71 行），改為：

```ts
export {
  PAYMENT_METHOD_OPTIONS,
  paymentMethodLabel,
  CATEGORY_OPTIONS,
  categoryLabel,
} from '@/constants/signoff'
export type { SignoffSummary as MiscReceiptSummary } from '@/constants/signoff'
```

其餘 api 函式（`listVendorPayments` 等 11 支 × 2 檔）**原樣保留**。

- [ ] **Step 5: 跑測試確認通過（含既有回歸）**

```bash
cd ~/Desktop/ivy-frontend && npx vitest run src/constants/__tests__/signoff.spec.ts src/api/__tests__/miscReceipt.spec.ts src/views/__tests__/VendorPaymentView.spec.js
```
預期：全 PASS（miscReceipt.spec.ts 從 `../miscReceipt` re-export 取值不受影響；VendorPaymentView.spec.js 的 `vi.importActual` 同理）。

- [ ] **Step 6: typecheck + commit**

```bash
cd ~/Desktop/ivy-frontend && npm run typecheck && git add src/constants/signoff.ts src/constants/__tests__/signoff.spec.ts src/api/vendorPayment.ts src/api/miscReceipt.ts && git commit -m "refactor: 收支簽收前置——抽共用收付方式/類別常數

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 2: 模組設定 `src/config/signoffModules.ts`

**Files:**
- Create: `src/config/signoffModules.ts`
- Create: `src/config/__tests__/signoffModules.spec.ts`

**Interfaces:**
- Consumes: Task 1 的常數與 `SignoffSummary`；`@/api/vendorPayment` / `@/api/miscReceipt` 的 11 支函式；`@/constants/permissions` 的 `PERMISSION_NAMES` 與 `PermissionName` type。
- Produces（Task 3/4/5 依賴的精確簽名）：
  - `interface SignoffModuleApi { list(params: Record<string, unknown>): Promise<...>; summary(params?): ...; get(id: number): ...; create(data): ...; update(id, data): ...; remove(id: number): ...; sign(id, data: { signature_kind: string; signature_data: string }): ...; uploadAttachment(id, formData: FormData): ...; deleteAttachment(id, key: string): ...; attachmentDownloadUrl(id, key): string; signatureUrl(id): string }`
  - `interface SignoffModuleConfig { key: 'vendor'|'misc'; tabLabel: string; api: SignoffModuleApi; fields: { partyName/date/docNumber: { key: string; label: string } }; category: { label; options; labelOf } | null; permissions: { read; write: PermissionName }; texts: {…見下方完整 key 清單} }`
  - `VENDOR_SIGNOFF_MODULE` / `MISC_SIGNOFF_MODULE` / `SIGNOFF_MODULES: readonly SignoffModuleConfig[]`

- [ ] **Step 1: 寫失敗測試**

建 `src/config/__tests__/signoffModules.spec.ts`：

```ts
import { describe, it, expect } from 'vitest'
import {
  SIGNOFF_MODULES,
  VENDOR_SIGNOFF_MODULE,
  MISC_SIGNOFF_MODULE,
} from '@/config/signoffModules'

describe('signoffModules config', () => {
  it('提供 vendor 與 misc 兩個模組、順序固定', () => {
    expect(SIGNOFF_MODULES.map((m) => m.key)).toEqual(['vendor', 'misc'])
  })

  it('鏡像欄位映射對齊後端欄位名', () => {
    expect(VENDOR_SIGNOFF_MODULE.fields.partyName.key).toBe('vendor_name')
    expect(VENDOR_SIGNOFF_MODULE.fields.date.key).toBe('payment_date')
    expect(VENDOR_SIGNOFF_MODULE.fields.docNumber.key).toBe('invoice_number')
    expect(MISC_SIGNOFF_MODULE.fields.partyName.key).toBe('payer_name')
    expect(MISC_SIGNOFF_MODULE.fields.date.key).toBe('receipt_date')
    expect(MISC_SIGNOFF_MODULE.fields.docNumber.key).toBe('receipt_number')
  })

  it('類別欄僅雜項收款有（6 類）', () => {
    expect(VENDOR_SIGNOFF_MODULE.category).toBeNull()
    expect(MISC_SIGNOFF_MODULE.category?.options).toHaveLength(6)
    expect(MISC_SIGNOFF_MODULE.category?.labelOf('rent')).toBe('場地租金')
  })

  it('權限碼對齊 PERMISSION_NAMES', () => {
    expect(VENDOR_SIGNOFF_MODULE.permissions).toEqual({
      read: 'VENDOR_PAYMENT_READ', write: 'VENDOR_PAYMENT_WRITE',
    })
    expect(MISC_SIGNOFF_MODULE.permissions).toEqual({
      read: 'MISC_RECEIPT_READ', write: 'MISC_RECEIPT_WRITE',
    })
  })

  it('api 綁定齊備（11 支皆為函式）', () => {
    for (const m of SIGNOFF_MODULES) {
      for (const fn of Object.values(m.api)) expect(typeof fn).toBe('function')
      expect(Object.keys(m.api)).toHaveLength(11)
    }
  })

  it('texts 全部非空字串且兩模組 key 集合一致', () => {
    const vendorKeys = Object.keys(VENDOR_SIGNOFF_MODULE.texts).sort()
    const miscKeys = Object.keys(MISC_SIGNOFF_MODULE.texts).sort()
    expect(miscKeys).toEqual(vendorKeys)
    for (const m of SIGNOFF_MODULES) {
      for (const v of Object.values(m.texts)) {
        expect(typeof v).toBe('string')
        expect((v as string).length).toBeGreaterThan(0)
      }
    }
  })
})
```

- [ ] **Step 2: 跑測試確認失敗**

```bash
cd ~/Desktop/ivy-frontend && npx vitest run src/config/__tests__/signoffModules.spec.ts
```
預期：FAIL（模組不存在）。

- [ ] **Step 3: 建 `src/config/signoffModules.ts`**（完整檔案）

```ts
/**
 * 收支簽收模組設定：廠商付款（支出側）與雜項收款（收入側）為後端鏡像孿生模組，
 * 前端以同一套 SignoffPanel / SignoffSignDialog 渲染，僅注入不同的 api、欄位映射與文案。
 * 新增文案差異一律加進 texts，共用元件內不得硬編 vendor/misc 特定字樣。
 */
import type { PermissionName } from '@/constants/permissions'
import { PERMISSION_NAMES } from '@/constants/permissions'
import { CATEGORY_OPTIONS, categoryLabel } from '@/constants/signoff'
import {
  listVendorPayments,
  getVendorPaymentSummary,
  getVendorPayment,
  createVendorPayment,
  updateVendorPayment,
  deleteVendorPayment,
  signVendorPayment,
  uploadVendorPaymentAttachment,
  deleteVendorPaymentAttachment,
  downloadVendorPaymentAttachmentUrl,
  vendorPaymentSignatureUrl,
} from '@/api/vendorPayment'
import {
  listMiscReceipts,
  getMiscReceiptSummary,
  getMiscReceipt,
  createMiscReceipt,
  updateMiscReceipt,
  deleteMiscReceipt,
  signMiscReceipt,
  uploadMiscReceiptAttachment,
  deleteMiscReceiptAttachment,
  downloadMiscReceiptAttachmentUrl,
  miscReceiptSignatureUrl,
} from '@/api/miscReceipt'

/** axios wrapper 不解包 .data；此處僅約束呼叫形狀，回應型別由呼叫端 as 收斂 */
type ApiCall = (...args: never[]) => Promise<{ data: unknown }>

export interface SignoffModuleApi {
  list: (params: Record<string, unknown>) => ReturnType<ApiCall>
  summary: (params?: Record<string, unknown>) => ReturnType<ApiCall>
  get: (id: number) => ReturnType<ApiCall>
  create: (data: Record<string, unknown>) => ReturnType<ApiCall>
  update: (id: number, data: Record<string, unknown>) => ReturnType<ApiCall>
  remove: (id: number) => ReturnType<ApiCall>
  sign: (id: number, data: { signature_kind: string; signature_data: string }) => ReturnType<ApiCall>
  uploadAttachment: (id: number, formData: FormData) => ReturnType<ApiCall>
  deleteAttachment: (id: number, key: string) => ReturnType<ApiCall>
  attachmentDownloadUrl: (id: number, key: string) => string
  signatureUrl: (id: number) => string
}

interface SignoffField {
  /** 後端欄位名（list 篩選參數、row 欄位、payload key 共用） */
  key: string
  /** 表格欄標題 */
  label: string
}

export interface SignoffTexts {
  headerSub: string
  addButton: string
  kpiTotalLabel: string
  kpiPendingLabel: string
  searchPlaceholder: string
  formSectionTitle: string
  formPartyLabel: string
  formPartyPlaceholder: string
  descPlaceholder: string
  signedCertHint: string
  attachmentsHint: string
  emptyTitle: string
  emptyHint: string
  /** '付款' / '收款'：組合「編輯／檢視＋單位」「刪除確認」「找不到該筆…」等句 */
  unitLabel: string
  requiredMsg: string
  signTitle: string
  signUploadHint: string
  signPadHint: string
}

export interface SignoffModuleConfig {
  key: 'vendor' | 'misc'
  tabLabel: string
  api: SignoffModuleApi
  fields: {
    partyName: SignoffField
    date: SignoffField
    docNumber: SignoffField
  }
  /** 僅雜項收款有；null 時面板不渲染類別篩選／表格欄／表單欄 */
  category: {
    label: string
    options: ReadonlyArray<{ value: string; label: string }>
    labelOf: (value: string) => string
  } | null
  permissions: { read: PermissionName; write: PermissionName }
  texts: SignoffTexts
}

export const VENDOR_SIGNOFF_MODULE: SignoffModuleConfig = {
  key: 'vendor',
  tabLabel: '廠商付款',
  api: {
    list: listVendorPayments,
    summary: getVendorPaymentSummary,
    get: getVendorPayment,
    create: createVendorPayment,
    update: updateVendorPayment,
    remove: deleteVendorPayment,
    sign: signVendorPayment,
    uploadAttachment: uploadVendorPaymentAttachment,
    deleteAttachment: deleteVendorPaymentAttachment,
    attachmentDownloadUrl: downloadVendorPaymentAttachmentUrl,
    signatureUrl: vendorPaymentSignatureUrl,
  },
  fields: {
    partyName: { key: 'vendor_name', label: '廠商' },
    date: { key: 'payment_date', label: '付款日期' },
    docNumber: { key: 'invoice_number', label: '發票／收據號' },
  },
  category: null,
  permissions: {
    read: PERMISSION_NAMES.VENDOR_PAYMENT_READ,
    write: PERMISSION_NAMES.VENDOR_PAYMENT_WRITE,
  },
  texts: {
    headerSub: '逐筆登記廠商請款，上傳廠商簽收的紙本憑證留存',
    addButton: '新增付款',
    kpiTotalLabel: '本期付款總額',
    kpiPendingLabel: '待廠商簽收',
    searchPlaceholder: '搜尋廠商名稱',
    formSectionTitle: '請款資訊',
    formPartyLabel: '廠商名稱',
    formPartyPlaceholder: '例：好棒棒清潔用品行',
    descPlaceholder: '例：5 月清潔用品',
    signedCertHint: '翻為「已簽收」所留存的廠商簽名／簽收照片（1 張）',
    attachmentsHint: '發票、請款單等補充文件（最多 5 張）',
    emptyTitle: '尚無廠商付款紀錄',
    emptyHint: '點右上「新增付款」開始登記第一筆廠商請款。',
    unitLabel: '付款',
    requiredMsg: '請填寫日期、廠商與金額',
    signTitle: '廠商簽收',
    signUploadHint: '廠商簽好的紙本請款／簽收單照片，PNG／JPG／WEBP',
    signPadHint: '請廠商於上方框內簽名',
  },
}

export const MISC_SIGNOFF_MODULE: SignoffModuleConfig = {
  key: 'misc',
  tabLabel: '雜項收款',
  api: {
    list: listMiscReceipts,
    summary: getMiscReceiptSummary,
    get: getMiscReceipt,
    create: createMiscReceipt,
    update: updateMiscReceipt,
    remove: deleteMiscReceipt,
    sign: signMiscReceipt,
    uploadAttachment: uploadMiscReceiptAttachment,
    deleteAttachment: deleteMiscReceiptAttachment,
    attachmentDownloadUrl: downloadMiscReceiptAttachmentUrl,
    signatureUrl: miscReceiptSignatureUrl,
  },
  fields: {
    partyName: { key: 'payer_name', label: '繳款方/來源' },
    date: { key: 'receipt_date', label: '收款日期' },
    docNumber: { key: 'receipt_number', label: '收據／單據號' },
  },
  category: {
    label: '類別',
    options: CATEGORY_OPTIONS,
    labelOf: categoryLabel,
  },
  permissions: {
    read: PERMISSION_NAMES.MISC_RECEIPT_READ,
    write: PERMISSION_NAMES.MISC_RECEIPT_WRITE,
  },
  texts: {
    headerSub: '逐筆登記雜項收款，上傳繳款方簽收的紙本憑證留存',
    addButton: '新增收款',
    kpiTotalLabel: '本期收款總額',
    kpiPendingLabel: '待繳款方簽收',
    searchPlaceholder: '搜尋繳款方/來源',
    formSectionTitle: '收款資訊',
    formPartyLabel: '繳款方/來源',
    formPartyPlaceholder: '例：台北市教育局',
    descPlaceholder: '例：場地租金補助款',
    signedCertHint: '翻為「已簽收」所留存的繳款方簽名／簽收照片（1 張）',
    attachmentsHint: '收據、補助文件等補充資料（最多 5 張）',
    emptyTitle: '尚無雜項收款紀錄',
    emptyHint: '點右上「新增收款」開始登記第一筆雜項收款。',
    unitLabel: '收款',
    requiredMsg: '請填寫收款日期、繳款方、類別與金額',
    signTitle: '繳款方簽收',
    signUploadHint: '繳款方簽好的紙本請款／簽收單照片，PNG／JPG／WEBP',
    signPadHint: '請繳款方於上方框內簽名',
  },
}

export const SIGNOFF_MODULES: readonly SignoffModuleConfig[] = [
  VENDOR_SIGNOFF_MODULE,
  MISC_SIGNOFF_MODULE,
]
```

註：`api` 欄位型別以現有 api 函式（`(params: unknown) => …`）可直接指派為準；若 typecheck 對 `ReturnType<ApiCall>` 報型別不相容，將 `SignoffModuleApi` 各方法回傳型別放寬為 `Promise<{ data: unknown }>` 再收斂（禁止 `as any`）。

- [ ] **Step 4: 跑測試確認通過**

```bash
cd ~/Desktop/ivy-frontend && npx vitest run src/config/__tests__/signoffModules.spec.ts && npm run typecheck
```
預期：PASS。

- [ ] **Step 5: Commit**

```bash
cd ~/Desktop/ivy-frontend && git add src/config/ && git commit -m "feat: 新增收支簽收模組設定（config 驅動雙模組）

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 3: 共用簽名板 `SignoffSignDialog.vue`

兩個舊簽名 dialog（`VendorPaymentSignDialog.vue` / `MiscReceiptSignDialog.vue`）正規化實體名後 diff 為 0，直接合一。以 `VendorPaymentSignDialog.vue` 為基底，prop 從 `paymentId` 改為 `recordId` + `config`，文案與 sign api 走 config。

**Files:**
- Create: `src/components/signoff/SignoffSignDialog.vue`
- Create: `src/components/signoff/__tests__/SignoffSignDialog.spec.ts`

**Interfaces:**
- Consumes: `SignoffModuleConfig`（用 `config.texts.signTitle / signUploadHint / signPadHint` 與 `config.api.sign`）。
- Produces: `<SignoffSignDialog v-model :record-id="number|null" :config="SignoffModuleConfig" @signed />`——Task 4 面板使用。

- [ ] **Step 1: 寫失敗測試**

建 `src/components/signoff/__tests__/SignoffSignDialog.spec.ts`：

```ts
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'

vi.mock('element-plus', () => ({
  ElMessage: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
}))
vi.mock('@/utils/imageCompress', () => ({
  compressImageToDataUrl: vi.fn().mockResolvedValue('data:image/jpeg;base64,BBB'),
}))

import { ElMessage } from 'element-plus'
import { VENDOR_SIGNOFF_MODULE, type SignoffModuleConfig } from '@/config/signoffModules'
import SignoffSignDialog from '../SignoffSignDialog.vue'

const globalStubs = {
  'el-dialog': {
    template: '<div v-if="modelValue" class="dialog-stub" :data-title="title"><slot /><slot name="footer" /></div>',
    props: ['modelValue', 'title'],
  },
  'el-tabs': { template: '<div><slot /></div>', props: ['modelValue'] },
  'el-tab-pane': { template: '<div><slot /></div>', props: ['label', 'name'] },
  'el-upload': { template: '<div class="el-upload-stub"><slot /></div>' },
  'el-button': { template: '<button @click="$emit(\'click\')"><slot /></button>' },
  'el-icon': { template: '<i><slot /></i>' },
}

interface DialogVm {
  activeTab: string
  submit: () => Promise<void>
  startDraw: (e: MouseEvent) => void
  draw: (e: MouseEvent) => void
  endDraw: () => void
  handleUploadChange: (file: { raw?: File; size?: number; name?: string }) => void
}

function makeConfig(signMock: ReturnType<typeof vi.fn>): SignoffModuleConfig {
  return { ...VENDOR_SIGNOFF_MODULE, api: { ...VENDOR_SIGNOFF_MODULE.api, sign: signMock } }
}

function mountDialog(signMock: ReturnType<typeof vi.fn>) {
  return mount(SignoffSignDialog, {
    props: { modelValue: true, recordId: 3, config: makeConfig(signMock) },
    global: { stubs: globalStubs },
  })
}

describe('SignoffSignDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
      fillStyle: '', fillRect: vi.fn(), lineCap: '', lineJoin: '', lineWidth: 0,
      strokeStyle: '', beginPath: vi.fn(), moveTo: vi.fn(), lineTo: vi.fn(), stroke: vi.fn(),
    } as unknown as CanvasRenderingContext2D)
    vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue('data:image/png;base64,AAA')
    if (!('createObjectURL' in URL)) {
      Object.assign(URL, { createObjectURL: () => 'blob:mock', revokeObjectURL: () => {} })
    }
  })

  it('dialog 標題來自 config.texts.signTitle', () => {
    const wrapper = mountDialog(vi.fn())
    expect(wrapper.find('.dialog-stub').attributes('data-title')).toBe('廠商簽收')
  })

  it('photo tab 未選照片就送出 → 警告且不打 API', async () => {
    const signMock = vi.fn()
    const wrapper = mountDialog(signMock)
    await (wrapper.vm as unknown as DialogVm).submit()
    expect(ElMessage.warning).toHaveBeenCalledWith('請選擇照片')
    expect(signMock).not.toHaveBeenCalled()
  })

  it('drawn tab 未簽名就送出 → 警告且不打 API', async () => {
    const signMock = vi.fn()
    const wrapper = mountDialog(signMock)
    const vm = wrapper.vm as unknown as DialogVm
    vm.activeTab = 'drawn'
    await vm.submit()
    expect(ElMessage.warning).toHaveBeenCalledWith('請先簽名')
    expect(signMock).not.toHaveBeenCalled()
  })

  it('drawn 簽名後送出 → 以 canvas dataURL 呼叫 config.api.sign 並 emit signed', async () => {
    const signMock = vi.fn().mockResolvedValue({ data: { message: 'ok' } })
    const wrapper = mountDialog(signMock)
    const vm = wrapper.vm as unknown as DialogVm
    vm.activeTab = 'drawn'
    vm.startDraw({ clientX: 1, clientY: 1 } as MouseEvent)
    vm.draw({ clientX: 5, clientY: 5 } as MouseEvent)
    vm.endDraw()
    await vm.submit()
    await flushPromises()
    expect(signMock).toHaveBeenCalledWith(3, {
      signature_kind: 'drawn',
      signature_data: 'data:image/png;base64,AAA',
    })
    expect(wrapper.emitted('signed')).toHaveLength(1)
  })

  it('photo 選檔後送出 → 走壓縮結果呼叫 sign', async () => {
    const signMock = vi.fn().mockResolvedValue({ data: { message: 'ok' } })
    const wrapper = mountDialog(signMock)
    const vm = wrapper.vm as unknown as DialogVm
    vm.handleUploadChange({ raw: new File(['x'], 'a.png', { type: 'image/png' }), name: 'a.png', size: 3 })
    await vm.submit()
    await flushPromises()
    expect(signMock).toHaveBeenCalledWith(3, {
      signature_kind: 'photo',
      signature_data: 'data:image/jpeg;base64,BBB',
    })
  })
})
```

- [ ] **Step 2: 跑測試確認失敗**

```bash
cd ~/Desktop/ivy-frontend && npx vitest run src/components/signoff/__tests__/SignoffSignDialog.spec.ts
```
預期：FAIL（元件不存在）。

- [ ] **Step 3: 建元件**

複製 `src/components/VendorPaymentSignDialog.vue` 為 `src/components/signoff/SignoffSignDialog.vue`，套用以下修改（其餘逐行保留，含 canvas 畫板、照片壓縮、blob URL 釋放邏輯）：

1. `<el-dialog ... title="廠商簽收"` → `:title="config.texts.signTitle"`
2. 註解 `<!-- 主要路徑：上傳廠商簽好的紙本照片 -->` → `<!-- 主要路徑：上傳簽好的紙本照片 -->`；`<!-- 次要路徑：廠商當場於螢幕手寫 -->` → `<!-- 次要路徑：當場於螢幕手寫 -->`
3. 上傳 hint（原 26 行）`廠商簽好的紙本請款／簽收單照片，PNG／JPG／WEBP` → `{{ config.texts.signUploadHint }}`
4. 手寫 hint（原 56 行）`請廠商於上方框內簽名` → `{{ config.texts.signPadHint }}`
5. props / import 區改為：

```ts
import { signVendorPayment } from '@/api/vendorPayment'   // ← 刪除這行
import type { SignoffModuleConfig } from '@/config/signoffModules'   // ← 新增

const props = withDefaults(defineProps<{
  modelValue?: boolean
  recordId?: number | null
  config: SignoffModuleConfig
}>(), {
  modelValue: false,
  recordId: null,
})
```

6. `submit()` 內 `if (!props.paymentId) return` → `if (!props.recordId) return`；`await signVendorPayment(props.paymentId, {...})` → `await props.config.api.sign(props.recordId, {...})`
7. CSS class 前綴全部 `vp-sign-` → `so-sign-`（template 與 `<style scoped>` 同步；`signature-pad` / `signature-canvas` / `signature-hint` / `dialog-tools` 無前綴，保留原名）

- [ ] **Step 4: 跑測試確認通過**

```bash
cd ~/Desktop/ivy-frontend && npx vitest run src/components/signoff/__tests__/SignoffSignDialog.spec.ts && npm run typecheck
```
預期：PASS。

- [ ] **Step 5: Commit**

```bash
cd ~/Desktop/ivy-frontend && git add src/components/signoff/ && git commit -m "feat: 新增共用簽收簽名板 SignoffSignDialog

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 4: 共用面板 `SignoffPanel.vue`（本計畫最大 task）

以 `src/views/VendorPaymentView.vue`（有 11 案例測試鎖行為）為基底改造：內部狀態改中性命名（`filters.partyName` / `form.date` 等），僅在 API 邊界（篩選參數、payload、openEdit 讀 row）透過 `config.fields.*.key` 映射回後端欄位名；類別欄以 `v-if="config.category"` 插入。

**Files:**
- Create: `src/components/signoff/SignoffPanel.vue`
- Create: `src/components/signoff/__tests__/SignoffPanel.spec.ts`（遷移自 `src/views/__tests__/VendorPaymentView.spec.js` 的 11 案例，config 參數化跑 vendor+misc）

**Interfaces:**
- Consumes: Task 2 `SignoffModuleConfig`、Task 3 `SignoffSignDialog`、Task 1 `SignoffSummary` / `PAYMENT_METHOD_OPTIONS` / `paymentMethodLabel`。
- Produces: `<SignoffPanel :config="SignoffModuleConfig" :highlight-id="number|null" />`——Task 5 使用。面板自帶「新增」按鈕與所有 dialog；掛載時載入列表+彙總，`highlightId` 有值時自動開該筆編輯。

- [ ] **Step 1: 寫失敗測試**

建 `src/components/signoff/__tests__/SignoffPanel.spec.ts`（完整檔案）：

```ts
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'

vi.mock('@/utils/auth', () => ({ hasPermission: vi.fn().mockReturnValue(true) }))
vi.mock('element-plus', () => ({
  ElMessage: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
  ElMessageBox: { confirm: vi.fn().mockResolvedValue(true) },
}))

import { hasPermission } from '@/utils/auth'
import { ElMessage, ElMessageBox } from 'element-plus'
import {
  VENDOR_SIGNOFF_MODULE,
  MISC_SIGNOFF_MODULE,
  type SignoffModuleConfig,
  type SignoffModuleApi,
} from '@/config/signoffModules'
import SignoffPanel from '../SignoffPanel.vue'

const globalStubs = {
  'el-button': { template: '<button data-test="el-button" @click="$emit(\'click\')"><slot /></button>' },
  'el-input': { template: '<input />', props: ['modelValue'] },
  'el-input-number': { template: '<input type="number" />', props: ['modelValue'] },
  'el-select': { template: '<select><slot /></select>', props: ['modelValue'] },
  'el-option': { template: '<option><slot /></option>' },
  'el-date-picker': { template: '<input type="date" />', props: ['modelValue'] },
  // 不渲染 el-table 內部 slot（避免 row scoped slot 解構錯誤），把整列值攤平成文字
  'el-table': {
    template:
      '<table data-test="so-table"><tbody><tr v-for="r in data" :key="r.id"><td>{{ Object.values(r).join(" ") }}</td></tr></tbody></table>',
    props: ['data'],
  },
  'el-table-column': { template: '<span />' },
  'el-dialog': {
    template: '<div v-if="modelValue" class="el-dialog-stub"><slot /><slot name="footer" /></div>',
    props: ['modelValue'],
  },
  'el-form': { template: '<form><slot /></form>' },
  'el-form-item': { template: '<div class="el-form-item"><slot /></div>' },
  'el-pagination': { template: '<div class="el-pagination" />' },
  'el-upload': { template: '<div class="el-upload"><slot /></div>' },
  'el-radio-group': { template: '<div class="el-radio-group"><slot /></div>', props: ['modelValue'] },
  'el-radio-button': { template: '<label class="el-radio-button"><slot /></label>', props: ['value'] },
  'el-skeleton': { template: '<div class="el-skeleton" />' },
  'el-dropdown': { template: '<div class="el-dropdown"><slot /><slot name="dropdown" /></div>' },
  'el-dropdown-menu': { template: '<div><slot /></div>' },
  'el-dropdown-item': { template: '<div class="el-dropdown-item"><slot /></div>', props: ['command'] },
  'el-icon': { template: '<i><slot /></i>' },
  SignoffSignDialog: { template: '<div class="sign-dialog-stub" />' },
}

const globalDirectives = {
  loading: { mounted: () => {}, updated: () => {} },
}

function makeItems(cfg: SignoffModuleConfig): Record<string, unknown>[] {
  return [
    {
      id: 1,
      [cfg.fields.date.key]: '2026-05-15',
      [cfg.fields.partyName.key]: '甲方一號',
      amount: 1200,
      payment_method: 'cash',
      description: '第一筆',
      [cfg.fields.docNumber.key]: 'AB-001',
      notes: null,
      attachments: [],
      status: 'pending',
      ...(cfg.category ? { category: 'rent' } : {}),
      signer_id: null, signer_name: null, signed_at: null, signature_kind: null,
      has_signature: false, created_by_id: 1, created_by_name: 'admin',
      created_at: '2026-05-15T10:00:00', updated_at: '2026-05-15T10:00:00',
    },
    {
      id: 2,
      [cfg.fields.date.key]: '2026-05-10',
      [cfg.fields.partyName.key]: '乙方二號',
      amount: 8800,
      payment_method: 'bank_transfer',
      description: '第二筆',
      [cfg.fields.docNumber.key]: null,
      notes: '已對帳',
      attachments: [],
      status: 'signed',
      ...(cfg.category ? { category: 'donation' } : {}),
      signer_id: 7, signer_name: '林主任', signed_at: '2026-05-11T09:30:00', signature_kind: 'drawn',
      has_signature: true, created_by_id: 1, created_by_name: 'admin',
      created_at: '2026-05-10T10:00:00', updated_at: '2026-05-11T09:30:00',
    },
  ]
}

function makeMockApi(cfg: SignoffModuleConfig): SignoffModuleApi {
  return {
    list: vi.fn().mockResolvedValue({ data: { items: makeItems(cfg), total: 2, page: 1, page_size: 20 } }),
    summary: vi.fn().mockResolvedValue({
      data: {
        total_count: 2, total_amount: 10000,
        pending_count: 1, pending_amount: 1200,
        signed_count: 1, signed_amount: 8800,
      },
    }),
    get: vi.fn().mockResolvedValue({ data: makeItems(cfg)[0] }),
    create: vi.fn().mockResolvedValue({ data: { id: 99 } }),
    update: vi.fn().mockResolvedValue({ data: { message: 'ok' } }),
    remove: vi.fn().mockResolvedValue({ data: { message: 'ok' } }),
    sign: vi.fn().mockResolvedValue({ data: { message: 'ok' } }),
    uploadAttachment: vi.fn().mockResolvedValue({ data: {} }),
    deleteAttachment: vi.fn().mockResolvedValue({ data: {} }),
    attachmentDownloadUrl: (id: number, key: string) => `/x/${id}/${key}`,
    signatureUrl: (id: number) => `/x/${id}/signature`,
  }
}

interface PanelVm {
  filters: { status: string; partyName: string; category: string }
  form: Record<string, unknown>
  editingId: number | null
  dialogVisible: boolean
  fetchList: () => Promise<void>
  openCreate: () => void
  handleSave: () => Promise<unknown>
  handleDelete: (row: Record<string, unknown>) => Promise<void>
  disabledFutureDate: (t: Date) => boolean
}

const CASES: [string, SignoffModuleConfig][] = [
  ['vendor', VENDOR_SIGNOFF_MODULE],
  ['misc', MISC_SIGNOFF_MODULE],
]

describe.each(CASES)('SignoffPanel (%s)', (_name, baseCfg) => {
  let mockApi: SignoffModuleApi
  let cfg: SignoffModuleConfig

  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(hasPermission).mockReturnValue(true)
    mockApi = makeMockApi(baseCfg)
    cfg = { ...baseCfg, api: mockApi }
  })

  const mountPanel = (highlightId: number | null = null) =>
    mount(SignoffPanel, {
      props: { config: cfg, highlightId },
      global: { stubs: globalStubs, directives: globalDirectives },
    })

  it('掛載即載入列表並渲染資料', async () => {
    const wrapper = mountPanel()
    await flushPromises()
    expect(mockApi.list).toHaveBeenCalled()
    expect(wrapper.text()).toContain('甲方一號')
    expect(wrapper.text()).toContain('乙方二號')
  })

  it('掛載載入彙總並渲染 KPI 卡（文案來自 config）', async () => {
    const wrapper = mountPanel()
    await flushPromises()
    expect(mockApi.summary).toHaveBeenCalled()
    const text = wrapper.text()
    expect(text).toContain(cfg.texts.kpiTotalLabel)
    expect(text).toContain(cfg.texts.kpiPendingLabel)
    expect(text).toContain('已簽收')
    expect(text).toContain('1 筆等待回簽')
    expect(text).toContain('NT$10,000')
    expect(text).toContain('NT$1,200')
  })

  it('只改 status 只刷列表、彙總不重抓', async () => {
    const wrapper = mountPanel()
    await flushPromises()
    vi.mocked(mockApi.summary).mockClear()
    vi.mocked(mockApi.list).mockClear()
    const vm = wrapper.vm as unknown as PanelVm
    vm.filters.status = 'pending'
    await vm.fetchList()
    expect(mockApi.list).toHaveBeenCalled()
    expect(mockApi.summary).not.toHaveBeenCalled()
  })

  it('無 WRITE 權限時隱藏新增按鈕', async () => {
    vi.mocked(hasPermission).mockReturnValue(false)
    const wrapper = mountPanel()
    await flushPromises()
    expect(wrapper.text()).not.toContain(cfg.texts.addButton)
  })

  it('有 WRITE 權限時顯示新增按鈕', async () => {
    const wrapper = mountPanel()
    await flushPromises()
    expect(wrapper.text()).toContain(cfg.texts.addButton)
  })

  it('刪除先確認再打 API', async () => {
    const wrapper = mountPanel()
    await flushPromises()
    const vm = wrapper.vm as unknown as PanelVm
    await vm.handleDelete({ id: 1, [cfg.fields.partyName.key]: '甲方一號' })
    expect(ElMessageBox.confirm).toHaveBeenCalled()
    expect(mockApi.remove).toHaveBeenCalledWith(1)
  })

  it('openCreate 重置表單並開 dialog', async () => {
    const wrapper = mountPanel()
    await flushPromises()
    const vm = wrapper.vm as unknown as PanelVm
    vm.openCreate()
    await flushPromises()
    expect(vm.editingId).toBeNull()
    expect(vm.dialogVisible).toBe(true)
    expect(vm.form.paymentMethod).toBe('cash')
    expect(vm.form.amount).toBe(0)
    expect(vm.form.category).toBe('')
  })

  it('handleSave 以 config 欄位名組 payload 送 create', async () => {
    const wrapper = mountPanel()
    await flushPromises()
    const vm = wrapper.vm as unknown as PanelVm
    vm.openCreate()
    vm.form.partyName = '測試對象'
    vm.form.amount = 500
    if (cfg.category) vm.form.category = 'rent'
    await vm.handleSave()
    expect(mockApi.create).toHaveBeenCalledWith(
      expect.objectContaining({
        [cfg.fields.partyName.key]: '測試對象',
        amount: 500,
        payment_method: 'cash',
        ...(cfg.category ? { category: 'rent' } : {}),
      }),
    )
  })

  it.runIf(!!baseCfg.category)('（misc）缺類別時 handleSave 擋下並警告', async () => {
    const wrapper = mountPanel()
    await flushPromises()
    const vm = wrapper.vm as unknown as PanelVm
    vm.openCreate()
    vm.form.partyName = '測試對象'
    vm.form.amount = 500
    vm.form.category = ''
    await vm.handleSave()
    expect(ElMessage.warning).toHaveBeenCalledWith(cfg.texts.requiredMsg)
    expect(mockApi.create).not.toHaveBeenCalled()
  })

  it.runIf(!!baseCfg.category)('（misc）類別篩選帶進列表參數', async () => {
    const wrapper = mountPanel()
    await flushPromises()
    const vm = wrapper.vm as unknown as PanelVm
    vm.filters.category = 'rent'
    await vm.fetchList()
    const lastCall = vi.mocked(mockApi.list).mock.calls.at(-1)?.[0] as Record<string, unknown>
    expect(lastCall.category).toBe('rent')
  })

  it('disabledFutureDate 擋未來日、放行今日以前', async () => {
    const wrapper = mountPanel()
    await flushPromises()
    const vm = wrapper.vm as unknown as PanelVm
    const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000)
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000)
    expect(vm.disabledFutureDate(tomorrow)).toBe(true)
    expect(vm.disabledFutureDate(yesterday)).toBe(false)
  })

  it('highlightId 有值時掛載後自動抓該筆並開 dialog', async () => {
    const wrapper = mountPanel(1)
    await flushPromises()
    expect(mockApi.get).toHaveBeenCalledWith(1)
    const vm = wrapper.vm as unknown as PanelVm
    expect(vm.dialogVisible).toBe(true)
    expect(vm.editingId).toBe(1)
  })
})
```

- [ ] **Step 2: 跑測試確認失敗**

```bash
cd ~/Desktop/ivy-frontend && npx vitest run src/components/signoff/__tests__/SignoffPanel.spec.ts
```
預期：FAIL（元件不存在）。

- [ ] **Step 3: 建 `SignoffPanel.vue`**

複製 `src/views/VendorPaymentView.vue` 為 `src/components/signoff/SignoffPanel.vue`，然後：

**(a) `<script setup lang="ts">` 整段替換為以下完整程式碼：**

```ts
import { ref, reactive, computed, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Paperclip } from '@element-plus/icons-vue'
import { hasPermission } from '@/utils/auth'
import { todayISO } from '@/utils/format'
import { formatCurrency } from '@/utils/currency'
import { PAYMENT_METHOD_OPTIONS, paymentMethodLabel, type SignoffSummary } from '@/constants/signoff'
import type { SignoffModuleConfig } from '@/config/signoffModules'
import SignoffSignDialog from './SignoffSignDialog.vue'

const props = withDefaults(
  defineProps<{
    config: SignoffModuleConfig
    /** 深連結：掛載後自動開啟該筆編輯／明細（由 FinanceSignoffView 從 ?highlight 解析傳入） */
    highlightId?: number | null
  }>(),
  { highlightId: null },
)

// config 視為掛載期常量：外層 FinanceSignoffView 以 :key="config.key" 切 tab 重掛載
const config = props.config

const paymentMethodOptions = PAYMENT_METHOD_OPTIONS

const canWrite = computed(() => hasPermission(config.permissions.write))

interface Attachment { key: string; filename: string; size: number; mime_type?: string | null }
const items = ref<Record<string, unknown>[]>([])
const total = ref(0)
const page = ref(1)
const pageSize = ref(20)
const loading = ref(false)

const EMPTY_SUMMARY: SignoffSummary = {
  total_count: 0,
  total_amount: 0,
  pending_count: 0,
  pending_amount: 0,
  signed_count: 0,
  signed_amount: 0,
}
const summary = ref<SignoffSummary>({ ...EMPTY_SUMMARY })
const summaryLoading = ref(false)

const filters = reactive<{
  dateRange: string[] | null
  partyName: string
  status: string
  paymentMethod: string
  category: string
}>({
  dateRange: null,
  partyName: '',
  status: '',
  paymentMethod: '',
  category: '',
})

const hasActiveFilters = computed(
  () =>
    !!filters.status ||
    !!filters.partyName ||
    !!filters.paymentMethod ||
    !!filters.category ||
    (filters.dateRange?.length === 2),
)

const rangeLabel = computed(() => {
  if (filters.dateRange?.length === 2) {
    return `${filters.dateRange[0]} ～ ${filters.dateRange[1]}`
  }
  return '全部期間'
})

const dialogVisible = ref(false)
const editingId = ref<number | null>(null)
const saving = ref(false)
const dialogTitle = computed(() =>
  editingId.value
    ? (canWrite.value ? `編輯${config.texts.unitLabel}` : `檢視${config.texts.unitLabel}`)
    : config.texts.addButton,
)

const form = reactive<{
  date: string
  partyName: string
  amount: number
  paymentMethod: string
  description: string
  docNumber: string
  category: string
  notes: string
  attachments: Attachment[]
  status: string
  signer_name: string | null
  signed_at: string | null
  signature_kind: string | null
  has_signature: boolean
  created_by_name: string | null
  created_at: string | null
}>({
  date: '',
  partyName: '',
  amount: 0,
  paymentMethod: 'cash',
  description: '',
  docNumber: '',
  category: '',
  notes: '',
  attachments: [],
  status: 'pending',
  signer_name: null,
  signed_at: null,
  signature_kind: null,
  has_signature: false,
  created_by_name: null,
  created_at: null,
})

const signDialogVisible = ref(false)
const signingId = ref<number | null>(null)

const downloadAttachmentUrl = config.api.attachmentDownloadUrl
const signatureUrl = config.api.signatureUrl

function buildRangeParams(): Record<string, unknown> {
  const params: Record<string, unknown> = {}
  if (filters.dateRange?.length === 2) {
    params.start_date = filters.dateRange[0]
    params.end_date = filters.dateRange[1]
  }
  if (filters.partyName) params[config.fields.partyName.key] = filters.partyName
  if (filters.paymentMethod) params.payment_method = filters.paymentMethod
  if (config.category && filters.category) params.category = filters.category
  return params
}

async function fetchList() {
  loading.value = true
  try {
    const params = buildRangeParams()
    params.page = page.value
    params.page_size = pageSize.value
    if (filters.status) params.status = filters.status

    const res = await config.api.list(params)
    const data = res.data as { items: Record<string, unknown>[]; total: number }
    items.value = data.items
    total.value = data.total
  } catch (e) {
    const err = e as { response?: { data?: { detail?: string } } }
    ElMessage.error(err?.response?.data?.detail || '載入失敗')
  } finally {
    loading.value = false
  }
}

async function fetchSummary() {
  summaryLoading.value = true
  try {
    const res = await config.api.summary(buildRangeParams())
    summary.value = res.data as SignoffSummary
  } catch {
    summary.value = { ...EMPTY_SUMMARY }
  } finally {
    summaryLoading.value = false
  }
}

// range 篩選變動時，列表與彙總一起刷新（彙總不吃 status，故單獨改 status 只刷列表）
function refresh() {
  page.value = 1
  fetchList()
  fetchSummary()
}

function clearFilters() {
  filters.dateRange = null
  filters.partyName = ''
  filters.status = ''
  filters.paymentMethod = ''
  filters.category = ''
  refresh()
}

// 禁未來日：與後端 validate_payment_date 守衛對齊（收付日不可晚於今日）。
// 90 天回補上限由後端權威把關（避免 JS 午夜/時區與台北日的邊界誤差）。
function disabledFutureDate(time: Date): boolean {
  return time.getTime() > Date.now()
}

function resetForm() {
  Object.assign(form, {
    // 用本地時區今日，避免 toISOString() 走 UTC 在台北 00:00-08:00 預設成昨天
    date: todayISO(),
    partyName: '',
    amount: 0,
    paymentMethod: 'cash',
    description: '',
    docNumber: '',
    category: '',
    notes: '',
    attachments: [],
    status: 'pending',
    signer_name: null,
    signed_at: null,
    signature_kind: null,
    has_signature: false,
    created_by_name: null,
    created_at: null,
  })
}

function openCreate() {
  editingId.value = null
  resetForm()
  dialogVisible.value = true
}

function openEdit(row: Record<string, unknown>) {
  editingId.value = row.id as number | null
  Object.assign(form, {
    date: row[config.fields.date.key],
    partyName: row[config.fields.partyName.key],
    amount: Number(row.amount),
    paymentMethod: row.payment_method,
    description: row.description || '',
    docNumber: row[config.fields.docNumber.key] || '',
    category: (row.category as string | undefined) || '',
    notes: row.notes || '',
    attachments: row.attachments || [],
    status: row.status,
    signer_name: row.signer_name,
    signed_at: row.signed_at,
    signature_kind: row.signature_kind,
    has_signature: row.has_signature,
    created_by_name: row.created_by_name,
    created_at: row.created_at,
  })
  dialogVisible.value = true
}

function openSign(row: Record<string, unknown>) {
  signingId.value = row.id as number | null
  signDialogVisible.value = true
}

function openSignFromDialog() {
  if (!editingId.value) return
  signingId.value = editingId.value
  dialogVisible.value = false
  signDialogVisible.value = true
}

function onRowClick(row: Record<string, unknown>) {
  openEdit(row)
}

function onRowCommand(command: string, row: Record<string, unknown>) {
  if (command === 'edit') openEdit(row)
  else if (command === 'delete') handleDelete(row)
}

async function handleSave() {
  if (!form.date || !form.partyName || form.amount == null || (config.category && !form.category)) {
    return ElMessage.warning(config.texts.requiredMsg)
  }
  saving.value = true
  try {
    const payload: Record<string, unknown> = {
      [config.fields.date.key]: form.date,
      [config.fields.partyName.key]: form.partyName,
      amount: form.amount,
      payment_method: form.paymentMethod,
      description: form.description || null,
      [config.fields.docNumber.key]: form.docNumber || null,
      notes: form.notes || null,
    }
    if (config.category) payload.category = form.category
    if (editingId.value) {
      await config.api.update(editingId.value, payload)
      ElMessage.success('更新成功')
    } else {
      await config.api.create(payload)
      ElMessage.success('新增成功')
    }
    dialogVisible.value = false
    refresh()
  } catch (e) {
    const err = e as { response?: { data?: { detail?: string } } }
    ElMessage.error(err?.response?.data?.detail || '操作失敗')
  } finally {
    saving.value = false
  }
}

async function handleDelete(row: Record<string, unknown>) {
  try {
    await ElMessageBox.confirm(
      `確定刪除「${row[config.fields.partyName.key]}」${config.texts.unitLabel}紀錄？此動作無法復原。`,
      '確認刪除',
      { type: 'warning', confirmButtonText: '確定刪除', confirmButtonClass: 'el-button--danger' },
    )
    await config.api.remove(row.id as number)
    ElMessage.success('已刪除')
    refresh()
  } catch (e) {
    const err = e as { response?: { data?: { detail?: string } } }
    if (e !== 'cancel') ElMessage.error(err?.response?.data?.detail || '刪除失敗')
  }
}

async function handleAttachmentUpload({ file }: { file: File }) {
  if (!editingId.value) return
  const fd = new FormData()
  fd.append('file', file)
  try {
    const res = await config.api.uploadAttachment(editingId.value, fd)
    form.attachments = [...(form.attachments || []), res.data as Attachment]
    ElMessage.success('附件已上傳')
    fetchList()
  } catch (e) {
    const err = e as { response?: { data?: { detail?: string } } }
    ElMessage.error(err?.response?.data?.detail || '上傳失敗')
  }
}

async function removeAttachment(key: string) {
  try {
    await ElMessageBox.confirm('確定刪除此附件？', '確認刪除', { type: 'warning' })
    await config.api.deleteAttachment(editingId.value as number, key)
    form.attachments = (form.attachments || []).filter((a) => a.key !== key)
    fetchList()
  } catch (e) {
    const err = e as { response?: { data?: { detail?: string } } }
    if (e !== 'cancel') ElMessage.error(err?.response?.data?.detail || '刪除失敗')
  }
}

function onSigned() {
  refresh()
}

function formatMoney(value: unknown) {
  return formatCurrency(Number(value ?? 0) || 0)
}

function isImageAttachment(att: Attachment) {
  if (att.mime_type) return att.mime_type.startsWith('image/')
  return /\.(png|jpe?g|webp)$/i.test(att.filename || '')
}

function signKindLabel(kind: string | null | undefined) {
  if (kind === 'photo') return '紙本照片'
  if (kind === 'drawn') return '當場手寫'
  return '已簽收'
}

function formatSize(bytes: number) {
  if (!bytes) return '0 B'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`
}

function formatDateTime(iso: string | null | undefined) {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('zh-TW')
}

async function tryOpenHighlight() {
  if (!props.highlightId) return
  try {
    const res = await config.api.get(props.highlightId)
    openEdit(res.data as Record<string, unknown>)
  } catch {
    ElMessage.warning(`找不到該筆${config.texts.unitLabel}紀錄`)
  }
}

onMounted(async () => {
  await Promise.all([fetchList(), fetchSummary()])
  await tryOpenHighlight()
})
```

**(b) `<template>` 依下表逐項修改**（未列者原樣保留；行號指原 `VendorPaymentView.vue`）：

| # | 原（行號） | 改為 |
|---|-----------|------|
| 1 | L2 `<div class="vendor-payment-view">` | `<div class="signoff-panel">` |
| 2 | L4-14 整個 `<header>`（含 h2） | 見下方片段 A——移除 h2（頁級標題由 FinanceSignoffView 提供），sub 與按鈕走 config |
| 3 | L20 `本期付款總額` | `{{ config.texts.kpiTotalLabel }}` |
| 4 | L25 `待廠商簽收` | `{{ config.texts.kpiPendingLabel }}` |
| 5 | L56-63 搜尋 `el-input` | `v-model="filters.partyName"`、`:placeholder="config.texts.searchPlaceholder"`（其餘屬性不變） |
| 6 | L63 之後（收付方式 select 之前） | 插入片段 B（類別篩選，`v-if="config.category"`） |
| 7 | L64-77 收付方式 select | `v-model="filters.paymentMethod"`（options 迴圈不變） |
| 8 | L93 date 欄 | `<el-table-column :prop="config.fields.date.key" :label="config.fields.date.label" width="116" />` |
| 9 | L94-98 party 欄 | `<el-table-column :prop="config.fields.partyName.key" :label="config.fields.partyName.label" min-width="160">`，cell 改 `<span class="so-party">{{ row[config.fields.partyName.key] }}</span>` |
| 10 | L98 之後（金額欄之前） | 插入片段 C（類別表格欄，`v-if="config.category"`） |
| 11 | L179-181 空狀態 | `{{ config.texts.emptyTitle }}` / `{{ config.texts.emptyHint }}` / 按鈕文字 `{{ config.texts.addButton }}` |
| 12 | L210 `請款資訊` | `{{ config.texts.formSectionTitle }}` |
| 13 | L212-222 表單日期 | `:label="config.fields.date.label"` 加在 el-form-item；`v-model="form.date"` |
| 14 | L223-232 表單收付方式 | `v-model="form.paymentMethod"` |
| 15 | L233-235 表單 party | `:label="config.texts.formPartyLabel"`、`v-model="form.partyName"`、`:placeholder="config.texts.formPartyPlaceholder"` |
| 16 | L235 之後（金額欄之前） | 插入片段 D（表單類別欄，`v-if="config.category"`，required） |
| 17 | L255 description placeholder | `:placeholder="config.texts.descPlaceholder"` |
| 18 | L258-260 發票／收據號 | el-form-item `:label="config.fields.docNumber.label"`；`v-model="form.docNumber"` |
| 19 | L270 簽收憑證 hint | `{{ config.texts.signedCertHint }}` |
| 20 | L296 附件 hint | `{{ config.texts.attachmentsHint }}` |
| 21 | L358-362 sign dialog | 片段 E |
| 22 | 全 template+style | class 前綴 `vp-` → `so-`；`.vp-vendor` → `.so-party` |

片段 A（header）：
```html
    <header class="so-header">
      <p class="so-header__sub">{{ config.texts.headerSub }}</p>
      <el-button
        v-if="canWrite"
        type="primary"
        @click="openCreate"
      >{{ config.texts.addButton }}</el-button>
    </header>
```

片段 B（類別篩選；插在搜尋 input 之後、收付方式 select 之前，對齊原 MiscReceiptView 順序）：
```html
        <el-select
          v-if="config.category"
          v-model="filters.category"
          :placeholder="config.category.label"
          clearable
          style="width: 140px"
          @change="refresh"
        >
          <el-option
            v-for="opt in config.category.options"
            :key="opt.value"
            :label="opt.label"
            :value="opt.value"
          />
        </el-select>
```

片段 C（類別表格欄；插在 party 欄之後、金額欄之前）：
```html
      <el-table-column v-if="config.category" :label="config.category.label" width="104">
        <template #default="{ row }">
          {{ config.category.labelOf(String(row.category ?? '')) }}
        </template>
      </el-table-column>
```

片段 D（表單類別欄；插在 party form-item 之後、金額 form-item 之前）：
```html
            <el-form-item v-if="config.category" :label="config.category.label" required class="so-form__col-2">
              <el-select v-model="form.category" style="width: 100%" :disabled="!canWrite">
                <el-option
                  v-for="opt in config.category.options"
                  :key="opt.value"
                  :label="opt.label"
                  :value="opt.value"
                />
              </el-select>
            </el-form-item>
```

片段 E（sign dialog）：
```html
    <SignoffSignDialog
      v-model="signDialogVisible"
      :record-id="signingId"
      :config="config"
      @signed="onSigned"
    />
```

**(c) `<style scoped>`：** 全部保留後做兩處調整：① `sed` 式全域替換 `vp-` → `so-`、`.vendor-payment-view` → `.signoff-panel`、`.vp-vendor`（已隨①變 `.so-vendor`）→ `.so-party`（template 同步）；② `.signoff-panel` 規則移除 `padding`（外層 FinanceSignoffView 統一提供頁面 padding）。

**注意**：若 `npm run typecheck` 對 template 內 `row.payment_method` / `row.attachments` 等 unknown 取用報錯，比照原 `MiscReceiptView.vue` 的寫法補 `as string` / `as Attachment[] | undefined` 斷言（僅允許具體型別斷言，禁 `as any`）。

- [ ] **Step 4: 跑測試確認通過**

```bash
cd ~/Desktop/ivy-frontend && npx vitest run src/components/signoff/__tests__/SignoffPanel.spec.ts && npm run typecheck && npm run lint
```
預期：PASS（22 個案例：11 案例 × 2 config − misc 限定 2 案例只跑一邊 + highlight 案例 × 2）。

- [ ] **Step 5: 硬編文案掃描（Global Constraints 驗證）**

```bash
cd ~/Desktop/ivy-frontend && grep -n "廠商\|繳款方\|請款\|發票" src/components/signoff/SignoffPanel.vue src/components/signoff/SignoffSignDialog.vue
```
預期：無輸出（全部文案已走 config）。有輸出即改掉再跑一次。

- [ ] **Step 6: Commit**

```bash
cd ~/Desktop/ivy-frontend && git add src/components/signoff/ && git commit -m "feat: 新增 SignoffPanel 共用面板（廠商付款/雜項收款一套碼）

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 5: 整合頁 `FinanceSignoffView.vue`

**Files:**
- Create: `src/views/FinanceSignoffView.vue`
- Create: `src/views/__tests__/FinanceSignoffView.spec.ts`

**Interfaces:**
- Consumes: `SIGNOFF_MODULES`、`hasPermission`、Task 4 `SignoffPanel`。
- Produces: 路由元件 `/finance-signoffs`（Task 6 掛載）。行為：依 READ 權限過濾可見模組；>1 個才顯示 tab bar；`?tab` 無效值 fallback 第一個可見模組；切 tab 以 `router.replace` 回寫 `?tab` 並清掉 `?highlight`；`?highlight` 解析為 number 傳給面板。

- [ ] **Step 1: 寫失敗測試**

建 `src/views/__tests__/FinanceSignoffView.spec.ts`：

```ts
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount } from '@vue/test-utils'

const replaceMock = vi.fn()
let mockQuery: Record<string, string> = {}

vi.mock('vue-router', () => ({
  useRoute: () => ({ query: mockQuery }),
  useRouter: () => ({ replace: replaceMock }),
}))
vi.mock('@/utils/auth', () => ({ hasPermission: vi.fn().mockReturnValue(true) }))

import { hasPermission } from '@/utils/auth'
import FinanceSignoffView from '../FinanceSignoffView.vue'

const PanelStub = {
  props: ['config', 'highlightId'],
  template: '<div class="panel-stub" :data-key="config.key" :data-highlight="highlightId ?? \'\'" />',
}

const globalStubs = {
  SignoffPanel: PanelStub,
  'el-tabs': { template: '<div class="tabs-stub"><slot /></div>', props: ['modelValue'] },
  'el-tab-pane': { template: '<div class="tab-pane-stub" :data-label="label" />', props: ['label', 'name'] },
}

const mountView = () =>
  mount(FinanceSignoffView, { global: { stubs: globalStubs } })

describe('FinanceSignoffView', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockQuery = {}
    vi.mocked(hasPermission).mockReturnValue(true)
  })

  it('雙權限：顯示兩個 tab，預設第一個（vendor）', () => {
    const wrapper = mountView()
    expect(wrapper.find('.tabs-stub').exists()).toBe(true)
    expect(wrapper.findAll('.tab-pane-stub')).toHaveLength(2)
    expect(wrapper.find('.panel-stub').attributes('data-key')).toBe('vendor')
    expect(wrapper.text()).toContain('收支簽收')
  })

  it('?tab=misc 時顯示 misc 面板', () => {
    mockQuery = { tab: 'misc' }
    const wrapper = mountView()
    expect(wrapper.find('.panel-stub').attributes('data-key')).toBe('misc')
  })

  it('?tab 無效值 fallback 到第一個可見模組', () => {
    mockQuery = { tab: 'nonsense' }
    const wrapper = mountView()
    expect(wrapper.find('.panel-stub').attributes('data-key')).toBe('vendor')
  })

  it('只有 MISC_RECEIPT_READ：不顯示 tab bar、直接渲染 misc 面板', () => {
    vi.mocked(hasPermission).mockImplementation((p: string) => p === 'MISC_RECEIPT_READ')
    const wrapper = mountView()
    expect(wrapper.find('.tabs-stub').exists()).toBe(false)
    expect(wrapper.find('.panel-stub').attributes('data-key')).toBe('misc')
  })

  it('?highlight=7 解析為 number 傳給面板；非數字忽略', () => {
    mockQuery = { tab: 'vendor', highlight: '7' }
    expect(mountView().find('.panel-stub').attributes('data-highlight')).toBe('7')
    mockQuery = { tab: 'vendor', highlight: 'abc' }
    expect(mountView().find('.panel-stub').attributes('data-highlight')).toBe('')
  })
})
```

- [ ] **Step 2: 跑測試確認失敗**

```bash
cd ~/Desktop/ivy-frontend && npx vitest run src/views/__tests__/FinanceSignoffView.spec.ts
```
預期：FAIL（元件不存在）。

- [ ] **Step 3: 建 `src/views/FinanceSignoffView.vue`**（完整檔案）

```vue
<template>
  <div class="finance-signoff-view">
    <header class="fs-header">
      <h2>收支簽收</h2>
      <p class="fs-header__sub">登錄廠商付款與雜項收款，收集簽收憑證留存稽核</p>
    </header>

    <el-tabs v-if="visibleModules.length > 1" v-model="activeKey" class="fs-tabs">
      <el-tab-pane
        v-for="m in visibleModules"
        :key="m.key"
        :label="m.tabLabel"
        :name="m.key"
      />
    </el-tabs>

    <SignoffPanel
      v-if="activeModule"
      :key="activeModule.key"
      :config="activeModule"
      :highlight-id="highlightId"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { hasPermission } from '@/utils/auth'
import { SIGNOFF_MODULES, type SignoffModuleConfig } from '@/config/signoffModules'
import SignoffPanel from '@/components/signoff/SignoffPanel.vue'

const route = useRoute()
const router = useRouter()

const visibleModules = computed<SignoffModuleConfig[]>(() =>
  SIGNOFF_MODULES.filter((m) => hasPermission(m.permissions.read)),
)

function resolveKeyFromRoute(): string {
  const q = route.query.tab
  const hit = visibleModules.value.find((m) => m.key === q)
  return hit?.key ?? visibleModules.value[0]?.key ?? ''
}

const activeKey = ref<string>(resolveKeyFromRoute())

watch(
  () => route.query.tab,
  () => {
    activeKey.value = resolveKeyFromRoute()
  },
)

// tab → query 回寫（比照 OvertimeView 慣例）；換 tab 順帶清 highlight，
// 避免舊 id 打到另一個模組的 GET 端點
watch(activeKey, async (value) => {
  const current = typeof route.query.tab === 'string' ? route.query.tab : undefined
  if (value === current) return
  const nextQuery = { ...route.query, tab: value }
  delete nextQuery.highlight
  await router.replace({ query: nextQuery })
})

const activeModule = computed(
  () => visibleModules.value.find((m) => m.key === activeKey.value) ?? null,
)

const highlightId = computed<number | null>(() => {
  const raw = route.query.highlight
  const id = Number(Array.isArray(raw) ? raw[0] : raw)
  return Number.isInteger(id) && id > 0 ? id : null
})
</script>

<style scoped>
.finance-signoff-view {
  padding: var(--space-4, 16px);
}
.fs-header {
  margin-bottom: var(--space-4, 16px);
}
.fs-header h2 {
  margin: 0;
  font-size: var(--text-2xl, 20px);
  font-weight: var(--font-weight-semibold, 600);
  color: var(--text-primary, #1e293b);
}
.fs-header__sub {
  margin: 4px 0 0;
  font-size: var(--text-sm, 13px);
  color: var(--text-secondary, #64748b);
}
.fs-tabs {
  margin-bottom: var(--space-2, 8px);
}
</style>
```

- [ ] **Step 4: 跑測試確認通過**

```bash
cd ~/Desktop/ivy-frontend && npx vitest run src/views/__tests__/FinanceSignoffView.spec.ts && npm run typecheck
```
預期：PASS。

- [ ] **Step 5: Commit**

```bash
cd ~/Desktop/ivy-frontend && git add src/views/FinanceSignoffView.vue src/views/__tests__/FinanceSignoffView.spec.ts && git commit -m "feat: 新增收支簽收整合頁 FinanceSignoffView

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 6: 路由與權限規則

**Files:**
- Modify: `src/router/index.ts:196-206`（兩條路由改為新頁 + 兩條 redirect）
- Modify: `src/constants/permissions.ts:172-175` 附近（ROUTE_PERMISSION_RULES 換規則）
- Create: `src/router/__tests__/financeSignoffRoutes.spec.ts`

**Interfaces:**
- Consumes: Task 5 的 `FinanceSignoffView.vue`。
- Produces: 路由 `/finance-signoffs`（name `finance-signoffs`、meta.title `收支簽收`）；`/vendor-payments` → redirect `?tab=vendor`（query 透傳）；`/misc-receipts` → redirect `?tab=misc`。`ROUTE_PERMISSION_RULES` 對 `/finance-signoffs` 掛兩條規則（OR 語意，`canAccessRoute` / `getAllowedRoutes` 既有機制原生支援同 path 多條）。

- [ ] **Step 1: 寫失敗測試**

建 `src/router/__tests__/financeSignoffRoutes.spec.ts`：

```ts
import { describe, it, expect } from 'vitest'
import type { RouteRecordRaw } from 'vue-router'
import router from '@/router'
import { ROUTE_PERMISSION_RULES } from '@/constants/permissions'

type RedirectFn = (to: { query: Record<string, string> }) => { path: string; query: Record<string, string> }

function flatten(routes: readonly RouteRecordRaw[]): RouteRecordRaw[] {
  return routes.flatMap((r) => [r, ...flatten((r.children ?? []) as RouteRecordRaw[])])
}

const all = flatten(router.options.routes)

describe('收支簽收路由', () => {
  it('/finance-signoffs 存在且標題為收支簽收', () => {
    const rec = all.find((r) => r.path === '/finance-signoffs')
    expect(rec).toBeTruthy()
    expect(rec?.meta?.title).toBe('收支簽收')
  })

  it('/vendor-payments redirect 到 vendor tab 並透傳 query（含 highlight）', () => {
    const rec = all.find((r) => r.path === '/vendor-payments')
    expect(rec?.redirect).toBeTypeOf('function')
    const target = (rec?.redirect as RedirectFn)({ query: { highlight: '5' } })
    expect(target.path).toBe('/finance-signoffs')
    expect(target.query).toMatchObject({ tab: 'vendor', highlight: '5' })
  })

  it('/misc-receipts redirect 到 misc tab 並透傳 query', () => {
    const rec = all.find((r) => r.path === '/misc-receipts')
    expect(rec?.redirect).toBeTypeOf('function')
    const target = (rec?.redirect as RedirectFn)({ query: { highlight: '9' } })
    expect(target.path).toBe('/finance-signoffs')
    expect(target.query).toMatchObject({ tab: 'misc', highlight: '9' })
  })

  it('權限規則：/finance-signoffs 兩碼任一（OR）、舊路徑規則移除', () => {
    const rules = ROUTE_PERMISSION_RULES.filter((r) => r.path === '/finance-signoffs')
    expect(rules.map((r) => r.permission).sort()).toEqual([
      'MISC_RECEIPT_READ',
      'VENDOR_PAYMENT_READ',
    ])
    expect(ROUTE_PERMISSION_RULES.some((r) => r.path === '/vendor-payments')).toBe(false)
    expect(ROUTE_PERMISSION_RULES.some((r) => r.path === '/misc-receipts')).toBe(false)
  })
})
```

註：import `@/router` 會註冊全域 guard 但不觸發導航，happy-dom 下 localStorage 可用，預期可直接 import。若 module side-effect 造成掛載失敗，在本 spec 頂部加：

```ts
vi.mock('@/utils/auth', () => ({
  isLoggedIn: vi.fn().mockReturnValue(false),
  canAccessRoute: vi.fn().mockReturnValue(true),
  getUserInfo: vi.fn().mockReturnValue(null),
  getAllowedRoutes: vi.fn().mockReturnValue([]),
  hasStoredUserInfo: vi.fn().mockReturnValue(false),
  setUserInfo: vi.fn(),
  clearAuth: vi.fn(),
  hasPortalPermission: vi.fn().mockReturnValue(false),
  hasPermission: vi.fn().mockReturnValue(false),
}))
```

- [ ] **Step 2: 跑測試確認失敗**

```bash
cd ~/Desktop/ivy-frontend && npx vitest run src/router/__tests__/financeSignoffRoutes.spec.ts
```
預期：FAIL（`/finance-signoffs` 不存在）。

- [ ] **Step 3: 改 `src/router/index.ts`**

把現有兩條（196-206 行）：

```ts
        {
            path: '/vendor-payments',
            name: 'vendor-payments',
            component: () => import('../views/VendorPaymentView.vue'),
            meta: { title: '廠商付款簽收' }
        },
        {
            path: '/misc-receipts',
            name: 'misc-receipts',
            component: () => import('../views/MiscReceiptView.vue'),
            meta: { title: '雜項收款簽收' }
        },
```

替換為：

```ts
        {
            path: '/finance-signoffs',
            name: 'finance-signoffs',
            component: () => import('../views/FinanceSignoffView.vue'),
            meta: { title: '收支簽收' }
        },
        // 舊入口 redirect：保留書籤與稽核深連結（?highlight 等 query 原樣透傳）
        {
            path: '/vendor-payments',
            name: 'vendor-payments',
            redirect: (to) => ({ path: '/finance-signoffs', query: { ...to.query, tab: 'vendor' } }),
            meta: { title: '廠商付款簽收' }
        },
        {
            path: '/misc-receipts',
            name: 'misc-receipts',
            redirect: (to) => ({ path: '/finance-signoffs', query: { ...to.query, tab: 'misc' } }),
            meta: { title: '雜項收款簽收' }
        },
```

- [ ] **Step 4: 改 `src/constants/permissions.ts`**

把：

```ts
  // 廠商付款簽收（園務行政）
  { path: '/vendor-payments', permission: 'VENDOR_PAYMENT_READ' },
  // 雜項收款簽收（園務行政）
  { path: '/misc-receipts', permission: 'MISC_RECEIPT_READ' },
```

替換為：

```ts
  // 收支簽收（園務行政）：廠商付款／雜項收款任一 READ 即可進整合頁（OR 語意，比照 /overtime）。
  // 舊 /vendor-payments、/misc-receipts 已改 redirect，guard 收到的 to 是新路由，舊規則移除。
  { path: '/finance-signoffs', permission: 'VENDOR_PAYMENT_READ' },
  { path: '/finance-signoffs', permission: 'MISC_RECEIPT_READ' },
```

- [ ] **Step 5: 跑測試確認通過（含全套權限/路由既有測試）**

```bash
cd ~/Desktop/ivy-frontend && npx vitest run src/router/__tests__/financeSignoffRoutes.spec.ts && npx vitest run tests/ src/utils/__tests__ 2>/dev/null || npx vitest run src/router/__tests__/financeSignoffRoutes.spec.ts tests/
```
預期：新 spec PASS；`tests/` 樹既有 auth / router 相關測試無回歸。若有既有測試斷言 `/vendor-payments` 規則存在，依新行為更新該測試（斷言改為 `/finance-signoffs` OR 規則）。

- [ ] **Step 6: Commit**

```bash
cd ~/Desktop/ivy-frontend && git add src/router/ src/constants/permissions.ts && git commit -m "feat: 收支簽收路由與權限規則（舊路由 redirect 保留深連結）

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 7: 側欄整併單一入口

**Files:**
- Modify: `src/components/layout/AdminSidebar.vue:120-127`（兩項合一）、`:237`（移除 `Coin` import）
- Modify: `tests/unit/components/layout/AdminSidebar.test.js:159-165`（斷言更新）

**Interfaces:**
- Consumes: Task 6 路由 `/finance-signoffs`。
- Produces: 側欄「園務行政」單一入口「收支簽收」；`hasVisibleAdminItems` 不需改（既已 OR 兩個 READ）。

- [ ] **Step 1: 更新測試（先紅）**

`tests/unit/components/layout/AdminSidebar.test.js` 把既有案例：

```js
  it('「廠商付款簽收」保留在園務行政', async () => {
    const wrapper = await mountSidebar()
    const item = wrapper.find('[data-index="/vendor-payments"]')
    expect(item.exists()).toBe(true)
    expect(item.text()).toContain('廠商付款簽收')
  })
```

替換為：

```js
  it('「收支簽收」整合入口在園務行政（廠商付款/雜項收款已整併）', async () => {
    const wrapper = await mountSidebar()
    const item = wrapper.find('[data-index="/finance-signoffs"]')
    expect(item.exists()).toBe(true)
    expect(item.text()).toContain('收支簽收')
    expect(wrapper.find('[data-index="/vendor-payments"]').exists()).toBe(false)
    expect(wrapper.find('[data-index="/misc-receipts"]').exists()).toBe(false)
  })
```

- [ ] **Step 2: 跑測試確認失敗**

```bash
cd ~/Desktop/ivy-frontend && npx vitest run tests/unit/components/layout/AdminSidebar.test.js
```
預期：新案例 FAIL。

- [ ] **Step 3: 改側欄**

`src/components/layout/AdminSidebar.vue` 把（120-127 行）：

```html
          <el-menu-item v-if="canView.VENDOR_PAYMENT_READ" index="/vendor-payments">
            <el-icon><Money /></el-icon>
            <template #title>廠商付款簽收</template>
          </el-menu-item>
          <el-menu-item v-if="canView.MISC_RECEIPT_READ" index="/misc-receipts">
            <el-icon><Coin /></el-icon>
            <template #title>雜項收款簽收</template>
          </el-menu-item>
```

替換為：

```html
          <el-menu-item
            v-if="canView.VENDOR_PAYMENT_READ || canView.MISC_RECEIPT_READ"
            index="/finance-signoffs"
          >
            <el-icon><Money /></el-icon>
            <template #title>收支簽收</template>
          </el-menu-item>
```

並從 import（237 行 `Money, Coin, User, School, ...`）移除 `Coin`（此檔僅 125 行使用；`Money` 另有 49/149 行使用，保留）。`hasVisibleAdminItems`（314-317 行）不動。

- [ ] **Step 4: 跑測試確認通過**

```bash
cd ~/Desktop/ivy-frontend && npx vitest run tests/unit/components/layout/AdminSidebar.test.js && npm run typecheck
```
預期：PASS（含該檔其餘既有案例）。

- [ ] **Step 5: Commit**

```bash
cd ~/Desktop/ivy-frontend && git add src/components/layout/AdminSidebar.vue tests/unit/components/layout/AdminSidebar.test.js && git commit -m "feat: 側欄整併收支簽收單一入口

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 8: 稽核深連結與月損益入口改指新頁（含補雜項映射缺口）

**Files:**
- Modify: `src/views/AuditLogView.vue:52-57`（ENTITY_ROUTES）
- Modify: `src/views/reports/MonthlyPnLPanel.vue:178` 附近（alert 內 router-link）

**Interfaces:**
- Consumes: Task 6 redirect 與新路由（`?tab=…&highlight=…` 由 FinanceSignoffView / SignoffPanel 消化）。
- Produces: 稽核 log 的 `vendor_payment` **與**（新增）`misc_receipt` 皆可深連結到對應 tab；月損益 alert 導到 vendor tab。

- [ ] **Step 1: 改 `AuditLogView.vue`**

把：

```ts
  // 廠商付款：列表頁支援 ?highlight=<id> 自動開啟該筆編輯 dialog
  vendor_payment: (id) =>
    id ? { path: '/vendor-payments', query: { highlight: String(id) } } : null,
```

替換為：

```ts
  // 收支簽收：整合頁支援 ?tab=<模組>&highlight=<id> 自動開啟該筆編輯 dialog
  vendor_payment: (id) =>
    id ? { path: '/finance-signoffs', query: { tab: 'vendor', highlight: String(id) } } : null,
  misc_receipt: (id) =>
    id ? { path: '/finance-signoffs', query: { tab: 'misc', highlight: String(id) } } : null,
```

- [ ] **Step 2: 改 `MonthlyPnLPanel.vue`**

把 alert title：

```html
          以下項目尚未自動整合，可至「廠商付款」模組（<router-link :to="{ name: 'vendor-payments' }">廠商付款簽收</router-link>）登錄
```

替換為：

```html
          以下項目尚未自動整合，可至「收支簽收」的「廠商付款」分頁（<router-link :to="{ path: '/finance-signoffs', query: { tab: 'vendor' } }">收支簽收</router-link>）登錄
```

（既有測試 `tests/unit/views/reports/MonthlyPnLPanel.spec.js` 斷言 alert 文字含「廠商付款」——新文案仍含，不需改測試。）

- [ ] **Step 3: 跑相關測試**

```bash
cd ~/Desktop/ivy-frontend && npx vitest run tests/unit/views/reports/MonthlyPnLPanel.spec.js src/views/__tests__/AuditLogView.spec.js src/views/__tests__/AuditLogView.export-error.test.ts
```
預期：PASS。

- [ ] **Step 4: Commit**

```bash
cd ~/Desktop/ivy-frontend && git add src/views/AuditLogView.vue src/views/reports/MonthlyPnLPanel.vue && git commit -m "fix: 稽核深連結與月損益入口改指收支簽收（補雜項收款映射缺口）

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 9: 刪除舊檔 + 全量 gate

**Files:**
- Delete: `src/views/VendorPaymentView.vue`、`src/views/MiscReceiptView.vue`、`src/components/VendorPaymentSignDialog.vue`、`src/components/MiscReceiptSignDialog.vue`、`src/views/__tests__/VendorPaymentView.spec.js`（案例已於 Task 4 遷移並參數化）
- Keep: `src/api/__tests__/miscReceipt.spec.ts`（re-export 相容性回歸）

- [ ] **Step 1: 確認無殘留 import**

```bash
cd ~/Desktop/ivy-frontend && grep -rn "VendorPaymentView\|MiscReceiptView\|VendorPaymentSignDialog\|MiscReceiptSignDialog" src/ tests/ --include="*.vue" --include="*.ts" --include="*.js" | grep -v "^src/views/VendorPaymentView.vue\|^src/views/MiscReceiptView.vue\|^src/components/VendorPaymentSignDialog.vue\|^src/components/MiscReceiptSignDialog.vue\|^src/views/__tests__/VendorPaymentView.spec.js"
```
預期輸出僅剩 `src/views/EmployeeView.vue:522` 的**註解**（「比照 LeaveView / VendorPaymentView」）——順手把該註解字樣改為「比照 LeaveView / SignoffPanel」。router 的 import 應已在 Task 6 移除；若還有其他真實 import，回頭修正對應 task。

- [ ] **Step 2: 刪檔**

```bash
cd ~/Desktop/ivy-frontend && git rm src/views/VendorPaymentView.vue src/views/MiscReceiptView.vue src/components/VendorPaymentSignDialog.vue src/components/MiscReceiptSignDialog.vue src/views/__tests__/VendorPaymentView.spec.js
```

- [ ] **Step 3: 全量 gate（三項全綠才可 commit）**

```bash
cd ~/Desktop/ivy-frontend && npm test && npm run typecheck && npm run lint
```
預期：全 PASS / 0 error。任何一項紅：修好再跑，不得帶紅 commit。

- [ ] **Step 4: Commit**

```bash
cd ~/Desktop/ivy-frontend && git add -u && git commit -m "refactor: 移除舊廠商付款/雜項收款頁面與簽名板（已併入收支簽收）

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 10: 整合驗證（真實瀏覽器）

**Files:** 無（驗證步驟）

- [ ] **Step 1: 起兩端 dev server**

在另一個終端（`start.sh` 為長駐前景 launcher，**不可**用背景執行）：

```bash
cd ~/Desktop/ivyManageSystem && ./start.sh
```

- [ ] **Step 2: 以 admin（本地帳密 admin / ivytest123）走過 critical path**

1. 側欄「園務行政」只剩「收支簽收」一項；點入預設「廠商付款」tab，KPI 三卡與列表正常。
2. 切「雜項收款」tab：URL 變 `#/finance-signoffs?tab=misc`，出現「類別」篩選與表格欄。
3. 各 tab 新增一筆（misc 必填類別）→ 列表出現、KPI 待簽收 +1。
4. 對剛建的一筆點「簽收」→ 手寫 canvas 簽名 → 確認簽收 → 狀態翻「已簽收」、簽收人正確。
5. 已簽收列：下拉無「刪除」，明細顯示簽收憑證縮圖。
6. 手打舊網址 `#/vendor-payments?highlight=<剛建 id>` → 自動轉到 `#/finance-signoffs?tab=vendor&highlight=…` 並開啟該筆編輯 dialog；`#/misc-receipts` 同理轉 misc tab。
7. 操作紀錄頁（/audit-logs）找一筆 `雜項收款` 事件 → 點 entity 連結 → 落在 misc tab 並開啟該筆。
8. 報表 → 月損益：pending 項 alert 的「收支簽收」連結導到 vendor tab。

- [ ] **Step 3: 清理驗證資料**

把步驟 2 建立的**未簽收**測試資料刪除；**已簽收**的一筆為終態不可刪（後端 409 by design），保留於 dev DB 無妨（dev 環境）。

- [ ] **Step 4: 收尾**

依 superpowers:finishing-a-development-branch 處理分支整合（merge 進 local main）。提醒：workspace DoD 的 push / CI 綠 / finish-check 由 user 決定時點（push 會觸發 Zeabur 部署）。

---

## Self-Review 紀錄

- **Spec coverage**：資訊架構（Task 5/6/7）、config 驅動元件（Task 1-4）、行為細節（tab 獨立狀態 = `:key` remount：Task 5；深連結：Task 4/5/6/8；月損益連結：Task 8）、測試遷移與刪檔（Task 4/9）、整合驗證 gate（Task 10）——spec 各節皆有對應 task。
- **Placeholder**：全部步驟含完整程式碼或精確 before/after；無 TBD。
- **型別一致性**：`SignoffModuleConfig` / `SignoffModuleApi` / `SignoffSummary` / `SIGNOFF_MODULES` 命名在 Task 2 定義、Task 3/4/5 消費處逐一核對一致；`recordId` prop（Task 3）與 Task 4 片段 E `:record-id` 一致；`highlightId` prop（Task 4）與 Task 5 `:highlight-id` 一致。
