# Release Gate Input Record

更新日: 2026-09-02  
状態: **INPUT REQUIRED**

本書はRelease Gateに必要な外部入力を記録するテンプレートである。空欄を推測で補完しない。SecretそのものはRepositoryへ記録せず、Secret manager上のkey名と設定確認者だけを記録する。

## 1. Release Candidate

| 入力 | 値 |
|---|---|
| Candidate branch / PR | 未入力 |
| Candidate commit SHA | 未入力 |
| Candidate owner | 未入力 |
| Release target日時 / timezone | 未入力 |
| Rollback責任者 | 未入力 |

## 2. Domain / OAuth

| 入力 | 値 |
|---|---|
| 最終Production domain | 未入力 |
| 旧domainからのredirect方針 | 未入力 |
| DNS管理者 | 未入力 |
| SSL確認者 | 未入力 |
| Supabase Auth Site URL | 未入力 |
| OAuth callback URL | 未入力 |
| Google OAuth管理者 / QA account | 未入力 |

## 3. Product Analytics / 広告CV

| 入力 | 値 |
|---|---|
| Analytics provider | 未入力 |
| Production property / project | 未入力 |
| Measurement IDのSecret key名 | 未入力 |
| 広告CV provider | 未入力 |
| Conversion ID / LabelのSecret key名 | 未入力 |
| 必須event一覧 | 未入力 |
| consent取得方式 | 未入力 |
| data retention | 未入力 |
| Analytics確認者 | 未入力 |

Analytics providerまたはIDが未確定の場合、既存のfunnel RPCを外部Analytics導入済みとして扱わない。

## 4. Error Monitoring

| 入力 | 値 |
|---|---|
| Monitoring provider | 未入力 |
| Organization / project | 未入力 |
| DSNのSecret key名 | 未入力 |
| Production environment名 | 未入力 |
| Alert通知先 | 未入力 |
| Alert threshold / escalation | 未入力 |
| Source map公開方針 | 未入力 |
| PII / Secret scrub方針 | 未入力 |
| Monitoring確認者 | 未入力 |

## 5. OGP / favicon / robots

| 入力 | 値 |
|---|---|
| Site title | 未入力 |
| Meta description | 未入力 |
| OGP title | 未入力 |
| OGP description | 未入力 |
| OGP image asset / size | 未入力 |
| favicon asset | 未入力 |
| robots公開方針 | 未入力 |
| canonical URL | 未入力 |
| Brand approver | 未入力 |

## 6. 公開機能matrix承認

現行Authorityの初期値。変更する場合はProduct Ownerが理由と変更先を明示する。

| Feature | 現行Release状態 | 最終承認 |
|---|---|---|
| Home / Tutorial / Character / Skill / Equipment / Formation / Bag | OPEN | 未入力 |
| Quest / PvP / Raid / Ranking / Mission | OPEN | 未入力 |
| Guild / Guild Chat / Present / Normal Gacha | OPEN | 未入力 |
| Invite / Friend / Friend Helper | OMIT | 未入力 |
| Shop / GvG | UPCOMING | 未入力 |
| Payment / Special Gacha | CLOSED | 未入力 |
| Guild Combat Buff | OMIT | 未入力 |

## 7. Human Acceptance reviewers

| Gate | Reviewer / device | 予定 | 結果 |
|---|---|---|---|
| Battle full Skill load | 未入力 | 未入力 | 未実施 |
| Login Bonus UX | 未入力 | 未入力 | 未実施 |
| Desktop cross-screen | 未入力 | 未入力 | 未実施 |
| iPhone Safari | 未入力 | 未入力 | 未実施 |
| Android Chrome | 未入力 | 未入力 | 未実施 |
| Audio Lifecycle A–O | 未入力 | 未入力 | 未実施 |

実機記録には機種、OS、browser version、URL、commit SHA、network、結果、FAIL再現手順を含める。

## 8. Legal / Assets handoff

| 入力 | 値 |
|---|---|
| 利用規約の最終承認者 / version | 未入力 |
| Privacy Policyの最終承認者 / version | 未入力 |
| 特商法表記の適用要否 / 最終承認 | 未入力 |
| Cookie / Analytics同意文面 | 未入力 |
| 最終画像asset manifest / approver | 未入力 |
| 仮画像・placeholder残存の例外承認 | 未入力 |

## 9. Production Smoke

| 入力 | 値 |
|---|---|
| Production Vercel project / Deployment ID | 未入力 |
| Production Supabase project ref | 未入力 |
| Smoke test accounts | 未入力 |
| QA data cleanup owner | 未入力 |
| Backup ID / timestamp | 未入力 |
| Rollback command owner | 未入力 |
| Smoke開始承認者 | 未入力 |
| Smoke結果 | 未実施 |

## 10. Product Owner decision

| 入力 | 値 |
|---|---|
| 未解決riskの受容 / 却下 | 未入力 |
| GO / NO-GO | `NOT READY` |
| 判定者 | 未入力 |
| 判定日時 / timezone | 未入力 |
| 備考 | 未入力 |
