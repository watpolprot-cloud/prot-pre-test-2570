const fs = require('fs'), vm = require('vm'), assert = require('assert');
const { makeEnv } = require('./gas-mock');
const SRC = fs.readFileSync(__dirname + '/../apps-script/Code.gs', 'utf8');
function load(opts) {
  const env = makeEnv(opts);
  const ctx = vm.createContext(Object.assign({ Date, Math, JSON, Number, String, Object, Array, RegExp, Error, isNaN }, env));
  vm.runInContext(SRC, ctx);
  return { ctx, env };
}
let pass = 0, fail = 0;
function t(name, fn) { try { fn(); pass++; console.log('  ok  ', name); } catch (e) { fail++; console.log('  FAIL', name, '\n       ', e.message); } }

// ---------- helpers ----------
function crc16(str) { let crc = 0xFFFF; for (const ch of str) { crc ^= (ch.charCodeAt(0) & 0xFF) << 8; for (let b = 0; b < 8; b++) crc = (crc & 0x8000) ? ((crc << 1) ^ 0x1021) & 0xFFFF : (crc << 1) & 0xFFFF; } return crc.toString(16).toUpperCase().padStart(4, '0'); }
function tlv(tag, v) { return tag + String(v.length).padStart(2, '0') + v; }
function slipQr(bank, ref) { const body = tlv('00', tlv('00', '000001') + tlv('01', bank) + tlv('02', ref)) + tlv('51', 'TH') + '9104'; return body + crc16(body); }
function validId(prefix12) { let s = 0; for (let i = 0; i < 12; i++) s += +prefix12[i] * (13 - i); return prefix12 + ((11 - s % 11) % 10); }
const TH_ABBR = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
function thaiShort(d) { return d.getDate() + ' ' + TH_ABBR[d.getMonth()] + ' ' + String(d.getFullYear() + 543).slice(2) + ' ' + String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0'); }
function ktbSlipText(amount, when, acc = 'xxx-x-x3838-x', name = 'เงินสวัสดิการโรงเรียนพรตพิทยพยัต') {
  return `กรุงไทย\nโอนเงินสำเร็จ\nรหัสอ้างอิง 202611250512345678\nจาก\nนาย ทดสอบ ระบบ\nxxx-x-x1234-x\nไปยัง\n${name}\n${acc}\nจำนวนเงิน\n${amount.toFixed(2)} บาท\nค่าธรรมเนียม\n0.00 บาท\nวันที่ทำรายการ\n${thaiShort(when)}`;
}
const fakeImg = Buffer.from('fake-image-' + Math.random()).toString('base64');
function payload(students, phone, qr, img = fakeImg) {
  return { consent: true, guardian: { name: 'นางทดสอบ ผู้ปกครอง', phone, email: 'p@example.com' }, students, slip: { mimeType: 'image/jpeg', base64: img }, qrData: qr };
}
const ID1 = validId('123456789012'), ID2 = validId('123456789013'), ID3 = validId('323456789014');

console.log('Unit: parsers');
const { ctx: U } = load();
t('accountMatches_ masked KTB', () => { assert(U.accountMatches_('xxx-x-x3838-x')); assert(U.accountMatches_('XXX-X-X3838-X')); assert(U.accountMatches_('693-0-53838-8')); });
t('accountMatches_ rejects other', () => { assert(!U.accountMatches_('xxx-x-x1234-x')); assert(!U.accountMatches_('xxx-x-x3838-9')); assert(!U.accountMatches_('1234')); });
t('accountMatches_ partial x3838x', () => { assert(U.accountMatches_('x3838x')); assert(!U.accountMatches_('3838')); });
t('isThaiId_', () => { assert(U.isThaiId_(ID1)); assert(!U.isThaiId_('1234567890123')); });
t('parseThaiDateTime_ short BE', () => { const d = U.parseThaiDateTime_('24 ม.ค. 70 10:15'); assert.equal(d.getFullYear(), 2027); assert.equal(d.getMonth(), 0); assert.equal(d.getDate(), 24); assert.equal(d.getHours(), 10); assert(d.hasTime); });
t('parseThaiDateTime_ full month BE', () => { const d = U.parseThaiDateTime_('วันที่ 3 มกราคม 2570 - 09:05:33'); assert.equal(d.getFullYear(), 2027); assert.equal(d.getMinutes(), 5); });
t('parseThaiDateTime_ numeric', () => { const d = U.parseThaiDateTime_('03/01/2570 14.20 น.'); assert.equal(d.getFullYear(), 2027); assert.equal(d.getHours(), 14); });
t('parseThaiDateTime_ english', () => { const d = U.parseThaiDateTime_('05 Jan 2027 08:01'); assert.equal(d.getFullYear(), 2027); assert.equal(d.getHours(), 8); });
t('parseThaiDateTime_ thai digits', () => { const d = U.parseThaiDateTime_('๒๔ ม.ค. ๗๐ ๑๐:๑๕'); assert.equal(d.getDate(), 24); assert.equal(d.getHours(), 10); });
t('parseThaiDateTime_ no time', () => { const d = U.parseThaiDateTime_('24 ม.ค. 2570'); assert(d && !d.hasTime); });
t('analyzeSlipText_ KTB ok', () => { const r = U.analyzeSlipText_(ktbSlipText(198, new Date(2027, 0, 5, 10, 15)), 198); assert(r.accountMatched, 'acc'); assert(r.nameMatched, 'name'); assert(r.amountMatched, 'amt ' + r.amounts); assert.equal(r.ref, '202611250512345678'); });
t('analyzeSlipText_ spaced hyphens (OCR)', () => { const r = U.analyzeSlipText_('ไปยัง เงินสวัสดิการโรงเรียนพรตพิทยพยัต\nXXX - X - X3838 - X\nจำนวน: 99.00 บาท', 99); assert(r.accountMatched); assert(r.amountMatched); });
t('analyzeSlipText_ wrong amount', () => { const r = U.analyzeSlipText_(ktbSlipText(99, new Date()), 198); assert(!r.amountMatched); assert.deepEqual(Array.from(r.amounts), [99]); });
t('analyzeSlipText_ wrong account', () => { const r = U.analyzeSlipText_(ktbSlipText(99, new Date(), 'xxx-x-x9999-x', 'นาย ข'), 99); assert(!r.accountMatched); assert(!r.nameMatched); });
t('analyzeSlipText_ time 10.15 น. not amount', () => { const r = U.analyzeSlipText_('99.00 บาท 24 ม.ค. 70 10.15 น.', 99); assert.deepEqual(Array.from(r.amounts), [99]); });
t('parseSlipQr_ valid', () => { const q = U.parseSlipQr_(slipQr('006', '2026112512345ABCDEF')); assert(q.isSlipQr); assert(q.crcOk); assert.equal(q.bankName, 'กรุงไทย'); assert.equal(q.transRef, '2026112512345ABCDEF'); });
t('parseSlipQr_ tampered crc', () => { const s = slipQr('004', 'REF1234567890'); const bad = s.slice(0, 20) + (s[20] === '1' ? '2' : '1') + s.slice(21); const q = U.parseSlipQr_(bad); assert(!q.crcOk); });
t('parseSlipQr_ promptpay QR is not slip', () => { const q = U.parseSlipQr_('00020101021129370016A000000677010111011300669999999995802TH53037646304ABCD'); assert(!q.isSlipQr); });
t('parseSlipQr_ garbage', () => { const q = U.parseSlipQr_('https://example.com'); assert(!q.isSlipQr); });

console.log('Flow: register → verify → reconcile → seats → results → login');
const now = new Date(); const paidAt = new Date(now.getTime() - 5 * 60000); paidAt.setSeconds(0, 0);
const { ctx: G, env: E } = load({ ocrText: ktbSlipText(198, paidAt) });
const sheet = n => E._sheets[n];
const setSetting = (k, v) => { const sh = sheet('ตั้งค่า'); const row = sh.data.findIndex(r => r[0] === k); assert(row > 0, 'no setting ' + k); sh.data[row][1] = v; };
const rowsOf = n => { const d = sheet(n).data; return d.slice(1).map(r => Object.fromEntries(d[0].map((h, i) => [h, r[i]]))); };
t('setup creates tabs', () => { G.setup(); ['ผู้สมัคร', 'การชำระเงิน', 'รายการเงินเข้า', 'ห้องสอบ', 'ผลสอบ', 'กำหนดการ', 'ตารางเวลาวันสอบ', 'ตั้งค่า'].forEach(n => assert(sheet(n), n)); assert.equal(rowsOf('ห้องสอบ').length, 15); });
t('closed registration rejects', () => { assert.throws(() => G.submitApplication(payload([], '0812345678', '')), /ไม่อยู่ในช่วง/); });
let r1;
t('submit 2 students → SLIP_OK', () => {
  setSetting('เปิดรับสมัคร', true);
  r1 = G.submitApplication(payload([
    { prefix: 'เด็กหญิง', firstName: 'ก', lastName: 'ทดสอบ', idCard: ID1, grade: 'ป.6', school: 'รร.ก' },
    { prefix: 'นาย', firstName: 'ข', lastName: 'ทดสอบ', idCard: ID3, grade: 'ม.3', school: 'รร.ข' }], '0812345678', slipQr('006', 'REFAAA111222333')));
  assert.equal(r1.applicants.length, 2); assert.equal(r1.applicants[0].appId, 'P700001'); assert.equal(r1.applicants[1].appId, 'M700001');
  const p = rowsOf('การชำระเงิน')[0];
  assert.equal(p['สถานะ'], G.STATUS.SLIP_OK, p['รายละเอียดผลตรวจ']);
  assert.equal(p['ยอดที่ต้องชำระ'], 198); assert(p['วันเวลาโอน'] instanceof Date); assert.equal(p['เลขอ้างอิงธุรกรรม'], 'REFAAA111222333');
  assert.equal(E._mails.length, 1);
  assert.equal(rowsOf('ผู้สมัคร')[0]['เบอร์โทรศัพท์'], '0812345678');
});
t('duplicate id rejected', () => { assert.throws(() => G.submitApplication(payload([{ prefix: 'เด็กชาย', firstName: 'ค', lastName: 'ซ้ำ', idCard: ID1, grade: 'ป.5', school: 'x' }], '0899999999', '')), /สมัครไว้แล้ว/); });
t('same slip reused → NEED_CHECK', () => {
  const r = G.submitApplication(payload([{ prefix: 'เด็กชาย', firstName: 'ง', lastName: 'ซ้ำสลิป', idCard: ID2, grade: 'ป.5', school: 'x' }], '0899999999', slipQr('006', 'REFAAA111222333')));
  const p = rowsOf('การชำระเงิน').find(x => x['เลขที่รายการ'] === r.submissionId);
  assert.equal(p['สถานะ'], G.STATUS.NEED_CHECK);
  assert(/ไฟล์สลิปซ้ำ/.test(p['รายละเอียดผลตรวจ']) && /QR บนสลิปซ้ำ/.test(p['รายละเอียดผลตรวจ']), p['รายละเอียดผลตรวจ']);
});
t('login before payment confirmed → pending, no seat', () => {
  const r = G.route_({ action: 'login', id: ID1, phone: '081-234-5678' });
  assert(r.ok, r.error); assert.equal(r.payment.state, 'pending'); assert.equal(r.seat, null); assert.equal(r.name, 'เด็กหญิงก ทดสอบ'); assert(!JSON.stringify(r).includes(ID1));
});
t('login by appId works', () => { const r = G.route_({ action: 'login', id: 'm700001', phone: '0812345678' }); assert(r.ok, r.error); assert.equal(r.groupCode, 'M'); });
t('wrong phone fails, then rate-limited', () => {
  for (let i = 0; i < 8; i++) assert(!G.route_({ action: 'login', id: ID3, phone: '0800000000' }).ok);
  const r = G.route_({ action: 'login', id: ID3, phone: '0812345678' }); assert(!r.ok); assert(/หลายครั้ง/.test(r.error));
});
t('reconcile with statement → CONFIRMED', () => {
  const st = sheet('รายการเงินเข้า');
  const d = new Date(paidAt.getFullYear(), paidAt.getMonth(), paidAt.getDate());
  st.data.push([d, String(paidAt.getHours()).padStart(2, '0') + ':' + String(paidAt.getMinutes() + 1).padStart(2, '0'), 198, 'โอนเข้า', '', '']);
  st.data.push([d, '23:59', 99, 'อื่น', '', '']);
  const out = G.reconcile_(null);
  assert.equal(out.matched.length, 1, JSON.stringify(out));
  const p = rowsOf('การชำระเงิน')[0]; assert.equal(p['สถานะ'], G.STATUS.CONFIRMED); assert.equal(st.data[1][4], p['เลขที่รายการ']);
});
t('reconcile does not reuse a matched credit', () => { const out = G.reconcile_(null); assert.equal(out.matched.length, 0); });
t('assign seats needs capacity', () => { const rep = G.assignSeats_(); assert(/ยังไม่ได้ใส่ความจุ/.test(rep.join('\n'))); });
t('assign seats', () => {
  sheet('ห้องสอบ').data.slice(1).forEach(r => r[3] = 30);
  const rep = G.assignSeats_(); assert(/จัดแล้ว 1\/1/.test(rep[0]), rep.join('|'));
  const a = rowsOf('ผู้สมัคร'); assert.equal(a[0]['เลขที่นั่งสอบ'], 'P0101'); assert.equal(a[0]['ห้องสอบ'], '531'); assert.equal(a[1]['เลขที่นั่งสอบ'], 'M0101'); assert.equal(a[2]['เลขที่นั่งสอบ'], '');
});
t('re-run keeps existing seats, adds newcomers', () => {
  const ap = sheet('ผู้สมัคร'), ah = ap.data[0], pay = sheet('การชำระเงิน'), ph = pay.data[0];
  ap.data[1][ah.indexOf('เลขที่นั่งสอบ')] = 'P0105'; // สมมุติว่าคนแรกได้ P0105 ไว้แล้ว
  const row = pay.data.findIndex(r => r[0] === 'T700002'); const prev = pay.data[row][ph.indexOf('สถานะ')];
  pay.data[row][ph.indexOf('สถานะ')] = G.STATUS.CONFIRMED;
  let rep = G.assignSeats_(false); assert(/ใหม่ 1 · คงเลขเดิม 1/.test(rep[0]), rep.join('|'));
  let a = rowsOf('ผู้สมัคร'); assert.equal(a[0]['เลขที่นั่งสอบ'], 'P0105'); assert.equal(a[2]['เลขที่นั่งสอบ'], 'P0101'); assert.equal(a[1]['เลขที่นั่งสอบ'], 'M0101');
  G.assignSeats_(true); a = rowsOf('ผู้สมัคร'); assert.equal(a[0]['เลขที่นั่งสอบ'], 'P0101'); assert.equal(a[2]['เลขที่นั่งสอบ'], 'P0102');
  pay.data[row][ph.indexOf('สถานะ')] = prev; // ไม่ได้ยืนยันแล้ว → ล้างที่นั่ง
  rep = G.assignSeats_(false); a = rowsOf('ผู้สมัคร'); assert.equal(a[2]['เลขที่นั่งสอบ'], ''); assert.equal(a[0]['เลขที่นั่งสอบ'], 'P0101'); assert(/ล้างที่นั่ง/.test(rep[0]), rep.join('|'));
});
t('seat hidden until published', () => { const r = G.route_({ action: 'login', id: ID1, phone: '0812345678' }); assert.equal(r.payment.state, 'ok'); assert.equal(r.seat, null); });
t('seat shown after publish', () => { setSetting('ประกาศที่นั่งสอบ', true); const r = G.route_({ action: 'login', id: ID1, phone: '0812345678' }); assert.equal(r.seat.seatNo, 'P0101'); assert.equal(r.seat.building, 'อาคาร 5'); });
t('results + rank', () => {
  const rs = sheet('ผลสอบ'); rs.data.push(['P700001', 20, 18, 22, 15, 24, '', '']); rs.data.push(['M700001', 10, 10, 10, 10, 10, '', '']);
  G.computeResults_(); assert.equal(rs.data[1][6], 99); assert.equal(rs.data[1][7], 1);
  setSetting('ประกาศผลสอบ', true); setSetting('แสดงอันดับในผลสอบ', true);
  let r = G.route_({ action: 'login', id: ID1, phone: '0812345678' });
  assert.equal(r.result.total, 99); assert.equal(r.result.totalFull, null);
  setSetting('คะแนนเต็มต่อวิชา', 25);
  r = G.route_({ action: 'login', id: ID1, phone: '0812345678' });
  assert.equal(r.result.total, 99); assert.equal(r.result.totalFull, 125); assert.equal(r.result.rank, 1); assert(r.result.top10); assert.equal(r.result.scores.length, 5);
});
t('statsOf_: T-score & percentile rank', () => {
  const st = G.statsOf_([10, 20, 30, 40, 50], 40);
  assert.equal(st.n, 5); assert.equal(st.mean, 30); assert.equal(st.sd, 15.81); assert.equal(st.t, 56.3); assert.equal(st.pr, 70);
  assert.equal(st.max, 50); assert.equal(st.min, 10);
  const tie = G.statsOf_([10, 20, 20, 30], 20); assert.equal(tie.pr, 50);
  const blank = G.statsOf_([null, 12, null], 12); assert.equal(blank.n, 1); assert.equal(blank.t, null); assert.equal(blank.pr, 50);
  assert.equal(G.statsOf_([1, 2], null), null);
});
t('login result includes field statistics', () => {
  const r = G.route_({ action: 'login', id: ID1, phone: '0812345678' });
  assert(r.result.totalStats, 'totalStats'); assert.equal(r.result.totalStats.n, 1); assert.equal(r.result.rankOf, 1);
  assert(r.result.scores[0].stats); assert.equal(r.result.scores[0].stats.mean, 20);
  setSetting('แสดงค่าสถิติในผลสอบ', false);
  const r2 = G.route_({ action: 'login', id: ID1, phone: '0812345678' });
  assert.equal(r2.result.totalStats, null); assert.equal(r2.result.scores[0].stats, null);
  setSetting('แสดงค่าสถิติในผลสอบ', true);
});
t('rejected applicant can re-register & sees message', () => {
  const pay = sheet('การชำระเงิน'); const hd = pay.data[0];
  const row = pay.data.findIndex(r => r[0] === 'T700002');
  pay.data[row][hd.indexOf('สถานะ')] = G.STATUS.REJECTED; pay.data[row][hd.indexOf('ข้อความแจ้งผู้สมัคร')] = 'สลิปซ้ำ กรุณาติดต่อ';
  const r = G.route_({ action: 'login', id: ID2, phone: '0899999999' }); assert.equal(r.payment.state, 'rejected'); assert.equal(r.payment.message, 'สลิปซ้ำ กรุณาติดต่อ');
});
t('capacity full blocks', () => {
  setSetting('รับสูงสุด กลุ่ม M', 1);
  assert.throws(() => G.submitApplication(payload([{ prefix: 'นาย', firstName: 'จ', lastName: 'เต็ม', idCard: validId('523456789079'), grade: 'ม.3', school: 'x' }], '0811111111', '', Buffer.from('other').toString('base64'))), /เต็มแล้ว/);
  const info = G.route_({ action: 'info' }); assert(info.config.groups.find(g => g.code === 'M').full); assert(!info.config.groups.find(g => g.code === 'P').full);
});
t('info api has no personal data', () => {
  const info = G.route_({ action: 'info' }); const s = JSON.stringify(info);
  assert(info.ok); assert.equal(info.timetable.length, 4); assert(!s.includes('ทดสอบ') && !s.includes('0812345678'));
});
t('wrong-account slip → NEED_CHECK', () => {
  E._ocrText = ktbSlipText(99, paidAt, 'xxx-x-x5555-x', 'นาย คนอื่น');
  setSetting('รับสูงสุด กลุ่ม M', '');
  const r = G.submitApplication(payload([{ prefix: 'นาย', firstName: 'ฉ', lastName: 'ผิดบัญชี', idCard: validId('523456789079'), grade: 'ม.3', school: 'x' }], '0822222222', slipQr('014', 'REFBBB999'), Buffer.from('another').toString('base64')));
  const p = rowsOf('การชำระเงิน').find(x => x['เลขที่รายการ'] === r.submissionId);
  assert.equal(p['สถานะ'], G.STATUS.NEED_CHECK); assert(/ไม่พบเลขบัญชีโรงเรียน/.test(p['รายละเอียดผลตรวจ'])); assert.equal(p['ธนาคารผู้โอน (จาก QR)'], 'ไทยพาณิชย์');
});
t('OCR unavailable → NEED_CHECK not crash', () => {
  const saved = G.Drive; G.Drive = undefined; vm.runInContext('Drive = undefined', G);
  const r = G.submitApplication(payload([{ prefix: 'นาย', firstName: 'ช', lastName: 'ไม่มีOCR', idCard: validId('523456789080'), grade: 'ม.3', school: 'x' }], '0833333333', '', Buffer.from('another2').toString('base64')));
  const p = rowsOf('การชำระเงิน').find(x => x['เลขที่รายการ'] === r.submissionId);
  assert.equal(p['สถานะ'], G.STATUS.NEED_CHECK); assert(/OCR/.test(p['รายละเอียดผลตรวจ']), p['รายละเอียดผลตรวจ']);
});
t('validation errors', () => {
  assert.throws(() => G.submitApplication(payload([{ prefix: 'นาย', firstName: 'a', lastName: 'b', idCard: '1234567890123', grade: 'ม.3', school: 'x' }], '0812345678', '')), /เลขประจำตัวประชาชนไม่ถูกต้อง/);
  assert.throws(() => G.submitApplication(payload([{ prefix: 'นาย', firstName: 'a', lastName: 'b', idCard: validId('523456789081'), grade: 'ม.2', school: 'x' }], '0812345678', '')), /ชั้นปัจจุบัน/);
  assert.throws(() => G.submitApplication(payload([{ prefix: 'นาย', firstName: 'a', lastName: 'b', idCard: validId('523456789081'), grade: 'ม.3', school: 'x' }], '12345', '')), /เบอร์โทร/);
});

console.log('Claude API (ทางเลือก): จำลองการตอบกลับ');
{
  const { ctx: A, env: AE } = load();
  A.setup();
  const sh = AE._sheets['ตั้งค่า']; const setA = (k, v) => { const r = sh.data.findIndex(x => x[0] === k); assert(r > 0, 'no setting ' + k); sh.data[r][1] = v; };
  setA('เปิดรับสมัคร', true);
  A.PropertiesService.getScriptProperties().setProperty('ANTHROPIC_API_KEY', 'test-key-not-real');
  const when = new Date(Date.now() - 60 * 60 * 1000);
  const p2 = n => String(n).padStart(2, '0');
  const whenTxt = p2(when.getDate()) + '/' + p2(when.getMonth() + 1) + '/' + (when.getFullYear() + 543) + ' ' + p2(when.getHours()) + ':' + p2(when.getMinutes());
  let reqs = [], reply = null;
  A.UrlFetchApp.fetch = (url, o) => { reqs.push({ url, o, body: JSON.parse(o.payload) }); const r = typeof reply === 'function' ? reply() : reply; return { getResponseCode: () => r.code, getContentText: () => JSON.stringify(r.json) }; };
  const okJson = d => ({ code: 200, json: { model: 'claude-opus-5-5', stop_reason: 'end_turn', content: [{ type: 'text', text: JSON.stringify(d) }] } });
  const good = { is_bank_transfer_slip: true, receiver_name: 'เงินสวัสดิการโรงเรียนพรตพิทยพยัต', receiver_account_as_shown: 'xxx-x-x3838-x', amount: '99.00', transfer_datetime: whenTxt, reference_no: 'AIREF20261125001', signs_of_editing: [] };
  let n = 0;
  const submit = (ocr, data) => {
    AE._ocrText = ocr; reply = data; n++;
    const r = A.submitApplication(payload([{ prefix: 'เด็กชาย', firstName: 'เอไอ' + n, lastName: 'ทดสอบ', idCard: validId('7234567890' + p2(n)), grade: 'ป.6', school: 'x' }], '0870000000', '', Buffer.from('ai-img-' + n).toString('base64')));
    const pay = AE._sheets['การชำระเงิน'].data; const hd = pay[0];
    const row = pay.find(x => x[0] === r.submissionId); return Object.fromEntries(hd.map((h, i) => [h, row[i]]));
  };
  t('interpretAiSlip_ reads fields', () => {
    const i = A.interpretAiSlip_(good, 99);
    assert(i.accountMatched && i.nameMatched && i.amountMatched); assert.equal(i.amount, 99); assert(i.datetime && i.datetime.hasTime); assert.equal(i.ref, 'AIREF20261125001');
    const j = A.interpretAiSlip_(Object.assign({}, good, { receiver_account_as_shown: '', amount: '', transfer_datetime: '' }), 99);
    assert(!j.accountMatched && !j.amountMatched && j.amount === null && !j.datetime);
  });
  t('OCR unreadable + Claude reads slip → SLIP_OK', () => {
    const p = submit('ภาพไม่ชัด', okJson(good));
    assert.equal(p['สถานะ'], A.STATUS.SLIP_OK, p['รายละเอียดผลตรวจ']);
    assert(/อ่านได้จาก Claude/.test(p['รายละเอียดผลตรวจ']), p['รายละเอียดผลตรวจ']);
    assert(p['วันเวลาโอน'] instanceof Date); assert.equal(p['เลขอ้างอิงธุรกรรม'], 'AIREF20261125001'); assert.equal(p['เลขบัญชีผู้รับ'], 'xxx-x-x3838-x');
    const q = reqs[reqs.length - 1];
    assert.equal(q.url, 'https://api.anthropic.com/v1/messages'); assert.equal(q.o.headers['x-api-key'], 'test-key-not-real'); assert.equal(q.o.headers['anthropic-version'], '2026-10-21');
    assert.equal(q.body.model, 'claude-opus-5-5'); assert.equal(q.body.fallbacks, 'default'); assert.equal(q.o.headers['anthropic-beta'], 'server-side-fallback-2026-07-01');
    assert.equal(q.body.output_config.format.type, 'json_schema'); assert.equal(q.body.output_config.effort, 'low');
    assert.equal(q.body.messages[0].content[0].type, 'image'); assert(!('temperature' in q.body));
  });
  t('same transaction ref from Claude → duplicate', () => {
    const p = submit('ภาพไม่ชัด', okJson(good));
    assert.equal(p['สถานะ'], A.STATUS.NEED_CHECK); assert(/เลขอ้างอิงธุรกรรมซ้ำ/.test(p['รายละเอียดผลตรวจ']), p['รายละเอียดผลตรวจ']);
  });
  t('Claude sees editing → NEED_CHECK', () => {
    const p = submit(ktbSlipText(99, when), okJson(Object.assign({}, good, { reference_no: 'AIREF2', signs_of_editing: ['ฟอนต์ตัวเลขยอดเงินต่างจากส่วนอื่น'] })));
    assert.equal(p['สถานะ'], A.STATUS.NEED_CHECK); assert(/อาจถูกแก้ไข/.test(p['รายละเอียดผลตรวจ']));
  });
  t('Claude HTTP error → falls back to OCR result', () => {
    const p = submit(ktbSlipText(99, new Date(when.getTime() + 60000)).replace('202611250512345678', '202611250512345679'), { code: 401, json: { error: { message: 'invalid x-api-key' } } });
    assert.equal(p['สถานะ'], A.STATUS.SLIP_OK, p['รายละเอียดผลตรวจ']); assert(/Claude อ่านสลิปไม่สำเร็จ/.test(p['รายละเอียดผลตรวจ'])); assert(/HTTP 401/.test(p['ผลอ่านด้วย Claude']));
  });
  t('amounts disagree but one matches → note only', () => {
    const p = submit(ktbSlipText(99, new Date(when.getTime() + 120000)).replace('202611250512345678', '202611250512345680'), okJson(Object.assign({}, good, { reference_no: 'AIREF3', amount: '89.00' })));
    assert.equal(p['สถานะ'], A.STATUS.SLIP_OK, p['รายละเอียดผลตรวจ']); assert(/ต่างจาก OCR/.test(p['รายละเอียดผลตรวจ']));
  });
  t('wrong amount by both → NEED_CHECK', () => {
    const p = submit('ภาพไม่ชัด', okJson(Object.assign({}, good, { reference_no: 'AIREF4', amount: '50.00' })));
    assert.equal(p['สถานะ'], A.STATUS.NEED_CHECK); assert(/ไม่ตรงกับยอดที่ต้องชำระ/.test(p['รายละเอียดผลตรวจ']));
  });
  t('Haiku model: no fallbacks field', () => {
    setA('โมเดล Claude (ใช้เมื่อใส่ ANTHROPIC_API_KEY)', 'claude-haiku-5-5');
    submit('ภาพไม่ชัด', okJson(Object.assign({}, good, { reference_no: 'AIREF5' })));
    const q = reqs[reqs.length - 1]; assert.equal(q.body.model, 'claude-haiku-5-5'); assert(!('fallbacks' in q.body)); assert(!q.o.headers['anthropic-beta']);
    setA('โมเดล Claude (ใช้เมื่อใส่ ANTHROPIC_API_KEY)', 'ไม่ใช่ชื่อโมเดล'); assert.equal(A.claudeModel_(), 'claude-opus-5-5');
  });
  t('refusal handled', () => {
    reply = { code: 200, json: { stop_reason: 'refusal', content: [] } };
    const r = A.aiReadSlip_(A.Utilities.newBlob([1, 2, 3], 'image/jpeg', 'x'), 99, {}); assert(!r.ok); assert(/ไม่อ่าน/.test(r.error));
  });
  t('test-connection menu', () => {
    reply = { code: 200, json: { model: 'claude-opus-5-5', stop_reason: 'end_turn', content: [{ type: 'text', text: 'พร้อมใช้งาน' }] } };
    A.menuTestClaude(); const last = AE._alerts[AE._alerts.length - 1]; assert(/เชื่อมต่อได้/.test(last[1]), last[1]);
    assert(!('format' in reqs[reqs.length - 1].body.output_config));
  });
  t('form shows AI consent flag', () => { assert.equal(A.publicConfig_().aiSlipCheck, true); });
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
