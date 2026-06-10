/**
 * prevTail 動作確認
 * ① 6/30夜勤  → 7/1明け・7/2休み が自動設定される
 * ② 6/30遅番  → 7/1日勤・早番 が Step2.5 で弾かれる
 * ③ 月跨ぎ連勤 → consecWork が前月末を正しく遡る
 */

import { autoGenerate } from './src/shiftEngine.js';

const YEAR = 2026, MONTH = 6; // 7月

function makeS(id, name, role, nightOk, opts = {}) {
  return {
    id, name, dept: 'kaigo1', role, nightOk,
    nightMax: opts.nightMax ?? (nightOk ? 8 : 0),
    kyukoDays: 9,
    facilityYears: null, floorYears: null,
    foreignNightSupportRequired: false,
    kiboByMonth: {}, yukyuByMonth: {},
    shiftRequestsByMonth: {}, kyukoDaysByMonth: {},
    kiboNightPreference: 0,
  };
}

const dept = {
  id: 'kaigo1',
  shiftTypes: ['早番', '日勤', '遅番', '夜勤'],
  minStaff: { 早番: 1, 日勤: 1, 遅番: 1, 夜勤: 1 },
  maxStaff: { 早番: 1, 遅番: 1, 夜勤: 1 },
  maxConsecutive: 5,
  customShiftDefs: [],
  intervalThreshold: null,
  roleShiftTypes: {},
};

const days = new Date(YEAR, MONTH + 1, 0).getDate(); // 31

// ─── テスト①: 6/30夜勤 → 7/1明け・7/2休み ─────────────────────────────────

console.log('\n' + '='.repeat(60));
console.log('テスト① 6/30夜勤 → 7/1明け・7/2休み の自動設定');
console.log('='.repeat(60));
{
  const staffList = [
    makeS('s1', '柳 瑛理子', '介護福祉士', true),
    makeS('s2', '村山 潤哉', '介護福祉士', true),
    makeS('s3', '宇賀神 弓', '介護福祉士', true),
    makeS('s4', '山田 A',   '介護職員',   false),
    makeS('s5', '田中 B',   '介護職員',   false),
  ];
  // 柳さんの6月末 = 夜勤
  const prevTail = {
    s1: { 28: '日勤', 29: '日勤', 30: '夜勤' },
  };

  const { shifts } = autoGenerate(staffList, dept, YEAR, MONTH, {}, {}, {}, prevTail);

  const d1 = shifts['s1']?.[1] ?? '(なし)';
  const d2 = shifts['s1']?.[2] ?? '(なし)';
  const ok1 = d1 === '明け';
  const ok2 = d2 === '休み';
  console.log(`  柳 7/1 = ${d1}  ${ok1 ? '✓ 明け(期待通り)' : '✗ 期待: 明け'}`);
  console.log(`  柳 7/2 = ${d2}  ${ok2 ? '✓ 休み(期待通り)' : '✗ 期待: 休み'}`);

  // 念のため7/1に別スタッフが夜勤になれるか（柳は明けなので夜勤不可のみ確認）
  const d1_s2 = shifts['s2']?.[1] ?? '(なし)';
  console.log(`  村山 7/1 = ${d1_s2}  (夜勤以外なら問題なし)`);
}

// ─── テスト②: 6/30遅番 → 7/1日勤・早番が Step2.5 で弾かれる ──────────────

console.log('\n' + '='.repeat(60));
console.log('テスト② 6/30遅番 → 7/1日勤・早番禁止（isBadTransition）');
console.log('='.repeat(60));
{
  const staffList = [
    makeS('s1', '柳 瑛理子', '介護福祉士', true),
    makeS('s2', '村山 潤哉', '介護福祉士', true),
    makeS('s3', '宇賀神 弓', '介護福祉士', true),
    makeS('s4', '山田 A',   '介護職員',   false),
    makeS('s5', '田中 B',   '介護職員',   false),
  ];
  // 柳さんの6月末 = 遅番
  const prevTail = {
    s1: { 28: '日勤', 29: '日勤', 30: '遅番' },
  };

  // 100回試行して7/1の柳シフトを集計
  const cnt = {};
  for (let i = 0; i < 100; i++) {
    const { shifts } = autoGenerate(staffList, dept, YEAR, MONTH, {}, {}, {}, prevTail);
    const v = shifts['s1']?.[1] ?? '未配置';
    cnt[v] = (cnt[v] ?? 0) + 1;
  }
  console.log('  100回試行 柳 7/1 シフト分布:');
  for (const [k, v] of Object.entries(cnt).sort((a, b) => b[1] - a[1])) {
    const bad = (k === '日勤' || k === '早番');
    console.log(`    ${k.padEnd(6)} ${String(v).padStart(3)}回  ${bad ? '✗ 禁止シフト!' : '✓'}`);
  }
  const forbidden = (cnt['日勤'] ?? 0) + (cnt['早番'] ?? 0);
  console.log(`  日勤・早番の出現: ${forbidden}回  ${forbidden === 0 ? '✓ 禁止されている' : '✗ 禁止されていない'}`);
}

// ─── テスト③: 月跨ぎ連勤数カウント ─────────────────────────────────────────

console.log('\n' + '='.repeat(60));
console.log('テスト③ 月跨ぎ連勤数（consecWork による maxConsecutive 抑止）');
console.log('='.repeat(60));
{
  // maxConsecutive=5、柳さんが前月末に4連勤 → 7/1にもう1勤務したら5連勤=上限
  // 7/2はそれ以上連続してはいけない
  const staffList = [
    makeS('s1', '柳 瑛理子', '介護福祉士', false), // 夜勤なし
    makeS('s2', '村山 潤哉', '介護福祉士', false),
    makeS('s3', '宇賀神 弓', '介護福祉士', false),
    makeS('s4', '山田 A',   '介護職員',   false),
    makeS('s5', '田中 B',   '介護職員',   false),
  ];
  const deptDay = { ...dept, shiftTypes: ['早番', '日勤', '遅番'], minStaff: { 早番: 1, 日勤: 1, 遅番: 1 }, maxStaff: { 早番: 1, 遅番: 1 } };

  // 6月27-30日全て日勤（4連勤）
  const prevTail = {
    s1: { 27: '日勤', 28: '日勤', 29: '日勤', 30: '日勤' },
  };

  // 100回試行して 7/1・7/2 を確認
  const pattern = {};
  for (let i = 0; i < 200; i++) {
    const { shifts } = autoGenerate(staffList, deptDay, YEAR, MONTH, {}, {}, {}, prevTail);
    const v1 = shifts['s1']?.[1];
    const v2 = shifts['s1']?.[2];
    const isWork1 = ['日勤','早番','遅番'].includes(v1);
    const isWork2 = ['日勤','早番','遅番'].includes(v2);
    const key = `7/1=${v1}, 7/2=${v2}`;
    pattern[key] = (pattern[key] ?? 0) + 1;
    // 前月4連勤 + 7/1勤務 + 7/2勤務 = 6連勤は maxConsec=5 超過
    if (isWork1 && isWork2) {
      // これは prevTail がないと頻繁に起きる
    }
  }
  console.log('  200回試行 柳 7/1, 7/2 パターン (上位10):');
  Object.entries(pattern).sort((a, b) => b[1] - a[1]).slice(0, 10).forEach(([k, v]) => {
    const has6consec = k.includes('7/1=') && !k.includes('7/1=休み') && !k.includes('7/1=希望休')
                    && !k.includes('7/2=休み') && !k.includes('7/2=希望休');
    console.log(`    ${k.padEnd(28)} ${String(v).padStart(4)}回  ${has6consec ? '⚠ 月跨ぎ6連勤' : ''}`);
  });

  // 6連勤（前月4 + 当月2）の件数をカウント
  let violCount = 0;
  for (let i = 0; i < 200; i++) {
    const { shifts } = autoGenerate(staffList, deptDay, YEAR, MONTH, {}, {}, {}, prevTail);
    const v1 = shifts['s1']?.[1];
    const v2 = shifts['s1']?.[2];
    if (['日勤','早番','遅番'].includes(v1) && ['日勤','早番','遅番'].includes(v2)) {
      violCount++;
    }
  }
  console.log(`\n  7/1勤務かつ7/2も勤務（前月4連勤+2=6連勤）: 200回中 ${violCount}回`);
  console.log(`  ${violCount === 0 ? '✓ maxConsec=5 が月跨ぎでも守られている' : `△ ${violCount}回発生（7/1が5連勤目なので7/2は休みになるべき）`}`);
}

console.log('\n' + '='.repeat(60));
