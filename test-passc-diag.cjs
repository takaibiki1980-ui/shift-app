/**
 * PassC 追加件数 調査スクリプト
 * time engine と care engine を同じデータで走らせ、
 * PassC (連続勤務補正) の追加休み件数・位置を比較する。
 *
 * time engine: [TIME-PASSB-END] / [TIME-PassC-追加] / [TIME-PassC] / [TIME-不足補正] を集計
 * care engine: [PassC-非slot休み追加] / [PassC-Tier2休み追加] / [AG-Phase1] PassC: を集計
 */
const { chromium } = require('playwright');

const SESSION = {
  access_token: 'mock-tok', refresh_token: 'mock-r',
  expires_at: Math.floor(Date.now() / 1000) + 3600,
  user: { id: 'test-uid-001', email: 't@e.com', role: 'authenticated', aud: 'authenticated' },
};

function makeDepts(mode) {
  const d = {
    id: "eiyo", label: "栄養科", icon: "🍱",
    shiftTypes: ["早番", "日勤"],
    minStaff: { 早番: 1, 日勤: 1 },
    maxStaff: { 早番: 1, 日勤: 99 },
    defaultKyukoDays: 8,
    maxConsecutive: 5,
    roles: ["管理栄養士", "栄養士", "調理師"],
    roleShiftTypes: { "調理師": ["早番"] },
    coverageRules: [
      { start: "07:00", end: "16:00", min: 1, label: "早番帯" },
      { start: "09:00", end: "18:00", min: 1, label: "日勤帯" },
    ],
    shiftTimes: { 早番: { start: "07:00", end: "16:00" }, 日勤: { start: "09:00", end: "18:00" } },
    intervalThreshold: 11,
  };
  if (mode) d.generationMode = mode;
  return [d];
}

const STAFF = [
  { id: "eiyo_0", dept: "eiyo", name: "清水 優子", role: "管理栄養士", nightOk: false, nightMax: 0, targetWork: 20, kyukoDays: 8, kiboByMonth: {}, shiftRequestsByMonth: {}, kyukoDaysByMonth: {} },
  { id: "eiyo_1", dept: "eiyo", name: "池田 恵",   role: "調理師",    nightOk: false, nightMax: 0, targetWork: 20, kyukoDays: 8, kiboByMonth: {}, shiftRequestsByMonth: {}, kyukoDaysByMonth: {} },
  { id: "eiyo_2", dept: "eiyo", name: "田中 美香", role: "栄養士",    nightOk: false, nightMax: 0, targetWork: 20, kyukoDays: 8, kiboByMonth: {}, shiftRequestsByMonth: {}, kyukoDaysByMonth: {} },
  { id: "eiyo_3", dept: "eiyo", name: "鈴木 直樹", role: "調理師",    nightOk: false, nightMax: 0, targetWork: 20, kyukoDays: 8, kiboByMonth: {}, shiftRequestsByMonth: {}, kyukoDaysByMonth: {} },
];

async function run(mode, label) {
  const browser = await chromium.launch({
    headless: true,
    executablePath: '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell',
  });
  const ctx = await browser.newContext();
  await ctx.route('https://dummy.supabase.co/**', route => {
    const url = route.request().url();
    if (url.includes('/auth/v1/')) return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(SESSION) });
    return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
  });

  const page = await ctx.newPage();
  const logs = [];
  page.on('console', msg => {
    const t = msg.text();
    // time engine logs
    if (t.includes('[TIME-PASSB-END]') || t.includes('[TIME-PassC') || t.includes('[TIME-不足補正') ||
        t.includes('[TIME-連休補正') || t.includes('[TIME-P2.5-SUMMARY]') ||
    // care engine logs
        t.includes('[PassC-非slot') || t.includes('[PassC-Tier2') || t.includes('[AG-Phase1] PassC')) {
      logs.push(t);
    }
  });
  page.on('dialog', async d => { await d.accept(); });

  await page.goto('http://localhost:5173/');
  await page.waitForTimeout(500);
  await page.evaluate(({ s, depts, staffList }) => {
    localStorage.setItem('sb-dummy-auth-token', JSON.stringify({ access_token: s.access_token, refresh_token: s.refresh_token, expires_at: s.expires_at, user: s.user }));
    localStorage.setItem('shiftNavi_depts', JSON.stringify(depts));
    localStorage.setItem('shiftNavi_staffList', JSON.stringify(staffList));
  }, { s: SESSION, depts: makeDepts(mode), staffList: STAFF });

  await page.reload();
  await page.waitForTimeout(2000);

  const tab = await page.$('text=栄養科');
  if (tab) { await tab.click(); await page.waitForTimeout(300); }

  const btn = await page.$('button:has-text("自動生成")');
  if (!btn) { console.log(`[${label}] ❌ 自動生成ボタンなし`); await browser.close(); return []; }
  await btn.click();
  await page.waitForTimeout(9000);

  await browser.close();
  return logs;
}

function analyze(label, logs) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`  ${label}`);
  console.log('='.repeat(60));

  if (label.includes('時間軸')) {
    // PassB終了時点
    const passbLines = logs.filter(l => l.includes('[TIME-PASSB-END]'));
    if (passbLines.length) {
      console.log('\n── PassB(Phase2)終了時点 ──');
      passbLines.forEach(l => console.log(' ', l.replace('[TIME-PASSB-END] ', '')));
    }

    // Pass C 追加
    const passcDetail = logs.filter(l => l.includes('[TIME-PassC-追加]'));
    const passcSummary = logs.find(l => l.includes('[TIME-PassC]') && !l.includes('-追加'));
    console.log('\n── Pass C 相当（連続勤務 > maxConsec → 休み）──');
    passcDetail.forEach(l => console.log(' ', l.replace('[TIME-PassC-追加] ', '')));
    if (passcSummary) console.log(' ', passcSummary);

    // 不足補正追加
    const shortageDetail = logs.filter(l => l.includes('[TIME-不足補正-追加]'));
    const shortageSummary = logs.find(l => l.includes('[TIME-不足補正]') && !l.includes('-追加'));
    console.log('\n── 公休不足補正（長連勤優先で休み追加）──');
    shortageDetail.forEach(l => console.log(' ', l.replace('[TIME-不足補正-追加] ', '')));
    if (shortageSummary) console.log(' ', shortageSummary);

    // 連休補正
    const consecFix = logs.find(l => l.includes('[TIME-連休補正]'));
    if (consecFix) { console.log('\n── 連続休み補正 ──'); console.log(' ', consecFix); }

    // サマリ
    const summaryLines = logs.filter(l => l.includes('[TIME-P2.5-SUMMARY]'));
    if (summaryLines.length) {
      console.log('\n── Phase2.5 全体サマリ ──');
      summaryLines.forEach(l => console.log(' ', l.replace('[TIME-P2.5-SUMMARY] ', '')));
    }

    // 数値集計
    const passcMatch = (passcSummary || '').match(/合計追加休み=(\d+)/);
    const shortageMatch = (shortageSummary || '').match(/合計追加休み=(\d+)/);
    const consecMatch = (consecFix || '').match(/件数=(\d+)/);
    const totalPassC = parseInt(passcMatch?.[1] || '0');
    const totalShortage = parseInt(shortageMatch?.[1] || '0');
    const totalConsecFixed = parseInt(consecMatch?.[1] || '0');
    console.log(`\n  ★ PassC追加=${totalPassC} 不足補正追加=${totalShortage} 連休補正(戻し)=${totalConsecFixed}`);
    console.log(`  ★ Phase2.5合計追加（PassC+不足）= ${totalPassC + totalShortage}`);
  } else {
    // care engine
    const nonSlot = logs.filter(l => l.includes('[PassC-非slot休み追加]'));
    const tier2 = logs.filter(l => l.includes('[PassC-Tier2休み追加]'));
    const summary = logs.find(l => l.includes('[AG-Phase1] PassC'));

    console.log('\n── PassC 非slot修復（直接追加）──');
    nonSlot.forEach(l => console.log(' ', l));
    console.log('\n── PassC Tier2吸収（隣接日を削除）──');
    tier2.forEach(l => console.log(' ', l));
    if (summary) { console.log('\n── PassC 合計 ──'); console.log(' ', summary); }
    if (!nonSlot.length && !tier2.length) console.log('  （PassC 追加なし）');
  }
}

async function main() {
  console.log('=== PassC 追加件数 調査 ===');
  console.log('同一栄養科データ（2026年6月）で生成\n');

  console.log('【1/2】時間軸エンジン (autoGenerateTime) 生成中...');
  const timeLogs = await run('time', '時間軸');

  console.log('【2/2】介護エンジン (autoGenerate) 生成中...');
  const careLogs = await run(undefined, '介護');

  analyze('時間軸エンジン (autoGenerateTime) — Phase2.5 診断', timeLogs);
  analyze('介護エンジン (autoGenerate) — PassC 診断', careLogs);

  // 比較表
  const timePCMatch = timeLogs.find(l => l.includes('[TIME-PassC]') && !l.includes('-追加'));
  const timeSHMatch = timeLogs.find(l => l.includes('[TIME-不足補正]') && !l.includes('-追加'));
  const careMatch   = careLogs.find(l => l.includes('[AG-Phase1] PassC'));
  const tPC = parseInt((timePCMatch || '').match(/合計追加休み=(\d+)/)?.[1] || '0');
  const tSH = parseInt((timeSHMatch || '').match(/合計追加休み=(\d+)/)?.[1] || '0');
  const cPC = parseInt((careMatch   || '').match(/合計追加休み=(\d+)/)?.[1] || '0');

  console.log('\n' + '='.repeat(60));
  console.log('  ★★★ 比較表 ★★★');
  console.log('='.repeat(60));
  console.log(`  時間軸エンジン PassC追加          : ${tPC} 件`);
  console.log(`  時間軸エンジン 不足補正追加        : ${tSH} 件`);
  console.log(`  時間軸エンジン 合計                : ${tPC + tSH} 件`);
  console.log(`  介護エンジン   PassC追加            : ${cPC} 件`);
  console.log(`  差                                  : ${tPC + tSH - cPC} 件多い`);
}

main().catch(e => { console.error('エラー:', e.message); process.exit(1); });
