// 後台模組 canonical 顯示名稱——單一來源（2026-07-20 UI/UX 稽核，Nielsen H4 一致性）。
//
// 契約：router 的 meta.title、AdminSidebar 選單項、HomeView 快速操作等所有指向
// 「同一模組」的 user-facing 文字，一律 import 本表取值，不得在各自檔案內手寫字串。
// 曾發生的漂移：同一出勤模組在三個入口分別叫「考勤管理 / 出勤管理 / 出勤查詢」。
// 新增（或改名）模組級入口文字時：先在此登記，再由各入口引用；改名只改這裡一處。
export const MODULE_TERMS = {
  /** 出勤模組（/attendance）。勿再使用「考勤管理」「出勤查詢」。 */
  attendance: '出勤管理',
  /** 排班模組（/schedule）。勿再使用「班表管理」。 */
  schedule: '排班管理',
  /** 課後才藝模組（/activity/*）。勿再使用「活動管理」。 */
  activity: '課後才藝',
} as const

// 頁面級 canonical 顯示名稱——單一來源（2026-07-28 命名稽核）。
//
// MODULE_TERMS 只收斂了「模組級」入口，頁面級名稱仍散落在 AdminSidebar 與 router
// 各寫各的，造成同一功能在側欄、麵包屑、瀏覽器標題、全域搜尋「頁面」分類顯示不同名字
// （例：側欄「一般設定」vs meta「系統設定」、側欄「月度月報」vs meta「月度幼生在園統計」）。
// 契約同 MODULE_TERMS：側欄 label、meta.title、頁面自身標題三處一律 import 本表，
// 不得在各自檔案內手寫字串；改名只改這裡一處。
//
// 命名原則：名稱要說出這頁「實際在做的事」。功能長大時（新增分頁、涵蓋第二類資料）
// 必須回來改名，不要讓名稱停在功能的初始版本。
export const PAGE_TERMS = {
  /** /workbench。原側欄「工作台」過泛（另有學生／班級／出勤工作台），實際只做審核。 */
  workbench: '審核工作台',
  /** /classrooms。原「班級學生管理」與 students 的「學生」語意重疊，難以辨別該點哪個。 */
  classrooms: '班級管理',
  /**
   * /students。維持「學生」——2026-05-21 commit 2f47067c 刻意由「學生管理」改為「學生」
   * （同批把群組「學生教務」改為「學生與班級」、移除「學生教務管理」入口），
   * 且以 AdminSidebar.test.js 的 `not.toContain('學生管理')` 鎖住，勿改回。
   * 與 classrooms 的語意重疊已由上方 classrooms 改名為「班級管理」解除。
   */
  students: '學生',
  /** /dismissal-queue。原「接送通知」與 Portal /portal/dismissal-calls 完全同名；admin 側管的是佇列。 */
  dismissalQueue: '接送管理',
  /** /overtime。原 meta「加班管理」漏掉會議，頁面實際涵蓋園務會議。 */
  overtime: '加班與園務會議',
  /** /calendar。側欄原簡稱「行事曆」。 */
  calendar: '學校行事曆',
  /** /data-quality。原「資料品質(報告)」像報表，實際是可確認／標記已修正／忽略的待辦佇列。 */
  dataQuality: '資料異常待辦',
  /** /reports。原「報表統計」在「報表」群組下疊詞。 */
  reports: '經營報表',
  /** /settings。原側欄「一般設定」vs meta「系統設定」，且與側欄群組同名致麵包屑「系統設定 › 系統設定」。 */
  settingsGeneral: '進階設定',
  /** /student-assessments。原 meta「學生評量紀錄」vs 頁面「學期評量記錄」（且「記錄」為動詞誤用）。 */
  studentAssessments: '學生評量紀錄',
  /** /salary/settle。原「月結」是薪資群組內唯一無「薪資」前綴者。 */
  salarySettle: '薪資月結',

  // 政府申報：/gov-reports 是勞政稅務、/admin/gov-reports/* 是教育部，原本平行並列看不出分屬兩套體系。
  /** /gov-reports。原「政府申報匯出」，實際只有勞保投保薪資／健保名冊／扣繳憑單／勞退提繳。 */
  govExport: '勞健保與稅務申報',
  /** /admin/gov-reports/monthly。原側欄「月度月報」疊詞且未說是什麼月報（實為教育部幼生通報）。 */
  govMonthly: '月度幼生在園統計',
  /** /admin/gov-reports/certificates。側欄原簡稱「在學證明紀錄」。 */
  govCertificates: '在學證明開立紀錄',
  /** /admin/gov-reports/subsidies。原「特教加給」漏掉頁面實際涵蓋的助理鐘點費。 */
  govSubsidies: '特教加給與鐘點費',

  // 課後才藝：側欄在「課後才藝」群組內用短名，meta 靠 parentTitle 帶出模組，兩者字面一致。
  /** /activity/dashboard */
  activityDashboard: '統計儀表板',
  /** /activity/catalog。側欄原簡稱「課程與用品」。 */
  activityCatalog: '課程與用品',
  /** /activity/pos/approval。側欄原簡稱「收款簽核」。 */
  activityPosApproval: 'POS 收款簽核',
  /** /activity/audit/pos-unlock。原 meta「POS 日結異常稽核軌跡」vs 頁面「POS 異常稽核軌跡」。 */
  activityPosAudit: 'POS 異常稽核軌跡',
  /** /activity/settings。原「報名時間設定」漏掉前台顯示設定與兩種通知信模板，要改 Email 模板的人找不到。 */
  activitySettings: '報名與通知設定',
  /** /activity/changes。原側欄「修改紀錄」在才藝群組下讀起來像涵蓋課程與用品，實際只有報名。 */
  activityChanges: '報名修改紀錄',

  // 考核與年終
  /** /appraisal-year-end/rules/scoring。24 張規則卡含「加分」組，原「扣分規則」少講一半。 */
  appraisalScoringRules: '考核計分規則',
  /** /appraisal-year-end/rules/catalog。維護的是 16 項加減分，原「扣分項目目錄」少講加分。 */
  appraisalCatalog: '計分項目',
  /** /appraisal-year-end/exceptions。原「例外中心」是 exception 直譯的工程語彙。 */
  yearEndExceptions: '待補資料',
} as const
