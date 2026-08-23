/**
 * 收付款管理模組設定：廠商付款（支出側）與雜項收款（收入側）為後端鏡像孿生模組，
 * 前端以同一套 SignoffPanel / SignoffSignDialog 渲染，僅注入不同的 api、欄位映射與文案。
 * 新增文案差異一律加進 texts，共用元件內不得硬編 vendor/misc 特定字樣。
 *
 * 2026-08 方案 A 內控：新增 submit/approve/settle/reconcile/events 五個流程 api
 * 與 APPROVE/SETTLE/RECONCILE 三個動作權限；「簽收」語意收斂為「憑證」。
 */
import type { PermissionName } from '@/constants/permissions'
import { PERMISSION_NAMES } from '@/constants/permissions'
import {
  CATEGORY_OPTIONS,
  categoryLabel,
  VENDOR_CATEGORY_OPTIONS,
  vendorCategoryLabel,
  type PaymentMethod,
} from '@/constants/signoff'
import type { SignoffDirection } from '@/utils/financeSignoff'
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
  submitVendorPayment,
  approveVendorPayment,
  settleVendorPayment,
  reconcileVendorPayment,
  listVendorPaymentEvents,
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
  submitMiscReceipt,
  approveMiscReceipt,
  settleMiscReceipt,
  reconcileMiscReceipt,
  listMiscReceiptEvents,
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
  // ── 內控流程（方案 A）──
  submit: (id: number) => ReturnType<ApiCall>
  approve: (
    id: number,
    data: { decision: 'approve' | 'reject'; reason?: string | null },
  ) => ReturnType<ApiCall>
  settle: (
    id: number,
    data: {
      actual_date: string
      payment_method?: PaymentMethod | null
      transaction_ref?: string | null
    },
  ) => ReturnType<ApiCall>
  reconcile: (
    id: number,
    data: { result: 'reconciled' | 'exception'; note?: string | null },
  ) => ReturnType<ApiCall>
  events: (id: number) => ReturnType<ApiCall>
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
  searchPlaceholder: string
  formSectionTitle: string
  formPartyLabel: string
  formPartyPlaceholder: string
  descPlaceholder: string
  /** 憑證區說明（不強迫「簽名」語言：簽收單/匯款證明/其他收付憑證皆可） */
  signedCertHint: string
  attachmentsHint: string
  emptyTitle: string
  emptyHint: string
  /** '付款' / '收款'：組合「檢視＋單位」「刪除確認」「找不到該筆…」等句 */
  unitLabel: string
  requiredMsg: string
  signTitle: string
  signUploadHint: string
  signPadHint: string
  /** 預計日期欄位標題（與「實際收付日期」明確區分） */
  plannedDateLabel: string
  /** 實際收付日期欄位標題（settle 對話框） */
  actualDateLabel: string
  settleAction: string
}

export interface SignoffModuleConfig {
  key: SignoffDirection
  tabLabel: string
  api: SignoffModuleApi
  fields: {
    partyName: SignoffField
    date: SignoffField
    plannedDate: SignoffField
    docNumber: SignoffField
  }
  /** null 時面板不渲染類別篩選／表格欄／表單欄（現行 vendor／misc 兩模組皆有設定） */
  category: {
    label: string
    options: ReadonlyArray<{ value: string; label: string }>
    labelOf: (value: string) => string
  } | null
  permissions: {
    read: PermissionName
    write: PermissionName
    approve: PermissionName
    settle: PermissionName
    reconcile: PermissionName
  }
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
    submit: submitVendorPayment,
    approve: approveVendorPayment,
    settle: settleVendorPayment,
    reconcile: reconcileVendorPayment,
    events: listVendorPaymentEvents,
  },
  fields: {
    partyName: { key: 'vendor_name', label: '廠商' },
    date: { key: 'payment_date', label: '實際付款日' },
    plannedDate: { key: 'due_date', label: '預計付款日' },
    docNumber: { key: 'invoice_number', label: '發票／收據號' },
  },
  category: {
    label: '類別',
    options: VENDOR_CATEGORY_OPTIONS,
    labelOf: vendorCategoryLabel,
  },
  permissions: {
    read: PERMISSION_NAMES.VENDOR_PAYMENT_READ,
    write: PERMISSION_NAMES.VENDOR_PAYMENT_WRITE,
    approve: PERMISSION_NAMES.VENDOR_PAYMENT_APPROVE,
    settle: PERMISSION_NAMES.VENDOR_PAYMENT_SETTLE,
    reconcile: PERMISSION_NAMES.VENDOR_PAYMENT_RECONCILE,
  },
  texts: {
    headerSub: '登記廠商請款，走送審、核准、付款到對帳的完整流程',
    addButton: '新增付款',
    searchPlaceholder: '搜尋廠商名稱',
    formSectionTitle: '請款資訊',
    formPartyLabel: '廠商名稱',
    formPartyPlaceholder: '例：好棒棒清潔用品行',
    descPlaceholder: '例：5 月清潔用品',
    signedCertHint: '上傳簽收單、匯款證明或其他收付憑證（1 張）',
    attachmentsHint: '發票、請款單等補充文件（最多 5 張）',
    emptyTitle: '尚無廠商付款紀錄',
    emptyHint: '點「新增付款」開始登記第一筆廠商請款。',
    unitLabel: '付款',
    requiredMsg: '請填寫廠商、類別與金額',
    signTitle: '付款憑證',
    signUploadHint: '簽收單、匯款證明或其他收付憑證照片，PNG／JPG／WEBP',
    signPadHint: '請廠商於上方框內簽名',
    plannedDateLabel: '預計付款日',
    actualDateLabel: '實際付款日',
    settleAction: '確認付款',
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
    submit: submitMiscReceipt,
    approve: approveMiscReceipt,
    settle: settleMiscReceipt,
    reconcile: reconcileMiscReceipt,
    events: listMiscReceiptEvents,
  },
  fields: {
    partyName: { key: 'payer_name', label: '繳款方/來源' },
    date: { key: 'receipt_date', label: '實際收款日' },
    plannedDate: { key: 'expected_receipt_date', label: '預計收款日' },
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
    approve: PERMISSION_NAMES.MISC_RECEIPT_APPROVE,
    settle: PERMISSION_NAMES.MISC_RECEIPT_SETTLE,
    reconcile: PERMISSION_NAMES.MISC_RECEIPT_RECONCILE,
  },
  texts: {
    headerSub: '登記雜項收款，收到錢立即入帳，再走送審與對帳',
    addButton: '新增收款',
    searchPlaceholder: '搜尋繳款方/來源',
    formSectionTitle: '收款資訊',
    formPartyLabel: '繳款方/來源',
    formPartyPlaceholder: '例：台北市教育局',
    descPlaceholder: '例：場地租金補助款',
    signedCertHint: '上傳收款憑證：簽收單、匯款證明或入帳截圖（1 張）',
    attachmentsHint: '收據、補助文件等補充資料（最多 5 張）',
    emptyTitle: '尚無雜項收款紀錄',
    emptyHint: '點「新增收款」開始登記第一筆雜項收款。',
    unitLabel: '收款',
    requiredMsg: '請填寫繳款方、類別與金額',
    signTitle: '收款憑證',
    signUploadHint: '簽收單、匯款證明或入帳截圖照片，PNG／JPG／WEBP',
    signPadHint: '請繳款方於上方框內簽名',
    plannedDateLabel: '預計收款日',
    actualDateLabel: '實際收款日',
    settleAction: '登記收款',
  },
}

export const SIGNOFF_MODULES: readonly SignoffModuleConfig[] = [
  VENDOR_SIGNOFF_MODULE,
  MISC_SIGNOFF_MODULE,
]
