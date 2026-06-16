/**
 * 目視確認スクリプト — autoGenerateTime vs autoGenerate（介護エンジン）
 * 同じ栄養課データを time エンジン / 介護エンジン両方で生成し、
 * 日ごとの勤務リズムを文字列で並べて目視比較できるようにする。
 */
const { chromium } = require('playwright');
const fs = require('fs');

const MOCK_USER_ID = 'test-user-00000000-0000-0000-0000-000000000001';
const MOCK_TOKEN = 'mock-access-token';

function makeDepts(mode) {
  // mode: 'time' で時間軸エンジン / undefined で介護エンジン
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
    shiftTimes: {
      早番: { start: "07:00", end: "16:00" },
      日勤: { start: "09:00", end: "18:00" },
    },
    intervalThreshold: 11,
  };
  if (mode) d.generationMode = mode;
  return [d];
}

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

// 1文字記号化（リズムを目で追いやすく）
function sym(v) {
  if (!v) return '·';
  if (v === '早番') return '早';
  if (v === '日勤') return '日';
  if (v === '遅番') return '遅';
  if (v === '夜勤') return '夜';
  if (v === '明け') return '明';
  if (v === '休み' || v === '休') return '休';
  if (v === '希望休' || v === '希') return '希';
  if (v === '有休' || v === '有') return '有';
  return v[0];
}

async function runCapture(mode, label, screenshotPath) {
  const browser = await chromium.launch({
    headless: true,
    executablePath: '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell',
  });
  const context = await browser.newContext({ viewport: { width: 1600, height: 900 } });
  await context.route('https://dummy.supabase.co/**', async (route) => {
    const url = route.request().url();
    if (url.includes('/auth/v1/')) return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(MOCK_SESSION) });
    return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
  });

  const page = await context.newPage();
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
  }, { session: MOCK_SESSION, depts: makeDepts(mode), staffList: TEST_STAFF });

  await page.reload();
  await page.waitForTimeout(2000);

  const eiyoTab = await page.$('text=栄養科');
  if (eiyoTab) { await eiyoTab.click(); await page.waitForTimeout(300); }

  const genBtn = await page.$('button:has-text("自動生成")');
  if (!genBtn) { console.log(`[${label}] ❌ 自動生成ボタンなし`); await browser.close(); return null; }
  await genBtn.click();
  await page.waitForTimeout(9000);

  await page.screenshot({ path: screenshotPath, fullPage: false });

  const shiftData = await page.evaluate(() => {
    const rows = document.querySelectorAll('table tr');
    const result = [];
    rows.forEach(row => {
      const cells = row.querySelectorAll('td, th');
      if (cells.length < 2) return;
      const name = cells[0].textContent.trim();
      if (!name || name.length < 2) return;
      const shifts = [];
      for (let i = 1; i < cells.length; i++) shifts.push(cells[i].textContent.trim() || '');
      if (shifts.some(s => s)) result.push({ name, shifts });
    });
    return result;
  });

  await browser.close();
  return { shiftData };
}

function printGrid(label, shiftData) {
  console.log(`\n========== ${label} ==========`);
  // ヘッダー（曜日: 2026年6月1日=月）
  const dow = ['月','火','水','木','金','土','日'];
  let header = '          ';
  for (let d = 1; d <= 30; d++) header += dow[(d - 1) % 7];
  console.log(header + '  (公休/最大連勤/最大連休)');
  for (const row of shiftData) {
    const name = row.name.replace(/\n/g, ' ').slice(0, 8);
    if (!name || name.length < 2) continue;
    const shifts = row.shifts.slice(0, 30);
    if (!shifts.some(s => s)) continue;
    const REST = new Set(['休み','希望休','有休','休','希','有']);
    let line = '';
    let rest = 0, cw = 0, mcw = 0, cr = 0, mcr = 0;
    for (let i = 0; i < 30; i++) {
      const v = shifts[i] || '';
      line += sym(v);
      const isRest = REST.has(v);
      const isWork = v && !isRest;
      if (isRest) { rest++; cr++; mcr = Math.max(mcr, cr); cw = 0; }
      else if (isWork) { cw++; mcw = Math.max(mcw, cw); cr = 0; }
      else { cw = 0; cr = 0; }
    }
    console.log(`${name.padEnd(9, '　')}${line}  (休${rest}/勤${mcw}/休${mcr})`);
  }
}

async function main() {
  const outDir = '/tmp/shift-visual';
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir);

  console.log('### 時間軸エンジン (autoGenerateTime) ###');
  const t = await runCapture('time', 'TIME', `${outDir}/time.png`);
  if (t) printGrid('時間軸エンジン', t.shiftData);

  console.log('\n\n### 介護エンジン (autoGenerate) ###');
  const c = await runCapture(undefined, 'CARE', `${outDir}/care.png`);
  if (c) printGrid('介護エンジン', c.shiftData);

  console.log(`\n\nスクショ: ${outDir}/time.png  ${outDir}/care.png`);
}

main().catch(e => { console.error('エラー:', e.message); process.exit(1); });
