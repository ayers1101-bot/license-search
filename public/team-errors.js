export function teamErrorMessage(error){
 const text=String(error?.message||'操作失敗，請稍後再試'),code=error?.code||'';
 if(code==='over_email_send_rate_limit'||/email rate limit exceeded/i.test(text))return '驗證信寄送次數已達 Supabase 限制，這次註冊未完成。請先停止重複點選註冊，稍後再試；若持續發生，請管理者在 Supabase 設定自訂 SMTP 寄信服務。這與密碼或專案版本衝突無關。';
 if(code==='over_request_rate_limit'||error?.status===429)return '操作過於頻繁，請稍後再試。系統不會自動重送請求。';
 if(code==='email_not_confirmed'||/email not confirmed/i.test(text))return 'Email 尚未完成驗證，請先開啟驗證信，再回到網站登入。';
 if(code==='invalid_credentials'||/invalid login credentials/i.test(text))return 'Email 或密碼不正確，請確認後再登入。';
 if(code==='email_address_not_authorized'||/email address.*not authorized/i.test(text))return '目前的寄信服務不允許寄送驗證信到此 Email，請管理者檢查 Supabase 的自訂 SMTP 設定與寄件網域。';
 if(/版本衝突/.test(text))return text+'\n請保留未儲存內容，再關閉編輯視窗重新載入最新版本。';
 if(error instanceof TypeError&&/fetch|network|load failed/i.test(text))return '無法連線至帳號或資料服務，請確認網路後再試。';
 return text;
}
