# 系統設定「帳號與權限」UI/UX 改版設計

- 日期：2026-07-12
- 範圍：**純前端**（`ivy-frontend`）。不動後端、不動 codegen、不動 RoleManagerDrawer 功能面。
- 對象檔案：`src/views/SettingsView.vue`、`src/components/settings/SettingsAccountsTab.vue`、`src/components/settings/PermissionPicker.vue`（僅 dark mode 樣式）、對應測試。

## 背景與痛點

dev 環境實測：共 280 個帳號，其中 **249 個為家長帳號**（LIFF 綁定自動產生，本頁不能新增、也幾乎不需管理），27 教師 + 4 管理職。現況問題：

1. 家長帳號淹沒教職員——真正日常要管的 31 個帳號要靠篩選才找得到。
2. 280 列無分頁全部渲染，整頁超長捲動。
3. `最後登入` 顯示原始 ISO 字串（含微秒），未登入過則整欄空白。
4. 表格固定欄寬約 930px，寬螢幕右側大量留白。
5. 狀態欄有「啟用/停用」標籤但無操作入口；想讓帳號離場只能不可逆的「刪除」。
6. tab 未同步 URL，切到本分頁後重新整理跳回「輪班別管理」。
7. 無概覽統計。

後端前提（已核實，無需改動）：`PUT /auth/users/:id` 已支援 `is_active`（含「不能停用自己」400 守衛與停用時撤銷 token）；`GET /auth/users` 回傳含 `role`/`role_label`/`is_active`/`last_login`/`employee_name`（家長帳號 `employee_name` 為空字串、`employee_id` 為 null）。

## 設計決策（業主已裁定）

- 分流方案：**A — segmented 受眾分流**（教職員／家長兩視圖，預設教職員）。
- 家長視圖操作：**只留停用/啟用**。編輯角色、重設密碼對 LIFF 綁定帳號無意義；刪除由學生終態 PII GC 流程處理，不在此提供。

## 設計內容

### 1. 受眾分流（核心）

- toolbar 上方加 `el-segmented`（專案已有用例：`EmployeeHubView.vue`），選項「教職員（N）／家長（N）」，N 為該群全量計數（不受搜尋/篩選影響）。
- 預設 `staff`；選擇同步 `route.query.view = staff | parent`（replace 模式）。
- 分流判準：`role === 'parent'` 歸家長視圖，其餘全部歸教職員視圖（含 admin/自訂角色）。

### 2. 教職員視圖

- 現有表格全功能保留（搜尋、角色篩選、編輯、更多選單、角色卡片 dialog、進階微調、角色管理抽屜）。
- 角色篩選選項排除 `parent`。
- `最後登入` 用 `formatDateTimeTW`（`src/utils/format.ts` 既有）；null 顯示淡色「從未登入」。
- 「更多」選單新增「停用帳號」（`is_active` 為 true 時）／「啟用帳號」（false 時），位於「重設密碼」之後、「刪除」之前。
- 不分頁（31 筆可掃視；分流本身就是為了讓這個視圖小）。

### 3. 家長視圖

- 欄位收斂：帳號／狀態／最後登入／操作。無姓名欄（API 不回家長姓名，且避免 PII 展示與 GC 後空值問題）。
- 操作只有停用/啟用（無編輯、無重設密碼、無刪除、無更多選單——直接放單一按鈕）。
- 分頁：`el-pagination`，20 筆/頁，總數顯示。
- 搜尋只比對 `username`；無角色篩選。
- toolbar 右側「新增帳號」「管理角色」按鈕在兩視圖維持可見（新增帳號 dialog 的家長卡片本就 disabled，不會誤建家長帳號）；家長視圖以空狀態／副標文案註明：「家長帳號由家長端 LINE 綁定自動產生，不在此新增」。

### 4. 停用/啟用互動

- 停用：`ElMessageBox.confirm` 警告「停用後該帳號將立即無法登入，既有登入將被登出。確定停用 {username}？」；確認後 `updateUser(id, { is_active: false })`。
- 啟用：不需確認，直接 `updateUser(id, { is_active: true })`。
- 成功 `ElMessage.success` 並 `fetchUsers()` 刷新；失敗以 `apiError` 呈現後端訊息（如停用自己被後端 400 擋下時顯示其訊息）。

### 5. URL 同步

- `SettingsView.vue`：`activeTab ↔ route.query.tab`（`router.replace`，不塞 history）。初始化時讀 query，無效值 fallback `shifts`。權限不足的 tab（DSR 兩枚）query 指向時 fallback `shifts`。
- `SettingsAccountsTab.vue`：`view` segment ↔ `route.query.view`。`keyword`/`roleFilter` 維持 in-memory，不入 URL（範圍控制）。

### 6. 統計概覽

- 輕量單行統計文字（非 stat card——設定頁非儀表板），置於 toolbar 上方：
  - 教職員視圖：「教職員 N・啟用 N・從未登入 N・自訂權限 N」（自訂權限 = 非教師且 `isUsingRoleDefault` 為 false 且非 wildcard）。
  - 家長視圖：「家長 N・啟用 N」。
- 樣式：`--text-tertiary` 淡色、13px，數字用 `--text-primary` 加重。

### 7. 版面與視覺

- 教職員表格彈性欄（帳號、員工姓名）改 `min-width`，讓表格自然填滿寬螢幕；tag 類窄欄維持固定 `width`。
- 修 dark mode 硬編碼底色（07-11 報表改版同款陷阱，元件 scoped 內 `html.dark` 覆蓋）：
  - `SettingsAccountsTab.vue` `.role-card { background: #fff }`
  - `PermissionPicker.vue` `.perm-group { background: #f8f9fa }`

### 8. 手機版（AdminListCards）

- segmented 同樣生效。
- 家長視圖卡片欄位同步收斂（帳號為標題；狀態、最後登入兩列；動作只有停用/啟用）。
- 教職員視圖卡片維持現欄位，`最後登入` 同步格式化。

## 錯誤處理

- `fetchUsers` 現況靜默失敗（catch 註解「Admin token may not be set」）：改為表格空狀態顯示「載入失敗」＋重試按鈕（保留 console 靜默不彈 toast，避免非 admin 誤入時噪音）。
- 停用/啟用失敗：`apiError` toast，列表不刷新（保持原狀態顯示）。

## 測試策略

- `SettingsAccountsTab.test.ts`：
  - 分流：預設視圖排除 parent；切 parent 視圖只含 parent。
  - 家長分頁：>20 筆時分頁生效、翻頁資料正確。
  - 停用/啟用：呼叫 `updateUser` payload 正確（`{ is_active: false/true }`）、停用有 confirm、啟用無 confirm。
  - `最後登入`：ISO 字串格式化、null 顯示「從未登入」。
  - 統計列數字正確。
- `SettingsAccountsTab.cardview.spec.ts`：手機家長視圖欄位收斂、動作正確。
- `SettingsView.test.ts`：`?tab=` 初始化與切換同步、無效值 fallback。
- 完成 gate：兩棵測試樹（`src/components/settings/__tests__/`、`src/views/__tests__/`，含 `.spec.js/.spec.ts`）＋`tsc`＋`eslint` 全綠；瀏覽器實測含 dark mode 與手機視口。

## 不做的事（YAGNI）

- 不動後端（含家長姓名欄位補充——若日後要顯示綁定學生，另開跨端任務）。
- 不做教職員表格分頁（31 筆不需要）。
- `keyword`/`roleFilter` 不入 URL。
- 不動 RoleManagerDrawer 功能（僅其內 PermissionPicker 的 dark mode 樣式修正）。
- 不做批次操作（批次停用等，無此需求）。
