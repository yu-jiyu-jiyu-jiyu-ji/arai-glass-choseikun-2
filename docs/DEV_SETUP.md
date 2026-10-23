# 調整くん — 開発環境セットアップ

| 項目 | 内容 |
|------|------|
| 対象 | `choseikun`（Next.js） |
| 更新 | 2026-10-23 |
| 目的 | ローカルで顧客UI＋間検索を動かし、のちに本番APIへ接続する |

---

## 1. いちばん早い起動（モック）

```powershell
cd e:\cursor\01_日程調整システム\choseikun
npm install
# .env.local が無ければ
Copy-Item .env.example .env.local
npm run dev
```

- 顧客画面: http://localhost:3000  
- 社内: http://localhost:3000/admin  
- 設定: http://localhost:3000/admin/settings  

`.env.local` の `CHOSEIKUN_USE_MOCK=true` のままなら、Google / Firebase キーは不要です。

### 動作確認の目安

1. `/admin/links` で候補職人を選んで URL 発行 → `/r/{token}` を開く  
2. 住所を「東京都台東区寿3-9-6」のように丁目・番地まで入力  
3. 駐車場・電話・氏名・メールを入れて次へ  
4. おすすめ枠（最大3）またはカレンダーから選択 → 完了  
5. 同じ URL を再訪すると予約内容が表示される  
6. `/admin/bookings` でキャンセル後、同じ URL から再調整できる  

市区町村だけだとバリデーションで弾かれます（仕様どおり）。  
直アクセス `/` でもデモ予約できます（発行URLなし＝全職人プール）。

---

## 2. 環境変数

| 変数 | モック開発 | 本番接続時 |
|------|------------|------------|
| `CHOSEIKUN_USE_MOCK` | `true`（既定） | `false` |
| `GOOGLE_APPLICATION_CREDENTIALS` | 不要 | Firestore 用サービスアカウント JSON のパス |
| `GOOGLE_OAUTH_CLIENT_ID` / `SECRET` / `REDIRECT_URI` | 不要 | Calendar OAuth（既存 nittei 流用可） |
| `GOOGLE_MAPS_API_KEY` | 不要 | Distance Matrix / Geocoding |

テンプレ: リポジトリ直下の `.env.example`  
実値: **`.env.local` のみ**（gitignore 済み。commit しない）

既存 Streamlit 側の例:

- サービスアカウント: `../nittei_chosei_system/*.json`  
- `.env`: `../nittei_chosei_system/.env`  

パスを `.env.local` に書くときは **相対パスでも絶対パスでも可**。JSON 本体はリポジトリに新規追加しないこと。

---

## 3. 設定値（業務パラメータ）

画面 `/admin/settings` または `data/settings.json`。

確定済みの初期値（仕様書）:

| 項目 | 値 |
|------|-----|
| 事務所 | 杉並区阿佐谷北３丁目４３−１１ AGビル 1F |
| 稼働 | 設定画面で変更可（既定: 平日＋土曜 9–17、昼 12–13） |
| 調査 | 45分 ＋ バッファ15分、枠は60分刻み |
| 探索 | 直近7日→延長、最大21日 |
| ΔT | 20分 |
| 人数 | 同時刻に2人空いている枠のみ |

---

## 4. よく使うコマンド

```powershell
npm run dev      # 開発
npm run build    # ビルド確認（push / デプロイ前）
npm run lint
```

ポートが埋まっているとき:

```powershell
npx next dev -p 3001
```

---

## 5. 開発の段階

| 段階 | 内容 | フラグ |
|------|------|--------|
| **A. モック開発（いま）** | UI・間検索ロジック・設定画面 | `USE_MOCK=true` |
| **B. API接続** | Calendar / Maps / Firestore プロバイダ実装 | `USE_MOCK=false` ＋キー |
| **C. 通知・排他** | メール・前日リマインド・枠ロック | B のあと |
| **D. Phase 2** | 代理入力・URL発行 | 顧客導線安定後 |

---

## 6. トラブル

| 症状 | 確認 |
|------|------|
| 枠が出ない | 住所の精度。モックでも丁目・番地必須 |
| ポート使用中 | `-p 3001` または既存 Node を止める |
| 設定が戻る | `data/settings.json` の書き込み権限 |
| build 失敗 | `npm install` 後もう一度 `npm run build` |

---

## 7. 関連

- 仕様: `../../docs/REQUIREMENTS_現地調査日程調整.md`  
- 既存本番（施工）: `../../nittei_chosei_system`  
