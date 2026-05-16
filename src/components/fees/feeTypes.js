// 學費類型定義（兩 Tab 共用）
//
// source = 'record'      → StudentFeeRecord（正金額應收）
// source = 'adjustment'  → StudentFeeAdjustment（從應收中扣除）
//
// 順序對齊紙本表單；學費等同註冊費，不另設欄位。
export const FEE_TYPES = [
  { value: 'registration', label: '註冊費', source: 'record', backend_key: 'registration' },
  { value: 'miscellaneous', label: '雜費', source: 'record', backend_key: 'miscellaneous' },
  { value: 'monthly', label: '月費', source: 'record', backend_key: 'monthly' },
  { value: 'transport', label: '交通費', source: 'record', backend_key: 'transport' },
  { value: 'leave_or_other', label: '其他/請假', source: 'adjustment', adj_type: 'leave_deduction' },
  { value: 'sibling_discount', label: '同胞優惠', source: 'adjustment', adj_type: 'sibling_discount' },
  { value: 'summer_uniform', label: '夏制', source: 'record', backend_key: 'summer_uniform' },
  { value: 'summer_sports', label: '夏運', source: 'record', backend_key: 'summer_sports' },
  { value: 'prepayment', label: '預繳', source: 'adjustment', adj_type: 'prepayment' },
  { value: 'material', label: '代購品', source: 'record', backend_key: 'material' },
  { value: 'insurance', label: '保險費', source: 'record', backend_key: 'insurance' },
]

// backend fee_type → 樞紐欄位 value
export const FEE_TYPE_BACKEND_TO_COLUMN = Object.fromEntries(
  FEE_TYPES.filter((t) => t.source === 'record' && t.backend_key).map((t) => [t.backend_key, t.value]),
)

// adjustment_type → 樞紐欄位 value
export const ADJ_TYPE_TO_COLUMN = Object.fromEntries(
  FEE_TYPES.filter((t) => t.source === 'adjustment').map((t) => [t.adj_type, t.value]),
)

// fee_type value → 中文 label（給 cell / popover / dialog 用）
export const FEE_TYPE_LABELS = Object.fromEntries(FEE_TYPES.map((t) => [t.value, t.label]))

// 把 records + adjustments 依 FEE_TYPES 分桶
export function bucketByFeeType(records = [], adjustments = []) {
  const fees = {}
  const adjs = {}
  for (const ft of FEE_TYPES) {
    if (ft.source === 'record') fees[ft.value] = []
    else adjs[ft.value] = []
  }
  for (const r of records) {
    const colKey = FEE_TYPE_BACKEND_TO_COLUMN[r.fee_type] || 'leave_or_other'
    if (!fees[colKey]) fees[colKey] = []
    fees[colKey].push(r)
  }
  for (const a of adjustments) {
    const colKey = ADJ_TYPE_TO_COLUMN[a.adjustment_type] || 'leave_or_other'
    if (!adjs[colKey]) adjs[colKey] = []
    adjs[colKey].push(a)
  }
  return { fees, adjustments: adjs }
}
