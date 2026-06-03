export const GENDER_OPTIONS = [
  { value: 'M', label: '男' },
  { value: 'F', label: '女' },
]

// 註：原 STUDENT_STATUS_TYPE 已移除——為 0 引用死碼，且含後端不存在的 'inactive'、
// 缺 prospect/enrolled/on_leave/withdrawn。學生狀態標籤一律改用 @/constants/lifecycle。
