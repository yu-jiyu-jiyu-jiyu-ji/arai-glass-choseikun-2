# Render 環境変数（調整くん）

`.env` の内容をほぼそのままでよいが、**JSON ファイルのパスだけは Render では注意**。

## 必須（台帳を Firestore にする場合）

| 変数名 | 入れるもの |
|--------|------------|
| `CHOSEIKUN_DATA_BACKEND` | `firestore` |
| `CHOSEIKUN_USE_MOCK` | 当面 `true`。Calendar/Maps 本番読取時は `false` |
| `GOOGLE_APPLICATION_CREDENTIALS` | Secret File のパス（例: `/etc/secrets/….json`） |
| または `GOOGLE_SERVICE_ACCOUNT_JSON` | サービスアカウント JSON の**中身すべて** |

## Calendar / Maps

| 変数名 | 入れるもの |
|--------|------------|
| `GOOGLE_OAUTH_CLIENT_ID` | OAuth クライアント ID |
| `GOOGLE_OAUTH_CLIENT_SECRET` | OAuth クライアントシークレット |
| `GOOGLE_OAUTH_REDIRECT_URI` | `https://arai-glass-choseikun-2-1.onrender.com/api/oauth/calendar/callback` |
| `GOOGLE_MAPS_API_KEY` | Geocoding / Routes 用 API キー |

有効化する API: **Google Calendar API** / **Geocoding API** / **Routes API**

### 本番プロバイダ切替手順

1. `/admin/workers` で各職人の **Calendar連携** を完了  
2. `CHOSEIKUN_USE_MOCK=false` に変更して再デプロイ  
3. `/api/health` で `calendarTravelMode: "live"` を確認  
4. 顧客画面で住所を入れて枠が出るか確認  

## 入れない／注意

- `GOOGLE_APPLICATION_CREDENTIALS=E:\cursor\...json` のような **PC上のパスは無効**（Render では Secret File パスか JSON 本文）
- JSON・秘密鍵は **Secret** として登録（ログに出さない）
- 既存 nittei（Streamlit）用のリダイレクト URI と **choseikun 用は別**。両方 OAuth クライアントに登録してよい

## 外部Bot用URL発行

| 変数名 | 入れるもの |
|--------|------------|
| `TOKENS_ISSUE_API_KEY` | `POST /api/tokens/issue` の Bearer / x-api-key |
| `NEXT_PUBLIC_APP_ORIGIN` | 公開ORIGIN（例: `https://….onrender.com`） |

## メール（予約通知・リマインド）+ Cron

**重要: Render Free は 2025-09 以降、SMTP ポート（25/465/587）への送信が遮断されます。**  
Gmail SMTP だけではタイムアウトして届きません。次のどちらかが必要です。

1. **推奨（Free のまま）**: [Resend](https://resend.com) の API キーを入れる（HTTPS なので通る）
2. **代替**: Web Service を有料プランに上げて、従来どおり SMTP を使う

| 変数名 | 入れるもの |
|--------|------------|
| `RESEND_API_KEY` | Resend の API キー（Free 向け推奨） |
| `RESEND_FROM` または `SMTP_FROM` | 差出人（Resend は検証済みドメイン推奨。試験は `onboarding@resend.dev`） |
| `SMTP_HOST` | 例: `smtp.gmail.com`（有料 Render / ローカル） |
| `SMTP_PORT` | 例: `587` |
| `SMTP_USER` | 送信アカウント |
| `SMTP_PASSWORD` | アプリパスワード等 |
| `SMTP_FROM` | 差出人（任意。未設定時は SMTP_USER） |
| `CRON_SECRET` | 任意の長い乱数（Cron 呼び出し認証用） |

取りこぼし再送: `POST /api/bookings/{id}/notify`

### Render Cron Job

- スケジュール: **毎時**（例: `0 * * * *`）※設定の送信時刻（既定18時 JST）のときだけ実送信
- URL: `https://arai-glass-choseikun-2-1.onrender.com/api/cron/reminders`
- Header: `Authorization: Bearer <CRON_SECRET>`

送信タイミング（何日前・何時）は **管理画面 → 共通設定 → メールリマインド** で変更可能（既定: 7日前と1日前の18時）。

手動テスト:  
`/api/cron/reminders?secret=...&force=1`（時刻チェックを bypass）

## 確認

デプロイ後: `https://arai-glass-choseikun-2-1.onrender.com/api/health`  
`ok: true` と `workerCount` が出れば台帳接続成功。
