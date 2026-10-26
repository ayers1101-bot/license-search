# 啟用管理者邀請制

本次採用 Email 登入、首次設定個人顯示名稱與密碼。初始系統管理者為 `ayers1101@gmail.com`。系統使用權與各專案擁有者／編輯／檢視權分開：系統管理者不會因此自動看見所有人的私人專案。

## 1. 在 Supabase 禁止公開註冊

到 Authentication 的 Sign In / Providers（或 Providers → Email），關閉 **Allow new users to sign up / Enable new user signups**。保留 Email / Password 登入。此服務層設定必須由專案管理者儲存，前端無法代為修改。關閉後管理者仍可透過 Admin 邀請建立帳號。

## 2. 執行兩份增量 SQL

適用於已執行過 `supabase/schema.sql` 的專案；不要重跑原初始化，也不要刪表。

1. SQL Editor 執行 `supabase/invite-only.sql`：新增 Email 允許名單、個人資料、使用權操作紀錄，以及後端讀寫門檻。
2. 再執行 `supabase/bootstrap-admin.sql`：授權 `ayers1101@gmail.com` 為初始管理者。

兩份增量 SQL 可重複執行，不會刪除既有專案與版本。執行後所有既有使用者也須在允許名單中並完成個人設定，才可讀寫。沒有自動把既有帳號全部授權。第一次授權管理者不會建立 Auth 帳號或設定密碼。

## 3. 第一次進入管理者帳號

- 若 `ayers1101@gmail.com` 已有可登入帳號，直接用現有密碼登入；頁面會要求設定顯示名稱與新密碼（至少 12 字元）。
- 若尚無帳號，請在 Supabase Authentication → Users → Add user → Create new user 建立該 Email，使用安全的臨時密碼，對自己已確認身分的管理者啟用 Auto Confirm（若介面提供）。再回網站登入並設定個人名稱與密碼。
- 若已存在但尚未驗證／忘記密碼，請從 Supabase Users 對該帳號寄送恢復／重設密碼連結；先確認 SMTP 可正常寄信。不要藉由關閉所有 Email 驗證繞過問題。

## 4. 設定登入回呼與寄信

Authentication → URL Configuration：

- Site URL：`https://deft-naiad-72ef5b.netlify.app/team.html`
- Redirect URLs：加入完全相同網址。

使用 Supabase 預設的邀請／恢復密碼信範本（確認連結導回此網站，預設 implicit 流程）。網站支援 `type=invite` 與 `type=recovery` 的登入片段，驗證 token 後立即清除網址中的 token，再顯示個人設定。自訂 PKCE／token_hash 信件範本需另外實作回呼，不要自行改成不同格式。

目前曾發生 `email rate limit exceeded`，邀請信同樣受此限制。請先設定自訂 SMTP 並完成寄件網域驗證。管理者新增名單與寄信分開回報：即使使用權已核准，寄信失敗也會顯示「尚未寄出」，不會宣稱邀請成功，也不會自動重試。

## 5. Netlify 設定伺服器專用金鑰

在 Netlify 此網站的 Project configuration → Environment variables 新增：

- `SUPABASE_SERVICE_ROLE_KEY`：Supabase 的 **service_role** 或可用於伺服器 Admin Auth 的 **secret key**。只供 Netlify Functions 使用；若能選 scope，僅選 Functions。**不要提供到聊天，不要放進 `public/team-config.js`、GitHub、前端建置變數或瀏覽器。**
- `TEAM_SITE_URL`：`https://deft-naiad-72ef5b.netlify.app`（可省略，目前程式預設同網址）。

儲存後重新部署 Netlify。網站的 `netlify/functions/team-invite.mjs` 會先驗證登入身分，再由資料庫確認目前仍是系統管理者，核准 Email 後才呼叫 Admin 邀請寄信。未登入、一般成員或不同網站來源不能使用此端點。

此步驟不會設定任務自動提醒，也不使用 Outlook 登入。金鑰只用於核准對象的 Admin 邀請；允許名單的寫入仍使用管理者自己的登入 token，由資料庫記錄操作者。

## 6. 日後由你操作

1. 登入 `/team.html`，管理者會看到「系統使用者管理」。
2. 輸入同事 Email，按「核准並寄送邀請」。
3. 同事開啟邀請信，首次設定個人名稱、密碼與確認密碼，完成後進入系統。你不需要知道同事的密碼。
4. 若該 Email 已有帳號，可能只會完成授權而不寄新邀請，畫面會明確告知；請對方直接登入，忘記密碼時由管理者從 Supabase 發送重設信。
5. 每個人可建立自己的專案；欲共編仍由專案擁有者在「成員權限」授權。
6. 「停用」撤回系統權限，後端即拒絕後續專案讀寫，包含仍持有登入 token 的帳號；歷史與專案保留。重新核准會恢復原有專案權限。前端已載入到記憶體的內容無法遠端抹除。

允許名單操作留有 `team_access_events`。其他管理者的設立／撤銷須在資料庫管理，不在此版本的使用者介面開放；避免誤停用唯一初始管理者。

## 驗證與尚待完成

本機 PostgreSQL 回歸測試覆蓋未核准登入、未完成個人設定、直接繞過 RPC、一般成員試圖核准人員、停用後持舊 token 存取及紀錄保留。伺服器邀請測試使用模擬 Auth / 郵件回應，不會寄送真實邀請。

必須在真實 Supabase 執行 SQL、關閉公開註冊、設定 Netlify 私密環境變數與 SMTP 後，再以管理者和受邀成員驗收整段流程。僅推送程式不會自動套用以上後台設定。未套用遷移時，頁面會顯示設定未完成，不會回退到舊有開放註冊模式。
