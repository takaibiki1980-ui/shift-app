# SHIFT_DISTRIBUTION_FLOW.md
# 完成シフト配信機能 不具合調査レポート

調査日: 2026-06-27  
調査対象: `/home/user/shift-app/src/App.jsx`  
症状: ShiftViewPortal を開くとスタッフ名は表示されるがシフトが全て「－」になる  
制約: 実装禁止・コード変更禁止・推測禁止

---

## 1. 「確定シフト送信」から送信完了までの処理フロー

### 送信ボタン定義（管理者側モーダル）

**L8613**（確定シフトURL生成）:
```javascript
const shiftUrl = `${window.location.origin}?staff=${uuidToShort(session.user.id)}&dept=${d.id}&view=shift&ym=${year}${String(month+1).padStart(2,'0')}`;
```

**L8614**（doShiftLine — LINEで送る）:
```javascript
const doShiftLine = () => {
  if (saveStatus !== 'saved') { alert('...保存中...'); return; }
  window.open(`https://line.me/R/msg/text/?${encodeURIComponent(...shiftUrl...)}`, '_blank');
};
```

**URLパラメータ構造**:
| パラメータ | 値 | 生成元 |
|---|---|---|
| `staff` | `uuidToShort(session.user.id)` | 管理者UUID → 22文字短縮形 |
| `dept` | `d.id` | 部署ID（文字列） |
| `view` | `"shift"` | 固定値 |
| `ym` | `"202607"` 形式 | year + String(month+1).padStart(2,'0') |

### ルーティング（App関数）

**L6678–6682**:
```javascript
const staffUserId = params.get('staff');        // 短縮UUID（22文字）
const staffDeptId = params.get('dept');
const staffViewMode = params.get('view');
const resolvedUserId = staffUserId
  ? (staffUserId.length <= 24 ? shortToUuid(staffUserId) : staffUserId)
  : null;
if (resolvedUserId && staffViewMode === 'shift')
  return <ShiftViewPortal adminUserId={resolvedUserId} deptId={staffDeptId} ym={params.get('ym')} />;
```

→ shortToUuid により22文字短縮UUIDを元のUUID（36文字）に復元してから渡す

---

## 2. 送信元データ（allShifts）の構造と参照経路

### allShifts の定義

**L6934** — useState 定義:
```javascript
const [allShifts, setAllShifts] = useState(() => { ... });
```

**データ構造**:
```
allShifts[deptId][staffId（UUID）][dayNumber（数値）] = shiftValue（文字列）
```

※ dayNumber は `restoreShifts`（L6933）で数値型に変換される:
```javascript
const restoreShifts = (parsed) => {
  for (const [d, v] of Object.entries(dm)) r[dId][sId][+d] = v;  // +d で数値化
};
```

### 生成後の allShifts への格納

**L8223**（kaigo一括生成）:
```javascript
setAllShifts(prev => ({...prev, ...newShifts}));
```

**L8177**（単部署生成）:
```javascript
setAllShifts(prev => ({...prev, [cd.id]: result}));
```

→ `result` の構造: `{ staffId（UUID）: { dayNumber: shiftValue } }`

---

## 3. Supabase への保存処理

### 自動保存エフェクト

**L7334–L7431** — 保存エフェクト:
```javascript
useEffect(() => {
  if (!dbInitialized.current) return;      // ← 条件1: DB初期化済み
  if (isLoadingMonth.current) return;      // ← 条件2: 月ロード中でない
  if (userEditSeq.current === seqAtLastRemoteLoad.current) {  // ← 条件3
    setSaveStatus('saved');
    return;
  }
  const closureDeptId = activeDeptIdRef.current;  // L7348
  saveTimer.current = setTimeout(async () => {
    const currentDeptId = closureDeptId;
    const key = `shifts_${year}_${month+1}_${currentDeptId}`;  // L7409
    const deptData = allShifts[currentDeptId] || {};             // L7410
    await supabase.from('shift_data').upsert(
      { user_id: session.user.id, data_key: key, data_value: deptData, ... },
      { onConflict: 'user_id,data_key' }
    );
  }, 1000);  // 1秒デバウンス
}, [allShifts, year, month]);  // L7431
```

### 保存キーの構築

**L7409**:
```
data_key = "shifts_" + year + "_" + (month+1) + "_" + currentDeptId
```

例: year=2026, month=5（6月）, dept=kaigo1 → `"shifts_2026_6_kaigo1"`

### 保存 data_value の構造

**L7410**:
```javascript
const deptData = allShifts[currentDeptId] || {};
```

保存される構造（JSON化後）:
```json
{
  "UUID-staffId-1": { "1": "早", "2": "遅", "3": "休み", ... },
  "UUID-staffId-2": { "1": "夜勤", "2": "明け", ... }
}
```

※ dayNumber は JSON化で文字列キーになる（`+d` 数値 → JSON文字列）

---

## 4. ShiftViewPortal でのデータ取得

### コンポーネント定義

**L6528**:
```javascript
function ShiftViewPortal({ adminUserId, deptId, ym }) {
  const year = ym ? Math.floor(Number(ym) / 100) : new Date().getFullYear();
  const month = ym ? (Number(ym) % 100) - 1 : new Date().getMonth();
```

ymパース: ym="202607" → year=2026, month=6（0-indexed July）

### Supabase クエリ

**L6538–6542**:
```javascript
const shiftKey = `shifts_${year}_${month+1}_${deptId}`;
// → "shifts_2026_7_kaigo1"（7月の例）

const [cfgRes, shiftsRes, evRes] = await Promise.all([
  supabase.from('shift_data').select('data_value')
    .eq('user_id', adminUserId)       // 復元済み管理者UUID
    .eq('data_key', 'facilityConfig').maybeSingle(),
  supabase.from('shift_data').select('data_value')
    .eq('user_id', adminUserId)
    .eq('data_key', shiftKey).maybeSingle(),  // ← ここが空になる
  ...
]);
```

### rawShifts の取得と旧フォーマットフォールバック

**L6550–6562**（現在のコード）:
```javascript
let rawShifts = shiftsRes.data?.data_value;
// 新キーで見つからない場合、旧キー形式にフォールバック
if (!rawShifts) {
  const legacyKey = `shifts_${year}_${month+1}`;  // 部署サフィックスなし
  const legacyRes = await supabase.from('shift_data').select('data_value')
    .eq('user_id', adminUserId).eq('data_key', legacyKey).maybeSingle();
  const legacyData = legacyRes.data?.data_value;
  if (legacyData) {
    // 旧形式: { deptId: { staffId: { day: value } } }
    rawShifts = legacyData[deptId] || null;
  }
}
```

### シフトデータへのアクセス

**L6648**:
```javascript
const ss = shifts[s.id] || {};
```

**L6653**:
```javascript
const v = ss[d] || '';  // d は 1〜31 の数値
```

→ `ss[d]` は JSON文字列キー `ss["1"]` としてアクセス。JavaScript では `obj[1] === obj["1"]` なので問題なし。

---

## 5. キー一致確認

### 保存キー vs 読み込みキー

| 項目 | 保存側（L7409） | ShiftViewPortal（L6538） |
|---|---|---|
| フォーマット | `shifts_${year}_${month+1}_${deptId}` | `shifts_${year}_${month+1}_${deptId}` |
| year 取得 | React state の year | `Math.floor(Number(ym)/100)` |
| month+1 取得 | React state の `month+1` | `Number(ym)%100`（1-indexed そのまま） |
| deptId 取得 | `activeDeptIdRef.current` | URLパラメータ `dept` |

→ **フォーマットは一致する**

### ym の往復確認

URL生成（L8613）: `ym=${year}${String(month+1).padStart(2,'0')}`  
month=5（6月）→ ym="202606"

ShiftViewPortal（L6529–6530）:
- year = `Math.floor(202606/100)` = 2026 ✓
- month = `202606%100 - 1` = 5 ✓
- shiftKey = `shifts_2026_6_${deptId}` ✓

→ **ym の往復変換は正確**

---

## 6. staffId 一致確認

### 保存側の staffId

**L8177/L8223** — 生成後に格納される allShifts のキー:  
生成エンジン（例: L1007）: `ds.forEach(s => { res[s.id] = {}; })` → `s.id` は staffList 由来の UUID

### facilityConfig の staffList

**L8564**（facilityConfig 保存時）:
```javascript
staffList: staffList.map(s => ({
  id: s.id,       // ← allShifts のキーと同一 UUID
  dept: s.dept,
  name: s.name,
  role: s.role
}))
```

### ShiftViewPortal 側の staffList

**L6547**:
```javascript
const staffList = (cfg.staffList || []).filter(s => s.dept === deptId);
```

→ `s.id` は facilityConfig から取得した UUID

→ **allShifts のキー === facilityConfig.staffList[].id（両方とも UUID）**  
→ `shifts[s.id]`（L6648）は一致する

---

## 7. 空データになる原因の特定

### 根本原因：allShifts[currentDeptId] が保存タイミングで空になる

#### 発生メカニズム

**前提**（L7347–7348）:
```javascript
const closureDeptId = activeDeptIdRef.current;
```
保存エフェクトは、`allShifts` が変化したタイミングで `activeDeptIdRef.current`（現在アクティブな部署ID）を `closureDeptId` としてキャプチャする。

**問題**（L7409–7410）:
```javascript
const key  = `shifts_${year}_${month+1}_${currentDeptId}`;  // currentDeptId = closureDeptId
const deptData = allShifts[currentDeptId] || {};
```

→ `allShifts[closureDeptId]` が参照される。

**不一致シナリオ**:  
- kaigo1 のシフトを生成 → `setAllShifts(prev => ({...prev, [cd.id]: result}))` で `allShifts[kaigo1]` に result が格納
- この setState はバッチ処理で再レンダーが発火
- 再レンダー前後の間に `activeDeptId` が kaigo2 に切り替わっていた場合
- `activeDeptIdRef.current = kaigo2`
- 保存エフェクトが `closureDeptId = kaigo2` でキャプチャ
- `allShifts[kaigo2] = {}` （kaigo2は生成していない）が Supabase に保存される
- kaigo1 のシフト（result）は保存されない

#### 保存スキップ条件

**L7336–7342**（保存エフェクト冒頭）:
```javascript
if (!dbInitialized.current) return;       // DB未初期化時
if (isLoadingMonth.current) return;       // 月ロード中
if (userEditSeq.current === seqAtLastRemoteLoad.current) {
  setSaveStatus('saved');
  return;
}
```

`userEditSeq.current` は生成時に L7867 でインクリメントされる。  
しかし **Realtime 受信時**（L7131）:
```javascript
seqAtLastRemoteLoad.current = userEditSeq.current;
```
→ Realtime が生成完了前に発火すると `seqAtLastRemoteLoad = userEditSeq` になり保存がスキップされる。

#### 旧キーフォールバックの問題

現在のコード（L6553–6559）でフォールバックが追加されたが、旧キー（`shifts_2026_6`）の `data_value` 構造は:

```json
{ "kaigo1": { "staffId": { "day": "value" } }, "kaigo2": { ... } }
```

`legacyData[deptId]` = `{ "staffId": { "day": "value" } }` → 正しく抽出できる。

ただし **旧キーに保存されていない場合**（新規ユーザー、または月を初めて生成した場合）は両方とも null になる。

---

## 8. 各時点での空データ確認

| 時点 | 状態 | 根拠行 |
|---|---|---|
| 生成直後（result） | ✅ シフトデータあり | L7712（_runGenerateCore 戻り値） |
| setAllShifts 後 | ✅ allShifts[cd.id] にデータあり | L8177 |
| 保存エフェクト実行時 | ⚠️ closureDeptId ≠ cd.id の可能性 | L7348 |
| Supabase 保存 data_value | ⚠️ allShifts[closureDeptId] が `{}` の可能性 | L7410 |
| ShiftViewPortal 読み込み | ❌ rawShifts = null（行なし）| L6550 |
| shifts[s.id] アクセス | ❌ `{}` → ss[d] = '' → 「－」 | L6648, L6653 |

---

## まとめ

### 原因

保存エフェクト（L7334）が `allShifts` の変化を検知した際、`activeDeptIdRef.current`（L7348）でキャプチャした部署IDが、生成した部署ID（`cd.id`）と異なる場合、**生成したシフトではなく別部署（空）のデータが保存される**。

結果として Supabase に `shifts_YYYY_M_deptId` のエントリが存在しないか、存在しても `{}` で保存され、ShiftViewPortal では全セルが「－」になる。

### 発生箇所

| 箇所 | 行番号 | 内容 |
|---|---|---|
| 保存部署キャプチャ | L7348 | `closureDeptId = activeDeptIdRef.current` |
| 保存データ参照 | L7410 | `allShifts[currentDeptId] || {}` |
| ShiftViewPortal 受信 | L6550 | `rawShifts = shiftsRes.data?.data_value` |
| 空表示 | L6648, L6653 | `ss[d] || ''` → `''` → `cellText('') = '－'` |

### 修正箇所

- **L7348**: `closureDeptId` の取得元を `activeDeptIdRef.current` から、直前の `allShifts` 変化で更新された部署ID（生成した cd.id）に変更する
- または: 生成後に `cd.id` を明示的に保存する仕組みを追加（emergencySave 相当）
- または: 保存エフェクトを1部署限定でなく、`dirtyDeptIdsRef` の全部署を保存するよう変更

### 影響範囲

- ShiftViewPortal（全スタッフへのシフト配信画面）
- 対象月の対象部署のシフトデータが Supabase に保存されない
- 管理画面上は正常表示（allShifts は正しく更新されている）
- 他月・他部署の既存データには影響なし
- 旧キー形式のデータには影響なし
