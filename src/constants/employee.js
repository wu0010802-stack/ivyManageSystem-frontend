export const POSITION_OPTIONS = [
  '班導', '副班導', '主任', '組長', '副組長',
  '司機', '美編', '行政', '美語教師', '藝術', '護理人員', '廚房',
]

export const SUPERVISOR_ROLE_OPTIONS = ['園長', '主任', '組長', '副組長']

export const OFFICIAL_JOB_TITLE_NAMES = [
  '園長', '幼兒園教師', '教保員', '助理教保員',
  '司機', '廚工', '職員',
]

export const TITLE_TO_GRADE = {
  '幼兒園教師': 'A',
  '教保員': 'B',
  '助理教保員': 'C',
}

// 其他職位 → position_salary 設定欄位 key
export const POSITION_SALARY_KEY = {
  '行政': 'admin_staff',
  '美語教師': 'english_teacher',
  '藝術': 'art_teacher',
  '美編': 'designer',
  '護理人員': 'nurse',
  '司機': 'driver',
  '廚房': 'kitchen_staff',
}

export const DEPARTMENT_OPTIONS = ['Teaching', 'Administrative', 'Support']

// 學歷 / 合約 / 員工類型：值必須與後端 api/employees_docs.py 的
// DEGREE_VALUES / CONTRACT_TYPE_VALUES 字面完全一致（含繁簡、空白）
export const DEGREE_OPTIONS = ['高中職', '學士', '碩士', '博士', '其他']

export const CONTRACT_TYPE_OPTIONS = ['正式', '兼職', '試用', '臨時', '續約']

export const EMPLOYEE_TYPE_OPTIONS = [
  { label: '正職員工', value: 'regular' },
  { label: '才藝老師 (時薪制)', value: 'hourly' },
]
