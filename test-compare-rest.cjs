/**
 * 修正前後比較スクリプト — autoGenerateTime 公休配置改善確認
 * 栄養科データ（roleShiftTypes: { 調理師: ['早番'] }）で自動生成し
 * 修正後の公休分散・連休・偏り・違反件数を報告する。
 */
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const MOCK_USER_ID = 'test-user-00000000-0000-0000-0000-000000000001';
const MOCK_TOKEN = 'mock-access-token';
const MK = '2026-6';

// 栄養科部署（time エンジン・roleShiftTypes付き）
const TEST_DEPTS = [
  {
    id: "eiyo", label: "栄養科", icon: "🍱",
    generationMode: 'time',  // ← 時間軸エンジンを使用
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
    shiftTimes: {
      早番: { start: "07:00", end: "16:00" },
      日勤: { start: "09:00", end: "18:00" },
    },
    intervalThreshold: 11,
  }
];

const TEST_STAFF = [
  { id: "eiyo_0", dept: "eiyo", name: "清水 優子", role: "管理栄養士",
    nightOk: false, nightMax: 0, targetWork: 20, kyukoDays: 8,
    kiboByMonth: {}, shiftRequestsByMonth: {}, kyukoDaysByMonth: {} },
  { id: "eiyo_1", dept: "eiyo", name: "池田 恵", role: "調理師",
    nightOk: false, nightMax: 0, targetWork: 20, kyukoDays: 8,
    kiboByMonth: {}, shiftRequestsByMonth: {}, kyukoDaysByMonth: {} },
  { id: "eiyo_2", dept: "eiyo", name: "田中 美香", role: "栄養士",
    nightOk: false, nightMax: 0, targetWork: 20, kyukoDays: 8,
    kiboByMonth: {}, shiftRequestsByMonth: {}, kyukoDaysByMonth: {} },
  { id: "eiyo_3", dept: "eiyo", name: "鈴木 直樹", role: "調理師",
    nightOk: false, nightMax: 0, targetWork: 20, kyukoDays: 8,
    kiboByMonth: {}, shiftRequestsByMonth: {}, kyukoDaysByMonth: {} },
];

const MOCK_SESSION = {
  access_token: MOCK_TOKEN,
  refresh_token: 'mock-refresh-token',
  expires_at: Math.floor(Date.now() / 1000) + 3600,
  user: { id: MOCK_USER_ID, email: 'test@example.com', role: 'authenticated', aud: 'authenticated' },
};

async function runCapture(label, screenshotPath) {
  const browser = await chromium.launch({
    headless: true,
    executablePath: '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell',
  });
  const context = await browser.newContext({ viewport: { width: 1400, height: 900 } });

  await context.route('https://dummy.supabase.co/**', async (route) => {
    const url = route.request().url();
    if (url.includes('/auth/v1/')) return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(MOCK_SESSION) });
    if (url.includes('/rest/v1/')) return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
    return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
  });

  const page = await context.newPage();
  const consoleLogs = [];
  page.on('console', msg => {
    const t = msg.text();
    if (t.includes('roleShift') || t.includes('violation') || t.includes('ROLE-VIOL') || t.includes('TIME-ROLE')) {
      consoleLogs.push(`[${msg.type()}] ${t}`);
    }
  });
  page.on('dialog', async d => { await d.accept(); });

  await page.goto('http://localhost:5173/');
  await page.waitForTimeout(500);

  await page.evaluate(({ session, depts, staffList }) => {
    localStorage.setItem('sb-dummy-auth-token', JSON.stringify({
      access_token: session.access_token, refresh_token: session.refresh_token,
      expires_at: session.expires_at, user: session.user,
    }));
    localStorage.setItem('shiftNavi_depts', JSON.stringify(depts));
    localStorage.setItem('shiftNavi_staffList', JSON.stringify(staffList));
  }, { session: MOCK_SESSION, depts: TEST_DEPTS, staffList: TEST_STAFF });

  await page.reload();
  await page.waitForTimeout(2000);

  // 栄養科タブ
  const eiyoTab = await page.$('text=栄養科');
  if (eiyoTab) { await eiyoTab.click(); await page.waitForTimeout(300); }

  // 自動生成
  const genBtn = await page.$('button:has-text("自動生成")');
  if (!genBtn) { console.log('❌ 自動生成ボタンなし'); await browser.close(); return null; }
  await genBtn.click();
  await page.waitForTimeout(10000);

  // スクリーンショット
  await page.screenshot({ path: screenshotPath, fullPage: false });

  // DOM からシフト表を読み取る
  const shiftData = await page.evaluate(() => {
    const rows = document.querySelectorAll('table tr');
    const result = [];
    rows.forEach(row => {
      const cells = row.querySelectorAll('td, th');
      if (cells.length < 2) return;
      const name = cells[0].textContent.trim();
      if (!name || name.length < 2) return;
      const shifts = [];
      for (let i = 1; i < cells.length; i++) {
        shifts.push(cells[i].textContent.trim() || '');
      }
      if (shifts.some(s => s)) result.push({ name, shifts });
    });
    return result;
  });

  // 違反バナー
  const violBanner = await page.$('text=役職制限:');
  const violText = violBanner ? await violBanner.textContent() : null;

  await browser.close();
  return { shiftData, violText, consoleLogs };
}

function analyzeShifts(shiftData) {
  const REST = new Set(['休', '希', '有']);
  const results = [];
  for (const row of shiftData) {
    const name = row.name;
    const shifts = row.shifts.slice(0, 30); // 1〜30日
    const restDays = [];
    const workDays = [];
    for (let i = 0; i < shifts.length; i++) {
      const s = shifts[i];
      if (REST.has(s) || s === '休み' || s === '希望休' || s === '有休' || s === '休') {
        restDays.push(i + 1);
      } else if (s && s !== '' && s !== '－') {
        workDays.push(i + 1);
      }
    }
    // 連続休み最大
    let maxConsecRest = 0, cur = 0;
    for (let i = 0; i < shifts.length; i++) {
      const isRest = REST.has(shifts[i]) || ['休み','希望休','有休','休'].includes(shifts[i]);
      if (isRest) { cur++; maxConsecRest = Math.max(maxConsecRest, cur); }
      else cur = 0;
    }
    // 連続勤務最大
    let maxConsecWork = 0; cur = 0;
    for (let i = 0; i < shifts.length; i++) {
      const isWork = !REST.has(shifts[i]) && shifts[i] && shifts[i] !== '' && shifts[i] !== '－';
      if (isWork) { cur++; maxConsecWork = Math.max(maxConsecWork, cur); }
      else cur = 0;
    }
    // 前半(1-15)・後半(16-30)の休み分布
    const front = restDays.filter(d => d <= 15).length;
    const back = restDays.filter(d => d > 15).length;

    results.push({
      name: name.replace(/\n/g, ' ').slice(0, 10),
      restCount: restDays.length,
      restDays: restDays.join(','),
      maxConsecRest,
      maxConsecWork,
      front,
      back,
      balance: Math.abs(front - back),
    });
  }
  return results;
}

async function main() {
  const outDir = '/tmp/shift-compare';
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir);

  console.log('=== 修正後 自動生成 ===');
  const after = await runCapture('after', `${outDir}/after.png`);

  if (!after) { console.log('生成失敗'); return; }

  console.log('\n── 修正後 シフト分析 ──');
  const afterAnalysis = analyzeShifts(after.shiftData);
  afterAnalysis.forEach(r => {
    console.log(`  ${r.name}: 公休${r.restCount}日 | 最大連続休${r.maxConsecRest}日 | 最大連続勤${r.maxConsecWork}日 | 前半${r.front}後半${r.back}(差${r.balance}) | 休み日=[${r.restDays}]`);
  });

  // roleShiftTypes違反チェック
  if (after.violText) {
    console.log(`\n❌ roleShiftTypes違反: ${after.violText}`);
  } else {
    console.log('\n✅ roleShiftTypes違反: 0件');
  }

  if (after.consoleLogs.length > 0) {
    console.log('\n── console（role違反関連）──');
    after.consoleLogs.forEach(l => console.log(l));
  }

  // 総合評価
  console.log('\n── 総合評価 ──');
  const problems = [];
  afterAnalysis.forEach(r => {
    if (r.maxConsecRest >= 4) problems.push(`${r.name}: 4連休以上(${r.maxConsecRest}日)`);
    if (r.maxConsecWork > 5) problems.push(`${r.name}: 連続勤務超過(${r.maxConsecWork}日)`);
    if (r.balance >= 3) problems.push(`${r.name}: 前後半偏り(差${r.balance})`);
    if (r.restCount !== 8) problems.push(`${r.name}: 公休数誤差(${r.restCount}日 ≠ 8日目標)`);
  });
  if (problems.length === 0) {
    console.log('✅ 全員: 公休8日・連続勤務≤5・4連休なし・前後半バランス良好');
  } else {
    problems.forEach(p => console.log(`  ⚠️  ${p}`));
  }

  console.log(`\nスクリーンショット: ${outDir}/after.png`);
}

main().catch(e => { console.error('エラー:', e.message); process.exit(1); });
