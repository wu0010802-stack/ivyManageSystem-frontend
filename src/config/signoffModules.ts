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
