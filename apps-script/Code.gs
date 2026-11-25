/**
 * ระบบรับสมัครสอบ PROT PRE TEST 2570 (ต้นแบบ v2)
 * โรงเรียนพรตพิทยพยัต · ทีมงานวัดผลและประเมินผล
 *
 * ส่วนประกอบ
 *  - doGet()         เปิดหน้าใบสมัคร (Index.html) = ลิงก์/QR ที่ใส่บนโปสเตอร์
 *  - doGet(?api=info) และ doPost({action}) = API ให้เว็บ GitHub Pages (กำหนดการ / เข้าระบบดูที่นั่งสอบ ผลสอบ)
 *  - เมนู "Prot Pre Test" ใน Google Sheet = งานเจ้าหน้าที่ (ยืนยันการชำระเงิน กระทบยอด จัดที่นั่ง คิดคะแนน)
 *
 * การตรวจสลิป (ไม่มีค่าใช้จ่าย)
 *  1) กันสลิปซ้ำ: ลายนิ้วมือไฟล์ (SHA-256) + ข้อมูล QR + เลขอ้างอิงธุรกรรม
 *  2) อ่าน QR บนสลิป (อ่านในเบราว์เซอร์ผู้สมัคร) ตรวจโครงสร้างและรหัสตรวจสอบ CRC ของ QR สลิปธนาคารไทย
 *  3) อ่านตัวอักษรบนสลิปด้วย OCR ของ Google Drive (ฟรี) แล้วตรวจ เลขบัญชีผู้รับ ชื่อบัญชี ยอดเงิน วันเวลาโอน
 *  4) กระทบยอดกับ "รายการเงินเข้า" ที่เจ้าหน้าที่วางจากรายการเดินบัญชีของโรงเรียน = ขั้นที่ยืนยันได้ว่าเงินเข้าจริง
 *  (ทางเลือก) อ่านสลิปด้วย Claude API ถ้าใส่ ANTHROPIC_API_KEY (มีค่าใช้จ่ายต่อสลิป) ใช้คู่กับ OCR: อ่านส่วนที่ OCR อ่านไม่ได้ และดูร่องรอยการแก้ไขภาพ
 *  หมายเหตุ: การดูภาพสลิปอย่างเดียว (ทั้ง OCR และ AI) พิสูจน์ไม่ได้ 100% ว่าสลิปจริง เพราะสลิปปลอมทำ QR และตัวอักษรเลียนแบบได้
 *
 * ติดตั้ง: ดู README.md
 */

var VERSION = '2.0.0';

// ======================= ค่าคงที่ของกิจกรรม =======================
var CONFIG = {
  EVENT_NAME: 'PROT PRE TEST 2570',
  EVENT_SUBTITLE: 'ลองสนามจริง ก่อนสอบจริง',
  EXAM_DATE_TEXT: 'วันอาทิตย์ที่ 24 มกราคม 2570',
  EXAM_PLACE: 'โรงเรียนพรตพิทยพยัต',
  FEE_PER_PERSON: 99,
  MAX_STUDENTS_PER_SLIP: 5,
  TEAM_NAME: 'ทีมงานวัดผลและประเมินผล โรงเรียนพรตพิทยพยัต',
  GROUPS: [
    { code: 'P', label: 'ลองสนามสอบเข้า ม.1', grades: ['ป.5', 'ป.6'] },
    { code: 'M', label: 'ลองสนามสอบเข้า ม.4', grades: ['ม.3'] }
  ],
  BANK: {
    bankName: 'ธนาคารกรุงไทย',
    branch: 'สาขาเทคโนโลยีพระจอมเกล้าฯ ลาดกระบัง',
    accountNo: '6930538388',
    accountDisplay: '693-0-53838-8',
    accountName: 'เงินสวัสดิการโรงเรียนพรตพิทยพยัต'
  },
  RECEIVER_NAME_KEYWORDS: ['สวัสดิการ', 'พรต'],
  CLAUDE_MODEL: 'claude-opus-5-5',
  SLIP_FOLDER_NAME: 'PreProtTest2570-สลิปโอนเงิน (ห้ามแชร์)'
};

var SHEETS = {
  APPLICANTS: 'ผู้สมัคร',
  PAYMENTS: 'การชำระเงิน',
  STATEMENT: 'รายการเงินเข้า',
  ROOMS: 'ห้องสอบ',
  RESULTS: 'ผลสอบ',
  SCHEDULE: 'กำหนดการ',
  TIMETABLE: 'ตารางเวลาวันสอบ',
  SETTINGS: 'ตั้งค่า'
};

var APPLICANT_HEADERS = ['เลขที่สมัคร', 'เลขที่รายการชำระเงิน', 'วันเวลาสมัคร', 'คำนำหน้า', 'ชื่อ', 'นามสกุล',
  'เลขประจำตัวประชาชน', 'ชั้นปัจจุบัน', 'กลุ่มสอบ', 'โรงเรียนปัจจุบัน', 'ชื่อผู้ปกครอง', 'เบอร์โทรศัพท์',
  'เลขที่นั่งสอบ', 'ห้องสอบ', 'อาคาร/สถานที่', 'หมายเหตุ'];

var PAYMENT_HEADERS = ['เลขที่รายการ', 'วันเวลาส่ง', 'ชื่อผู้ปกครอง', 'เบอร์โทรศัพท์', 'อีเมล', 'จำนวนผู้สมัคร',
  'ยอดที่ต้องชำระ', 'ลิงก์สลิป', 'SHA-256 ไฟล์สลิป', 'ข้อมูล QR บนสลิป', 'ผลตรวจ QR', 'ธนาคารผู้โอน (จาก QR)',
  'เลขอ้างอิงธุรกรรม', 'ข้อความจาก OCR', 'เลขบัญชีผู้รับ', 'ชื่อบัญชีผู้รับ', 'ยอดในสลิป', 'วันเวลาโอน',
  'ผลอ่านด้วย Claude', 'ผลตรวจอัตโนมัติ', 'รายละเอียดผลตรวจ', 'สถานะ', 'จับคู่รายการเงินเข้า',
  'ผู้ยืนยัน', 'วันเวลายืนยัน', 'ข้อความแจ้งผู้สมัคร', 'หมายเหตุเจ้าหน้าที่'];

var STATEMENT_HEADERS = ['วันที่', 'เวลา', 'จำนวนเงิน', 'รายละเอียด', 'จับคู่กับรายการ', 'หมายเหตุ'];

var STATUS = {
  SLIP_OK: 'รอยืนยันยอดเข้า (สลิปถูกต้อง)',
  NEED_CHECK: 'รอตรวจ (พบจุดต้องตรวจ)',
  CONFIRMED: 'ยืนยันแล้ว',
  REJECTED: 'ไม่ผ่าน'
};

var BANK_CODES = {
  '002': 'กรุงเทพ', '004': 'กสิกรไทย', '006': 'กรุงไทย', '011': 'ทีเอ็มบีธนชาต', '014': 'ไทยพาณิชย์',
  '022': 'ซีไอเอ็มบี ไทย', '024': 'ยูโอบี', '025': 'กรุงศรีอยุธยา', '030': 'ออมสิน', '033': 'อาคารสงเคราะห์',
  '034': 'ธ.ก.ส.', '066': 'อิสลามแห่งประเทศไทย', '067': 'ทิสโก้', '069': 'เกียรตินาคินภัทร', '070': 'ไอซีบีซี (ไทย)',
  '071': 'ไทยเครดิต', '073': 'แลนด์ แอนด์ เฮ้าส์', '098': 'SME D Bank'
};

// ======================= HTTP =======================
function doGet(e) {
  var p = (e && e.parameter) || {};
  if (p.api) {
    var out = route_({ action: p.api });
    return p.callback && /^[A-Za-z_$][\w$]{0,40}$/.test(p.callback)
      ? ContentService.createTextOutput(p.callback + '(' + JSON.stringify(out) + ')').setMimeType(ContentService.MimeType.JAVASCRIPT)
      : json_(out);
  }
  var t = HtmlService.createTemplateFromFile('Index');
  t.cfg = publicConfig_();
  return t.evaluate()
    .setTitle('สมัครสอบ ' + CONFIG.EVENT_NAME)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

/** เว็บ GitHub Pages ส่ง POST แบบ text/plain (ไม่ต้อง preflight) body = {"action":"...", ...} */
function doPost(e) {
  var body = {};
  try { body = JSON.parse((e && e.postData && e.postData.contents) || '{}'); } catch (err) { body = {}; }
  return json_(route_(body));
}

var ROUTES = {
  info: function () { return apiInfo_(); },
  login: function (b) { return apiLogin_(b.id, b.phone); }
};

function route_(body) {
  try {
    var fn = ROUTES[body.action];
    if (!fn) throw userErr_('ไม่รู้จักคำสั่งนี้');
    var out = fn(body) || {};
    out.ok = true;
    return out;
  } catch (err) {
    if (err && err.user) return { ok: false, error: err.message };
    console.error(err && err.stack ? err.stack : err);
    return { ok: false, error: 'ระบบขัดข้องชั่วคราว กรุณาลองใหม่อีกครั้ง' };
  }
}

function json_(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }
function userErr_(msg) { var e = new Error(msg); e.user = true; return e; }

// ======================= ข้อมูลสาธารณะ =======================
function publicConfig_() {
  var s = getSettings_();
  var counts = groupCounts_();
  return {
    eventName: CONFIG.EVENT_NAME,
    subtitle: CONFIG.EVENT_SUBTITLE,
    examDate: CONFIG.EXAM_DATE_TEXT,
    place: CONFIG.EXAM_PLACE,
    fee: CONFIG.FEE_PER_PERSON,
    maxStudents: CONFIG.MAX_STUDENTS_PER_SLIP,
    groups: CONFIG.GROUPS.map(function (g) {
      var cap = Number(s['รับสูงสุด กลุ่ม ' + g.code]) || 0;
      return { code: g.code, label: g.label, grades: g.grades, full: cap > 0 && counts[g.code] >= cap };
    }),
    bank: { bankName: CONFIG.BANK.bankName, branch: CONFIG.BANK.branch, accountDisplay: CONFIG.BANK.accountDisplay, accountName: CONFIG.BANK.accountName },
    team: CONFIG.TEAM_NAME,
    registrationOpen: isRegistrationOpen_(s),
    registrationNote: String(s['ข้อความเมื่อปิดรับสมัคร'] || 'ขณะนี้ยังไม่เปิดรับสมัคร'),
    contact: String(s['ช่องทางติดต่อ'] || ''),
    statusPageUrl: String(s['ลิงก์เว็บตรวจสถานะ (GitHub Pages)'] || ''),
    aiSlipCheck: !!PropertiesService.getScriptProperties().getProperty('ANTHROPIC_API_KEY')
  };
}

function apiInfo_() {
  var s = getSettings_();
  var schedule = readRows_(SHEETS.SCHEDULE).map(function (r) {
    return { date: fmtCell_(r['วันที่']), item: String(r['รายการ'] || ''), note: String(r['หมายเหตุ'] || '') };
  }).filter(function (r) { return r.item; });
  var timetable = readRows_(SHEETS.TIMETABLE).map(function (r) {
    return { time: fmtTimeCell_(r['เวลา']), item: String(r['รายการ'] || ''), note: String(r['หมายเหตุ'] || '') };
  }).filter(function (r) { return r.item; });
  return {
    config: publicConfig_(),
    schedule: schedule,
    timetable: timetable,
    counts: groupCounts_(),
    seatsPublished: truthy_(s['ประกาศที่นั่งสอบ']),
    resultsPublished: truthy_(s['ประกาศผลสอบ']),
    announcement: String(s['ประกาศหน้าเว็บ'] || ''),
    updatedAt: new Date().toISOString()
  };
}

/** เข้าระบบผู้สมัคร: ชื่อผู้ใช้ = เลขประจำตัวประชาชน หรือ เลขที่สมัคร · รหัสผ่าน = เบอร์โทรศัพท์ที่ใช้สมัคร */
function apiLogin_(rawId, rawPhone) {
  var key = String(rawId || '').toUpperCase().replace(/[\s-]/g, '');
  var phone = String(rawPhone || '').replace(/\D/g, '');
  if (!key || phone.length < 9) throw userErr_('กรุณากรอกเลขประจำตัวประชาชน (หรือเลขที่สมัคร) และเบอร์โทรศัพท์ที่ใช้สมัครให้ครบ');

  // กันการเดารหัส: ผิดได้ไม่เกิน 8 ครั้ง ใน 15 นาที ต่อบัญชี
  var cache = CacheService.getScriptCache();
  var ck = 'fail_' + key;
  var fails = Number(cache.get(ck) || 0);
  if (fails >= 8) throw userErr_('กรอกข้อมูลไม่ถูกต้องหลายครั้ง กรุณารอ 15 นาทีแล้วลองใหม่');

  var app = readRows_(SHEETS.APPLICANTS).filter(function (r) {
    var id = String(r['เลขประจำตัวประชาชน']).replace(/\D/g, '');
    var appId = String(r['เลขที่สมัคร']).toUpperCase();
    return (id === key || appId === key) && String(r['เบอร์โทรศัพท์']).replace(/\D/g, '') === phone;
  }).pop();
  if (!app) {
    cache.put(ck, String(fails + 1), 900);
    throw userErr_('ไม่พบข้อมูล หรือเบอร์โทรศัพท์ไม่ตรงกับที่ใช้สมัคร');
  }
  cache.remove(ck);

  var s = getSettings_();
  var pay = readRows_(SHEETS.PAYMENTS).filter(function (r) { return r['เลขที่รายการ'] === app['เลขที่รายการชำระเงิน']; })[0] || {};
  var st = String(pay['สถานะ'] || '');
  var approved = st === STATUS.CONFIRMED;
  var group = CONFIG.GROUPS.filter(function (g) { return g.code === app['กลุ่มสอบ']; })[0] || {};
  var idDigits = String(app['เลขประจำตัวประชาชน']).replace(/\D/g, '');

  var res = {
    appId: app['เลขที่สมัคร'],
    name: [app['คำนำหน้า'], app['ชื่อ']].join('') + ' ' + app['นามสกุล'],
    idMasked: maskId_(idDigits),
    grade: app['ชั้นปัจจุบัน'],
    groupCode: app['กลุ่มสอบ'],
    group: group.label || '',
    school: app['โรงเรียนปัจจุบัน'],
    submissionId: app['เลขที่รายการชำระเงิน'],
    payment: {
      state: approved ? 'ok' : (st === STATUS.REJECTED ? 'rejected' : 'pending'),
      text: approved ? 'ยืนยันการชำระเงินแล้ว การสมัครสมบูรณ์'
        : st === STATUS.REJECTED ? 'การชำระเงินไม่ผ่านการตรวจสอบ'
        : 'อยู่ระหว่างตรวจสอบการชำระเงิน',
      message: String(pay['ข้อความแจ้งผู้สมัคร'] || '')
    },
    seat: null,
    seatsPublished: truthy_(s['ประกาศที่นั่งสอบ']),
    result: null,
    resultsPublished: truthy_(s['ประกาศผลสอบ']),
    examDate: CONFIG.EXAM_DATE_TEXT,
    place: CONFIG.EXAM_PLACE
  };
  if (approved && res.seatsPublished && app['เลขที่นั่งสอบ']) {
    res.seat = { seatNo: app['เลขที่นั่งสอบ'], room: String(app['ห้องสอบ']), building: String(app['อาคาร/สถานที่']) };
  }
  if (approved && res.resultsPublished) res.result = resultOf_(app['เลขที่สมัคร'], s);
  return res;
}

function resultOf_(appId, s) {
  var values = getSheet_(SHEETS.RESULTS).getDataRange().getValues();
  var head = values[0].map(String);
  var row = values.slice(1).filter(function (r) { return r[0] === appId; })[0];
  if (!row) return null;
  var full = Number(s['คะแนนเต็มต่อวิชา']) || null;
  var totalCol = head.indexOf('คะแนนรวม'), rankCol = head.indexOf('อันดับในกลุ่มสอบ');
  var scores = [];
  for (var c = 1; c < head.length; c++) {
    if (!head[c] || c === totalCol || c === rankCol) continue;
    scores.push({ subject: head[c], score: row[c], full: full });
  }
  var showRank = truthy_(s['แสดงอันดับในผลสอบ']);
  var rank = rankCol >= 0 ? Number(row[rankCol]) || null : null;
  return {
    scores: scores,
    total: totalCol >= 0 ? row[totalCol] : null,
    totalFull: full ? full * scores.length : null,
    rank: showRank ? rank : null,
    top10: showRank && rank && rank <= 10
  };
}

// ======================= รับใบสมัคร (เรียกจาก Index.html) =======================
/**
 * payload = { guardian:{name, phone, email}, students:[{prefix, firstName, lastName, idCard, grade, school}],
 *             slip:{mimeType, base64}, qrData:'ข้อความจาก QR บนสลิป', consent:true }
 */
function submitApplication(payload) {
  var settings = getSettings_();
  if (!isRegistrationOpen_(settings)) throw new Error('ขณะนี้ไม่อยู่ในช่วงเปิดรับสมัคร');
  var v = validatePayload_(payload);

  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  var submissionId, appIds = [];
  try {
    var payments = readRows_(SHEETS.PAYMENTS);
    var rejected = {};
    payments.forEach(function (r) { if (r['สถานะ'] === STATUS.REJECTED) rejected[r['เลขที่รายการ']] = 1; });
    var existing = readRows_(SHEETS.APPLICANTS).filter(function (r) { return !rejected[r['เลขที่รายการชำระเงิน']]; });

    v.students.forEach(function (st) {
      if (existing.some(function (r) { return String(r['เลขประจำตัวประชาชน']).replace(/\D/g, '') === st.idCard; })) {
        throw new Error('เลขประจำตัวประชาชน ' + maskId_(st.idCard) + ' สมัครไว้แล้ว ตรวจสอบสถานะได้ที่หน้าเว็บ');
      }
    });
    // ที่นั่งเต็มหรือยัง
    var counts = groupCounts_();
    CONFIG.GROUPS.forEach(function (g) {
      var cap = Number(settings['รับสูงสุด กลุ่ม ' + g.code]) || 0;
      var want = v.students.filter(function (st) { return st.group === g.code; }).length;
      if (cap > 0 && want && counts[g.code] + want > cap) throw new Error('ขออภัย ' + g.label + ' ที่นั่งเต็มแล้ว');
    });

    var bytes = Utilities.base64Decode(v.slip.base64);
    var now = new Date();
    submissionId = nextId_('PAY', 'T');
    var ext = v.slip.mimeType === 'image/png' ? '.png' : '.jpg';
    var file = getSlipFolder_().createFile(Utilities.newBlob(bytes, v.slip.mimeType, submissionId + ext));

    appendRow_(SHEETS.PAYMENTS, {
      'เลขที่รายการ': submissionId, 'วันเวลาส่ง': now, 'ชื่อผู้ปกครอง': v.guardian.name,
      'เบอร์โทรศัพท์': "'" + v.guardian.phone, 'อีเมล': v.guardian.email, 'จำนวนผู้สมัคร': v.students.length,
      'ยอดที่ต้องชำระ': CONFIG.FEE_PER_PERSON * v.students.length, 'ลิงก์สลิป': file.getUrl(),
      'SHA-256 ไฟล์สลิป': sha256Hex_(bytes), 'ข้อมูล QR บนสลิป': v.qrData,
      'สถานะ': STATUS.NEED_CHECK, 'รายละเอียดผลตรวจ': 'กำลังตรวจ...'
    });
    v.students.forEach(function (st) {
      var g = groupOf_(st.grade);
      var appId = nextId_('APP_' + g.code, g.code);
      appIds.push({ appId: appId, name: st.prefix + st.firstName + ' ' + st.lastName, group: g.label });
      appendRow_(SHEETS.APPLICANTS, {
        'เลขที่สมัคร': appId, 'เลขที่รายการชำระเงิน': submissionId, 'วันเวลาสมัคร': now,
        'คำนำหน้า': st.prefix, 'ชื่อ': st.firstName, 'นามสกุล': st.lastName,
        'เลขประจำตัวประชาชน': "'" + st.idCard, 'ชั้นปัจจุบัน': st.grade, 'กลุ่มสอบ': g.code,
        'โรงเรียนปัจจุบัน': st.school, 'ชื่อผู้ปกครอง': v.guardian.name, 'เบอร์โทรศัพท์': "'" + v.guardian.phone
      });
    });
    SpreadsheetApp.flush();
  } finally {
    lock.releaseLock();
  }

  var check;
  try { check = verifySlip_(submissionId); } catch (err) {
    console.error(err);
    check = { status: STATUS.NEED_CHECK, summary: 'ตรวจอัตโนมัติไม่สำเร็จ' };
  }
  var msg = check.status === STATUS.CONFIRMED
    ? 'ระบบยืนยันการชำระเงินแล้ว การสมัครเสร็จสมบูรณ์'
    : 'ได้รับใบสมัครและสลิปแล้ว เจ้าหน้าที่จะยืนยันการชำระเงินกับรายการเงินเข้าบัญชีโรงเรียน ติดตามสถานะได้ที่หน้าเว็บ';
  if (v.guardian.email) {
    try { sendConfirmEmail_(v.guardian.email, submissionId, appIds, msg); } catch (err2) { console.warn(err2); }
  }
  return { submissionId: submissionId, applicants: appIds, message: msg, confirmed: check.status === STATUS.CONFIRMED };
}

function validatePayload_(p) {
  if (!p || !p.consent) throw new Error('กรุณายอมรับเงื่อนไขการใช้ข้อมูลส่วนบุคคล');
  var g = p.guardian || {};
  var guardian = { name: clean_(g.name, 120), phone: String(g.phone || '').replace(/\D/g, ''), email: clean_(g.email, 120) };
  if (!guardian.name) throw new Error('กรุณากรอกชื่อผู้ปกครอง');
  if (!/^0\d{8,9}$/.test(guardian.phone)) throw new Error('เบอร์โทรศัพท์ไม่ถูกต้อง');
  if (guardian.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(guardian.email)) throw new Error('อีเมลไม่ถูกต้อง');

  var list = Array.isArray(p.students) ? p.students : [];
  if (list.length < 1 || list.length > CONFIG.MAX_STUDENTS_PER_SLIP) throw new Error('จำนวนผู้สมัครต่อครั้งต้องอยู่ระหว่าง 1–' + CONFIG.MAX_STUDENTS_PER_SLIP + ' คน');
  var seen = {};
  var students = list.map(function (s, i) {
    var st = {
      prefix: clean_(s.prefix, 20), firstName: clean_(s.firstName, 60), lastName: clean_(s.lastName, 60),
      idCard: String(s.idCard || '').replace(/\D/g, ''), grade: clean_(s.grade, 10), school: clean_(s.school, 150)
    };
    var no = 'ผู้สมัครคนที่ ' + (i + 1) + ': ';
    if (['เด็กชาย', 'เด็กหญิง', 'นาย', 'นางสาว'].indexOf(st.prefix) < 0) throw new Error(no + 'กรุณาเลือกคำนำหน้า');
    if (!st.firstName || !st.lastName) throw new Error(no + 'กรุณากรอกชื่อ-นามสกุลให้ครบ');
    if (!isThaiId_(st.idCard)) throw new Error(no + 'เลขประจำตัวประชาชนไม่ถูกต้อง');
    if (seen[st.idCard]) throw new Error(no + 'เลขประจำตัวประชาชนซ้ำกับคนอื่นในใบสมัครนี้');
    seen[st.idCard] = 1;
    var grp = groupOf_(st.grade);
    if (!grp) throw new Error(no + 'กรุณาเลือกชั้นปัจจุบัน');
    st.group = grp.code;
    if (!st.school) throw new Error(no + 'กรุณากรอกโรงเรียนปัจจุบัน');
    return st;
  });

  var slip = p.slip || {};
  if (!slip.base64 || ['image/jpeg', 'image/png'].indexOf(slip.mimeType) < 0) throw new Error('กรุณาแนบสลิปเป็นไฟล์ภาพ JPG หรือ PNG');
  if (slip.base64.length > 8 * 1024 * 1024) throw new Error('ไฟล์สลิปใหญ่เกินไป');
  return { guardian: guardian, students: students, slip: slip, qrData: clean_(p.qrData, 600) };
}

// ======================= ตรวจสลิป =======================
function verifySlip_(submissionId) {
  var sh = getSheet_(SHEETS.PAYMENTS);
  var all = readRows_(SHEETS.PAYMENTS);
  var row = all.filter(function (r) { return r['เลขที่รายการ'] === submissionId; })[0];
  if (!row) throw new Error('ไม่พบรายการ ' + submissionId);
  var others = all.filter(function (r) { return r['เลขที่รายการ'] !== submissionId && r['สถานะ'] !== STATUS.REJECTED; });
  var settings = getSettings_();
  var expected = Number(row['ยอดที่ต้องชำระ']);
  var problems = [], notes = [], upd = {};

  // ---- 1) สลิปซ้ำ ----
  if (others.some(function (r) { return r['SHA-256 ไฟล์สลิป'] === row['SHA-256 ไฟล์สลิป']; })) problems.push('ไฟล์สลิปซ้ำกับรายการอื่น');
  var qrText = String(row['ข้อมูล QR บนสลิป'] || '');
  if (qrText && others.some(function (r) { return r['ข้อมูล QR บนสลิป'] === qrText; })) problems.push('QR บนสลิปซ้ำกับรายการอื่น');

  // ---- 2) QR ----
  var transRef = '';
  if (!qrText) {
    upd['ผลตรวจ QR'] = 'อ่าน QR ไม่ได้';
    notes.push('อ่าน QR บนสลิปไม่ได้ (ภาพอาจถูกครอปหรือไม่ชัด)');
  } else {
    var q = parseSlipQr_(qrText);
    upd['ผลตรวจ QR'] = q.summary;
    upd['ธนาคารผู้โอน (จาก QR)'] = q.bankName || q.bankCode || '';
    transRef = q.transRef || '';
    if (!q.isSlipQr) problems.push('QR ไม่ใช่รูปแบบ QR สลิปธนาคาร (' + q.summary + ')');
    else if (!q.crcOk) problems.push('รหัสตรวจสอบ (CRC) ของ QR ไม่ถูกต้อง');
  }

  // ---- 3) อ่านข้อความบนสลิป: OCR ของ Google Drive (ฟรี) และ Claude (ถ้าใส่ ANTHROPIC_API_KEY) ----
  var blob = DriveApp.getFileById(fileIdFromUrl_(row['ลิงก์สลิป'])).getBlob();
  var ocr = ocrImage_(blob);
  var info = null;
  if (!ocr.ok) {
    upd['ข้อความจาก OCR'] = 'อ่านไม่สำเร็จ: ' + ocr.error;
    notes.push('OCR อ่านสลิปไม่สำเร็จ');
  } else {
    upd['ข้อความจาก OCR'] = ocr.text.slice(0, 1500);
    info = analyzeSlipText_(ocr.text, expected);
  }
  var ai = aiReadSlip_(blob, expected, settings);
  var aiInfo = null;
  if (ai.skipped) upd['ผลอ่านด้วย Claude'] = 'ไม่ได้เปิดใช้';
  else if (!ai.ok) { upd['ผลอ่านด้วย Claude'] = 'อ่านไม่สำเร็จ: ' + ai.error; notes.push('Claude อ่านสลิปไม่สำเร็จ'); }
  else {
    upd['ผลอ่านด้วย Claude'] = JSON.stringify(ai.data);
    aiInfo = interpretAiSlip_(ai.data, expected);
    if (!ai.data.is_bank_transfer_slip) problems.push('Claude: ภาพนี้ไม่ใช่สลิปโอนเงิน');
    if (ai.data.signs_of_editing && ai.data.signs_of_editing.length) problems.push('Claude พบจุดที่อาจถูกแก้ไข: ' + ai.data.signs_of_editing.join('; '));
  }

  // ---- 4) รวมผลจากทั้งสองแหล่ง ----
  var readAny = !!(info || aiInfo);
  var accountOk = !!((info && info.accountMatched) || (aiInfo && aiInfo.accountMatched));
  var nameOk = !!((info && info.nameMatched) || (aiInfo && aiInfo.nameMatched));
  var amountsSeen = [];
  if (info) info.amounts.forEach(function (x) { amountsSeen.push(x); });
  if (aiInfo && aiInfo.amount !== null && amountsSeen.indexOf(aiInfo.amount) < 0) amountsSeen.push(aiInfo.amount);
  var amountOk = !!((info && info.amountMatched) || (aiInfo && aiInfo.amountMatched));
  upd['เลขบัญชีผู้รับ'] = (info && info.accountShown) || (aiInfo && aiInfo.accountShown) || '';
  upd['ชื่อบัญชีผู้รับ'] = nameOk ? 'พบชื่อบัญชีโรงเรียน' : (readAny ? 'ไม่พบชื่อบัญชีโรงเรียนในข้อความ' : '');
  upd['ยอดในสลิป'] = amountsSeen.join(', ');
  if (readAny) {
    if (!accountOk) problems.push('ไม่พบเลขบัญชีโรงเรียน (' + CONFIG.BANK.accountDisplay + ') ในสลิป');
    else if (!(info && info.accountMatched)) notes.push('เลขบัญชีผู้รับอ่านได้จาก Claude (OCR อ่านไม่พบ)');
    if (!amountOk) {
      if (amountsSeen.length) problems.push('ยอดในสลิป (' + amountsSeen.join(', ') + ' บาท) ไม่ตรงกับยอดที่ต้องชำระ ' + expected + ' บาท');
      else problems.push('อ่านยอดเงินในสลิปไม่ได้');
    } else if (aiInfo && aiInfo.amount !== null && !aiInfo.amountMatched) {
      notes.push('Claude อ่านยอดได้ ' + aiInfo.amount + ' บาท ต่างจาก OCR ให้ดูภาพประกอบ');
    }
    if (!nameOk) notes.push('ไม่พบชื่อบัญชีผู้รับในข้อความ (สลิปบางธนาคารตัดชื่อ ให้ดูภาพประกอบ)');
  }
  // วันเวลาโอน: ใช้ค่าที่มีเวลาก่อน (OCR แล้วจึง Claude)
  var dt = null, dtFromAi = false;
  if (info && info.datetime && info.datetime.hasTime) dt = info.datetime;
  else if (aiInfo && aiInfo.datetime && aiInfo.datetime.hasTime) { dt = aiInfo.datetime; dtFromAi = true; }
  else dt = (info && info.datetime) || (aiInfo && aiInfo.datetime) || null;
  upd['วันเวลาโอน'] = !dt ? '' : dt.hasTime ? dt : fmtCell_(dt) + ' (ไม่มีเวลา)';
  if (readAny) {
    if (!dt) notes.push('อ่านวันเวลาโอนไม่ได้ (จะกระทบยอดอัตโนมัติไม่ได้)');
    else {
      if (!dt.hasTime) notes.push('อ่านเวลาโอนไม่ได้ (จะกระทบยอดอัตโนมัติไม่ได้)');
      if (dtFromAi) notes.push('วันเวลาโอนอ่านได้จาก Claude');
      var start = settings['วันเริ่มรับสมัคร'] instanceof Date ? settings['วันเริ่มรับสมัคร'] : null;
      var dayBefore = start ? new Date(start.getTime() - 24 * 3600 * 1000) : null;
      if ((dayBefore && dt < dayBefore) || dt > new Date(Date.now() + 10 * 60 * 1000)) problems.push('วันที่โอนในสลิปไม่อยู่ในช่วงรับสมัคร');
    }
  }
  if (!transRef) transRef = (info && info.ref) || (aiInfo && aiInfo.ref) || '';
  upd['เลขอ้างอิงธุรกรรม'] = transRef;
  if (transRef && others.some(function (r) { return String(r['เลขอ้างอิงธุรกรรม'] || '') === transRef; })) problems.push('เลขอ้างอิงธุรกรรมซ้ำกับรายการอื่น (สลิปเดียวกันส่งซ้ำ)');

  // ---- สรุป ----
  var slipGood = !problems.length && accountOk && amountOk;
  var status, summary;
  if (problems.length) { status = STATUS.NEED_CHECK; summary = 'พบจุดต้องตรวจ ' + problems.length + ' ข้อ'; }
  else if (slipGood && truthy_(settings['ยืนยันอัตโนมัติเมื่อสลิปถูกต้อง (ไม่แนะนำ)'])) { status = STATUS.CONFIRMED; summary = 'สลิปถูกต้อง (ยืนยันอัตโนมัติตามการตั้งค่า)'; }
  else if (slipGood) { status = STATUS.SLIP_OK; summary = 'บัญชีผู้รับและยอดเงินถูกต้อง รอกระทบยอดกับรายการเงินเข้า'; }
  else { status = STATUS.NEED_CHECK; summary = 'ตรวจอัตโนมัติได้ไม่ครบ ให้เจ้าหน้าที่ตรวจ'; }
  upd['ผลตรวจอัตโนมัติ'] = summary;
  upd['รายละเอียดผลตรวจ'] = problems.concat(notes).map(function (x) { return '• ' + x; }).join('\n') || '-';
  if ([STATUS.CONFIRMED, STATUS.REJECTED].indexOf(row['สถานะ']) < 0) {
    upd['สถานะ'] = status;
    if (status === STATUS.CONFIRMED) { upd['ผู้ยืนยัน'] = 'ระบบ'; upd['วันเวลายืนยัน'] = new Date(); }
  } else {
    status = row['สถานะ'];
  }
  updateRow_(sh, findRowIndex_(sh, 'เลขที่รายการ', submissionId), upd);

  // ลองกระทบยอดทันที (ถ้ามีรายการเงินเข้าแล้ว)
  if (status === STATUS.SLIP_OK) {
    var rec = reconcile_([submissionId]);
    if (rec.matched.length) status = STATUS.CONFIRMED;
  }
  return { status: status, summary: summary };
}

/** อ่าน QR สลิปธนาคารไทย (รูปแบบ TLV: 00=ข้อมูลธุรกรรม [00 API ID, 01 รหัสธนาคาร, 02 เลขอ้างอิง] 51=ประเทศ 91=CRC) */
function parseSlipQr_(text) {
  var t = String(text || '').trim();
  var out = { isSlipQr: false, crcOk: false, bankCode: '', bankName: '', transRef: '', summary: '' };
  var top = parseTlv_(t);
  if (!top || !top['00']) { out.summary = 'ไม่ใช่ QR สลิป'; return out; }
  var inner = parseTlv_(top['00']) || {};
  if (inner['00'] === '000001' && inner['02']) {
    out.bankCode = inner['01'] || '';
    out.bankName = BANK_CODES[out.bankCode] || '';
    out.transRef = inner['02'];
    out.isSlipQr = !!top['91'];
  }
  if (top['91']) {
    var idx = t.lastIndexOf('9104');
    out.crcOk = idx >= 0 && crc16_(t.slice(0, idx + 4)) === String(top['91']).toUpperCase();
  }
  out.summary = out.isSlipQr
    ? ('QR สลิป' + (out.bankName ? ' ธนาคาร' + out.bankName : '') + ' · CRC ' + (out.crcOk ? 'ถูกต้อง' : 'ไม่ถูกต้อง'))
    : (top['54'] || top['29'] || top['30'] ? 'เป็น QR สำหรับรับเงิน ไม่ใช่ QR สลิป' : 'ไม่ใช่ QR สลิป');
  return out;
}

function parseTlv_(s) {
  var o = {}, i = 0;
  while (i + 4 <= s.length) {
    var tag = s.substr(i, 2), len = Number(s.substr(i + 2, 2));
    if (!/^\d{2}$/.test(tag) || isNaN(len) || i + 4 + len > s.length) return i === 0 ? null : o;
    o[tag] = s.substr(i + 4, len);
    i += 4 + len;
  }
  return i === s.length ? o : (Object.keys(o).length ? o : null);
}

function crc16_(str) {
  var crc = 0xFFFF;
  for (var i = 0; i < str.length; i++) {
    crc ^= (str.charCodeAt(i) & 0xFF) << 8;
    for (var b = 0; b < 8; b++) crc = (crc & 0x8000) ? ((crc << 1) ^ 0x1021) & 0xFFFF : (crc << 1) & 0xFFFF;
  }
  return ('0000' + crc.toString(16).toUpperCase()).slice(-4);
}

/** OCR ฟรีด้วย Google Drive (ต้องเปิด Advanced Service "Drive API" ใน Apps Script) */
function ocrImage_(blob) {
  var docId = null;
  try {
    if (typeof Drive === 'undefined') return { ok: false, error: 'ยังไม่ได้เปิดบริการ Drive API ในโปรเจ็กต์ Apps Script' };
    var res = Drive.Files.create({ name: 'ocr-tmp-' + Date.now(), mimeType: 'application/vnd.google-apps.document' }, blob, { ocrLanguage: 'th', fields: 'id' });
    docId = res.id;
    var text = DocumentApp.openById(docId).getBody().getText();
    return { ok: true, text: text };
  } catch (e) {
    return { ok: false, error: String(e && e.message || e).slice(0, 200) };
  } finally {
    if (docId) { try { DriveApp.getFileById(docId).setTrashed(true); } catch (e2) { /* ปล่อยไว้ */ } }
  }
}

/** วิเคราะห์ข้อความจากสลิป: เลขบัญชีผู้รับ ชื่อบัญชี ยอดเงิน วันเวลา เลขอ้างอิง */
function analyzeSlipText_(rawText, expected) {
  var text = toArabicDigits_(String(rawText || ''));
  var out = { accountMatched: false, accountShown: '', nameMatched: false, amounts: [], amountMatched: false, datetime: null, ref: '' };

  // เลขบัญชี: กลุ่มตัวเลข/ตัว x ที่มีขีดหรือเว้นวรรคคั่น เช่น xxx-x-x3838-x
  var norm = text.replace(/[×]/g, 'x').replace(/[ \t]*[-–][ \t]*/g, '-');
  var accRe = /[0-9xX*•●]+(?:-[0-9xX*•●]+)+|[0-9xX*•●]{6,12}/g, m;
  while ((m = accRe.exec(norm)) !== null) {
    var tok = m[0];
    if ((tok.replace(/[^0-9]/g, '').length >= 4) && accountMatches_(tok)) { out.accountMatched = true; out.accountShown = tok; break; }
  }

  var compact = text.replace(/\s+/g, '');
  out.nameMatched = CONFIG.RECEIVER_NAME_KEYWORDS.every(function (k) { return compact.indexOf(k) >= 0; });

  // ยอดเงิน: ตัวเลขทศนิยม 2 ตำแหน่ง (ไม่นับ 0.00 = ค่าธรรมเนียม)
  var amtRe = /(\d{1,3}(?:,\d{3})+|\d+)\.(\d{2})(?!\d)/g, a, seen = {};
  while ((a = amtRe.exec(text)) !== null) {
    var before = text.charAt(a.index - 1), after = text.slice(a.index + a[0].length, a.index + a[0].length + 3);
    if (/[\d:\/.]/.test(before) || /^\s*น/.test(after) || /^[.:\/]\d/.test(after)) continue;
    var val = Number(a[1].replace(/,/g, '') + '.' + a[2]);
    if (val > 0 && val < 100000 && !seen[val]) { seen[val] = 1; out.amounts.push(val); }
  }
  out.amountMatched = out.amounts.indexOf(Number(expected)) >= 0;
  out.datetime = parseThaiDateTime_(text);

  var refM = text.match(/(?:เลขที่รายการ|รหัสอ้างอิง|เลขอ้างอิง|หมายเลขอ้างอิง|Ref(?:erence)?\.?\s*(?:No\.?)?|Transaction\s*ID)\s*[:：]?\s*([A-Za-z0-9]{8,})/i);
  if (refM) out.ref = refM[1];
  return out;
}

/** เทียบเลขบัญชีที่แสดงบนสลิป (อาจปิดบางหลัก) กับเลขบัญชีโรงเรียน */
function accountMatches_(shown) {
  var target = CONFIG.BANK.accountNo;
  var s = String(shown).replace(/[^0-9xX*•●]/g, '').replace(/[xX*•●]/g, 'x');
  var digits = s.replace(/x/g, '');
  if (!digits) return false;
  if (s.length === target.length) {
    var matched = 0;
    for (var i = 0; i < s.length; i++) {
      if (s[i] === 'x') continue;
      if (s[i] !== target[i]) return false;
      matched++;
    }
    return matched >= 4;
  }
  if (s.length > target.length) return false;
  // แสดงบางส่วน เช่น x3838x หรือ 53838: ต้องตรงตำแหน่งท้ายบัญชี
  return digits.length >= 4 && target.indexOf(digits) >= 0 && /x/.test(s);
}

var TH_MONTHS = [
  ['มกราคม', 'ม.ค.', 'มค', 'jan'], ['กุมภาพันธ์', 'ก.พ.', 'กพ', 'feb'], ['มีนาคม', 'มี.ค.', 'มีค', 'mar'],
  ['เมษายน', 'เม.ย.', 'เมย', 'apr'], ['พฤษภาคม', 'พ.ค.', 'พค', 'may'], ['มิถุนายน', 'มิ.ย.', 'มิย', 'jun'],
  ['กรกฎาคม', 'ก.ค.', 'กค', 'jul'], ['สิงหาคม', 'ส.ค.', 'สค', 'aug'], ['กันยายน', 'ก.ย.', 'กย', 'sep'],
  ['ตุลาคม', 'ต.ค.', 'ตค', 'oct'], ['พฤศจิกายน', 'พ.ย.', 'พย', 'nov'], ['ธันวาคม', 'ธ.ค.', 'ธค', 'dec']
];

/** แปลงวันเวลาจากข้อความสลิป เช่น "24 ม.ค. 70 10:15" "24 มกราคม 2570 - 10:15:22" "24/01/2570 10.15 น." "24 Jan 2027" */
function parseThaiDateTime_(text) {
  var t = toArabicDigits_(String(text || ''));
  var d = null, mo = null, y = null, pos = -1, mm;
  var monthAlt = [];
  TH_MONTHS.forEach(function (arr, i) { arr.forEach(function (n) { monthAlt.push({ n: n, i: i }); }); });
  monthAlt.sort(function (a, b) { return b.n.length - a.n.length; });
  var re = new RegExp('(\\d{1,2})\\s*(' + monthAlt.map(function (x) { return x.n.replace(/\./g, '\\.?') + '\\.?'; }).join('|') + ')\\s*(\\d{2,4})', 'i');
  mm = t.match(re);
  if (mm) {
    d = +mm[1]; y = +mm[3]; pos = mm.index + mm[0].length;
    var key = mm[2].toLowerCase().replace(/\./g, '');
    monthAlt.some(function (x) { if (x.n.toLowerCase().replace(/\./g, '') === key) { mo = x.i; return true; } return false; });
  } else {
    mm = t.match(/(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})/);
    if (mm) { d = +mm[1]; mo = +mm[2] - 1; y = +mm[3]; pos = mm.index + mm[0].length; }
  }
  if (d === null || mo === null || mo < 0 || mo > 11 || d < 1 || d > 31) return null;
  if (y >= 2400) y -= 543;
  else if (y < 100) y = y >= 60 ? 2500 + y - 543 : 2000 + y;
  var rest = t.slice(pos, pos + 40);
  var tm = rest.match(/(\d{1,2}):(\d{2})(?::(\d{2}))?/) || rest.match(/(\d{1,2})\.(\d{2})\s*น/) || t.match(/(\d{1,2}):(\d{2})(?::(\d{2}))?/);
  var h = tm ? +tm[1] : 0, mi = tm ? +tm[2] : 0, se = tm && tm[3] ? +tm[3] : 0;
  var dt = new Date(y, mo, d, h, mi, se);
  dt.hasTime = !!tm;
  return isNaN(dt.getTime()) ? null : dt;
}

// ======================= กระทบยอดกับรายการเงินเข้า =======================
/**
 * เจ้าหน้าที่วางรายการเงินเข้าจากรายการเดินบัญชี (Statement) ของบัญชีโรงเรียนในแท็บ "รายการเงินเข้า"
 * ระบบจับคู่กับใบสมัครที่ยอดตรง วันเดียวกัน และเวลาห่างกันไม่เกินที่ตั้งไว้ ถ้าตรงรายการเดียว = ยืนยันแล้ว
 */
function reconcile_(onlyIds) {
  var settings = getSettings_();
  var tol = Number(settings['เวลาคลาดเคลื่อนที่ยอมรับ (นาที)']) || 3;
  var stSh = getSheet_(SHEETS.STATEMENT), paySh = getSheet_(SHEETS.PAYMENTS);
  var stRange = stSh.getDataRange();
  var stVals = stRange.getValues();
  var stDisp = stRange.getDisplayValues(); // เวลาอ่านจากข้อความที่แสดง (ค่าเวลาอย่างเดียวใน Sheets มีปัญหาเขตเวลาปี 1899)
  var stHead = stVals[0].map(String);
  var cD = stHead.indexOf('วันที่'), cT = stHead.indexOf('เวลา'), cA = stHead.indexOf('จำนวนเงิน'), cM = stHead.indexOf('จับคู่กับรายการ');
  var credits = [];
  for (var i = 1; i < stVals.length; i++) {
    var r = stVals[i];
    if (!r[cA] || r[cM]) continue;
    var when = combineDateTime_(r[cD], stDisp[i][cT]);
    var amt = Number(String(r[cA]).replace(/[^\d.]/g, ''));
    if (when && amt) credits.push({ row: i + 1, when: when, amount: amt, used: false });
  }
  var out = { matched: [], ambiguous: [], unmatched: [] };
  var pays = readRows_(SHEETS.PAYMENTS).filter(function (p) {
    return [STATUS.CONFIRMED, STATUS.REJECTED].indexOf(p['สถานะ']) < 0 && (!onlyIds || onlyIds.indexOf(p['เลขที่รายการ']) >= 0);
  });
  pays.forEach(function (p) {
    var slipTime = p['วันเวลาโอน'] instanceof Date ? p['วันเวลาโอน'] : null;
    if (!slipTime) { out.unmatched.push(p['เลขที่รายการ'] + ' (ไม่มีวันเวลาโอน)'); return; }
    var exp = Number(p['ยอดที่ต้องชำระ']);
    var cands = credits.filter(function (c) {
      return !c.used && Math.abs(c.amount - exp) < 0.005 && Math.abs(c.when - slipTime) <= tol * 60 * 1000;
    });
    if (cands.length === 1) {
      var c = cands[0]; c.used = true;
      stSh.getRange(c.row, cM + 1).setValue(p['เลขที่รายการ']);
      var problemsFree = p['สถานะ'] === STATUS.SLIP_OK;
      updateRow_(paySh, findRowIndex_(paySh, 'เลขที่รายการ', p['เลขที่รายการ']), problemsFree
        ? { 'สถานะ': STATUS.CONFIRMED, 'จับคู่รายการเงินเข้า': 'แถว ' + c.row + ' ' + fmtDateTime_(c.when), 'ผู้ยืนยัน': 'ระบบ (กระทบยอด)', 'วันเวลายืนยัน': new Date() }
        : { 'จับคู่รายการเงินเข้า': 'พบยอดเข้าแถว ' + c.row + ' ' + fmtDateTime_(c.when) + ' (สลิปมีจุดต้องตรวจ ให้เจ้าหน้าที่ยืนยันเอง)' });
      (problemsFree ? out.matched : out.ambiguous).push(p['เลขที่รายการ']);
    } else if (cands.length > 1) {
      updateRow_(paySh, findRowIndex_(paySh, 'เลขที่รายการ', p['เลขที่รายการ']), { 'จับคู่รายการเงินเข้า': 'ยอดตรงหลายรายการ แถว ' + cands.map(function (x) { return x.row; }).join(', ') });
      out.ambiguous.push(p['เลขที่รายการ']);
    } else {
      out.unmatched.push(p['เลขที่รายการ']);
    }
  });
  return out;
}

function combineDateTime_(dCell, tCell) {
  var d = null;
  if (dCell instanceof Date) d = new Date(dCell.getTime());
  else if (dCell) d = parseThaiDateTime_(String(dCell));
  if (!d) return null;
  if (tCell instanceof Date) d.setHours(tCell.getHours(), tCell.getMinutes(), tCell.getSeconds());
  else if (tCell) {
    var m = String(tCell).match(/(\d{1,2})[:.](\d{2})(?:[:.](\d{2}))?/);
    if (m) d.setHours(+m[1], +m[2], m[3] ? +m[3] : 0);
  }
  return d;
}

// ======================= (ทางเลือก) Claude API =======================
/** โมเดล Claude ที่ใช้: ค่าจากแท็บตั้งค่า หรือค่าเริ่มต้นใน CONFIG */
function claudeModel_(settings) {
  var m = String((settings || getSettings_())['โมเดล Claude (ใช้เมื่อใส่ ANTHROPIC_API_KEY)'] || '').trim();
  return /^claude-[a-z0-9.\-]+$/.test(m) ? m : CONFIG.CLAUDE_MODEL;
}

/** เรียก Claude Messages API (raw HTTP ผ่าน UrlFetchApp) คืน { ok, data | text, error } */
function callClaude_(key, model, content, schema, maxTokens) {
  var body = { model: model, max_tokens: maxTokens || 4000, output_config: { effort: 'low' }, messages: [{ role: 'user', content: content }] };
  if (schema) body.output_config.format = { type: 'json_schema', schema: schema };
  var headers = { 'x-api-key': key, 'anthropic-version': '2026-10-21' };
  if (!/haiku/.test(model)) { // Haiku ไม่มี server-side fallback
    body.fallbacks = 'default';
    headers['anthropic-beta'] = 'server-side-fallback-2026-07-01';
  }
  var resp = UrlFetchApp.fetch('https://api.anthropic.com/v1/messages', {
    method: 'post', contentType: 'application/json', muteHttpExceptions: true, headers: headers, payload: JSON.stringify(body)
  });
  var j = {};
  try { j = JSON.parse(resp.getContentText()); } catch (e) { j = {}; }
  if (resp.getResponseCode() !== 200) return { ok: false, error: 'HTTP ' + resp.getResponseCode() + ' ' + ((j.error && j.error.message) || '') };
  if (j.stop_reason === 'refusal') return { ok: false, error: 'โมเดลไม่อ่านภาพนี้' };
  if (j.stop_reason === 'max_tokens') return { ok: false, error: 'คำตอบยาวเกินกำหนด' };
  var tb = (j.content || []).filter(function (b) { return b.type === 'text'; })[0];
  if (!tb) return { ok: false, error: 'ไม่มีผลลัพธ์' };
  if (!schema) return { ok: true, text: tb.text, model: j.model || model };
  try { return { ok: true, data: JSON.parse(tb.text), model: j.model || model }; } catch (e) { return { ok: false, error: 'อ่านผลลัพธ์ JSON ไม่ได้' }; }
}

var AI_SLIP_SCHEMA = {
  type: 'object', additionalProperties: false,
  required: ['is_bank_transfer_slip', 'receiver_name', 'receiver_account_as_shown', 'amount', 'transfer_datetime', 'reference_no', 'signs_of_editing'],
  properties: {
    is_bank_transfer_slip: { type: 'boolean' },
    receiver_name: { type: 'string' },
    receiver_account_as_shown: { type: 'string' },
    amount: { type: 'string' },
    transfer_datetime: { type: 'string' },
    reference_no: { type: 'string' },
    signs_of_editing: { type: 'array', items: { type: 'string' } }
  }
};

/** ทำงานเฉพาะเมื่อใส่ ANTHROPIC_API_KEY ในคุณสมบัติของสคริปต์ (มีค่าใช้จ่ายต่อสลิป) */
function aiReadSlip_(blob, expectedAmount, settings) {
  var key = PropertiesService.getScriptProperties().getProperty('ANTHROPIC_API_KEY');
  if (!key) return { skipped: true };
  var prompt = 'ภาพนี้ผู้ปกครองส่งมาเป็นหลักฐานการโอนค่าสมัครสอบ อ่านข้อมูลเฉพาะที่เห็นในภาพ ช่องที่ไม่ปรากฏในภาพให้เป็นข้อความว่าง ""\n' +
    '- receiver_name: ชื่อบัญชีผู้รับเงิน ตามที่แสดง\n' +
    '- receiver_account_as_shown: เลขบัญชีผู้รับเงินตามที่แสดง คงตัว x หรือเครื่องหมายที่ธนาคารใช้ปิดบางหลักไว้ เช่น xxx-x-x3838-x\n' +
    '- amount: จำนวนเงินที่โอน เป็นตัวเลขอารบิก ทศนิยม 2 ตำแหน่ง เช่น 198.00 (ไม่ใช่ค่าธรรมเนียม)\n' +
    '- transfer_datetime: วันเวลาที่โอน รูปแบบ DD/MM/YYYY HH:MM โดย YYYY เป็นปี พ.ศ. 4 หลัก\n' +
    '- reference_no: เลขที่รายการหรือเลขอ้างอิงธุรกรรม\n' +
    '- is_bank_transfer_slip: เป็นภาพสลิปโอนเงินจากแอปธนาคารหรือไม่\n' +
    '- signs_of_editing: สิ่งที่ผิดปกติซึ่งอาจเกิดจากการแก้ไขภาพ เช่น ฟอนต์ตัวเลขไม่เหมือนส่วนอื่น ขอบตัวอักษรเบลอเฉพาะจุด แนวตัวอักษรเหลื่อม สีพื้นไม่สม่ำเสมอ ถ้าไม่พบให้เป็นอาร์เรย์ว่าง\n' +
    'ยอดที่ผู้สมัครต้องโอนคือ ' + expectedAmount + ' บาท ให้รายงานตามที่เห็นจริงในภาพ แม้ไม่ตรงกับยอดนี้';
  try {
    return callClaude_(key, claudeModel_(settings), [
      { type: 'image', source: { type: 'base64', media_type: blob.getContentType(), data: Utilities.base64Encode(blob.getBytes()) } },
      { type: 'text', text: prompt }
    ], AI_SLIP_SCHEMA, 4000);
  } catch (e) {
    return { ok: false, error: String(e).slice(0, 200) };
  }
}

/** แปลงผลอ่านของ Claude เป็นรูปแบบเดียวกับผล OCR */
function interpretAiSlip_(d, expected) {
  var acc = String(d.receiver_account_as_shown || '').trim();
  var name = String(d.receiver_name || '').replace(/\s+/g, '');
  var amtText = toArabicDigits_(String(d.amount || '')).replace(/[^\d.]/g, '');
  var amount = amtText ? Number(amtText) : null;
  if (amount !== null && (isNaN(amount) || amount <= 0)) amount = null;
  var dt = d.transfer_datetime ? parseThaiDateTime_(String(d.transfer_datetime)) : null;
  return {
    accountShown: acc,
    accountMatched: !!acc && accountMatches_(acc),
    nameMatched: !!name && CONFIG.RECEIVER_NAME_KEYWORDS.every(function (k) { return name.indexOf(k) >= 0; }),
    amount: amount,
    amountMatched: amount !== null && Math.abs(amount - Number(expected)) < 0.005,
    datetime: dt,
    ref: /^[A-Za-z0-9]{8,}$/.test(String(d.reference_no || '').replace(/\s+/g, '')) ? String(d.reference_no).replace(/\s+/g, '') : ''
  };
}

/** เมนู: ทดสอบว่าใส่ ANTHROPIC_API_KEY ถูกต้อง (ใช้โทเค็นเล็กน้อย) */
function menuTestClaude() {
  var ui = SpreadsheetApp.getUi();
  var key = PropertiesService.getScriptProperties().getProperty('ANTHROPIC_API_KEY');
  if (!key) { ui.alert('ยังไม่ได้ใส่ ANTHROPIC_API_KEY', 'Apps Script → การตั้งค่าโปรเจกต์ → คุณสมบัติของสคริปต์ → เพิ่ม ANTHROPIC_API_KEY', ui.ButtonSet.OK); return; }
  var model = claudeModel_();
  var r;
  try { r = callClaude_(key, model, [{ type: 'text', text: 'ตอบคำว่า พร้อมใช้งาน เพียงคำเดียว' }], null, 300); }
  catch (e) { r = { ok: false, error: String(e).slice(0, 200) }; }
  ui.alert('ทดสอบ Claude API', r.ok ? 'เชื่อมต่อได้ (โมเดล ' + (r.model || model) + ')\nคำตอบ: ' + r.text : 'เชื่อมต่อไม่ได้: ' + r.error, ui.ButtonSet.OK);
}

// ======================= เมนูเจ้าหน้าที่ =======================
function onOpen() {
  SpreadsheetApp.getUi().createMenu('Prot Pre Test')
    .addItem('ยืนยันการชำระเงิน (แถวที่เลือก)', 'menuConfirmPayment')
    .addItem('ไม่ผ่าน (แถวที่เลือก)', 'menuRejectPayment')
    .addItem('ตรวจสลิปอัตโนมัติอีกครั้ง (แถวที่เลือก)', 'menuRecheckSlip')
    .addItem('กระทบยอดกับรายการเงินเข้า', 'menuReconcile')
    .addSeparator()
    .addItem('จัดที่นั่งสอบ (เพิ่มเฉพาะผู้ที่ยังไม่มีที่นั่ง)', 'menuAssignSeats')
    .addItem('จัดที่นั่งสอบใหม่ทั้งหมด (ก่อนประกาศ)', 'menuReassignSeats')
    .addItem('คำนวณคะแนนรวมและอันดับ', 'menuComputeResults')
    .addItem('สรุปยอดผู้สมัคร', 'menuSummary')
    .addItem('ทดสอบการเชื่อมต่อ Claude API', 'menuTestClaude')
    .addSeparator()
    .addItem('ตั้งค่าครั้งแรก (setup)', 'setup')
    .addToUi();
}

function selectedPaymentIds_() {
  var sh = SpreadsheetApp.getActiveSheet();
  if (sh.getName() !== SHEETS.PAYMENTS) throw new Error('กรุณาเลือกแถวในแท็บ "' + SHEETS.PAYMENTS + '"');
  var r = sh.getActiveRange();
  var ids = sh.getRange(r.getRow(), 1, r.getNumRows(), 1).getValues().map(function (x) { return x[0]; })
    .filter(function (x) { return /^T\d+/.test(x); });
  if (!ids.length) throw new Error('ไม่พบเลขที่รายการในแถวที่เลือก');
  return ids;
}

function setPaymentStatus_(ids, status, note) {
  var sh = getSheet_(SHEETS.PAYMENTS);
  var who = Session.getActiveUser().getEmail() || 'เจ้าหน้าที่';
  ids.forEach(function (id) {
    var u = { 'สถานะ': status, 'ผู้ยืนยัน': who, 'วันเวลายืนยัน': new Date() };
    if (note !== undefined) u['ข้อความแจ้งผู้สมัคร'] = note;
    updateRow_(sh, findRowIndex_(sh, 'เลขที่รายการ', id), u);
  });
}

function menuConfirmPayment() {
  var ui = SpreadsheetApp.getUi(), ids = selectedPaymentIds_();
  var ok = ui.alert('ยืนยันการชำระเงิน ' + ids.length + ' รายการ',
    'ตรวจกับรายการเงินเข้าบัญชี ' + CONFIG.BANK.accountDisplay + ' แล้วใช่หรือไม่\n' + ids.join(', '), ui.ButtonSet.YES_NO);
  if (ok === ui.Button.YES) setPaymentStatus_(ids, STATUS.CONFIRMED);
}

function menuRejectPayment() {
  var ui = SpreadsheetApp.getUi(), ids = selectedPaymentIds_();
  var r = ui.prompt('ไม่ผ่าน ' + ids.length + ' รายการ', 'ข้อความแจ้งผู้สมัคร (เห็นเมื่อเข้าระบบ) เช่น "ยอดโอนไม่ครบ กรุณาติดต่อ..."', ui.ButtonSet.OK_CANCEL);
  if (r.getSelectedButton() === ui.Button.OK) setPaymentStatus_(ids, STATUS.REJECTED, r.getResponseText());
}

function menuRecheckSlip() {
  var ids = selectedPaymentIds_();
  SpreadsheetApp.getUi().alert(ids.map(function (id) { return id + ': ' + verifySlip_(id).summary; }).join('\n'));
}

function menuReconcile() {
  var r = reconcile_(null);
  SpreadsheetApp.getUi().alert('กระทบยอดกับรายการเงินเข้า',
    'ยืนยันอัตโนมัติ: ' + r.matched.length + ' รายการ\n' +
    'ต้องตรวจเอง (ยอดตรงหลายรายการ/สลิปมีจุดต้องตรวจ): ' + r.ambiguous.length + ' รายการ ' + r.ambiguous.join(', ') + '\n' +
    'ยังไม่พบยอดเข้า: ' + r.unmatched.length + ' รายการ', SpreadsheetApp.getUi().ButtonSet.OK);
}

/** จัดที่นั่ง: เฉพาะผู้ที่ยืนยันการชำระเงินแล้ว เรียงตามเลขที่สมัคร เติมห้องตามลำดับในแท็บห้องสอบ */
function menuAssignSeats() {
  var ui = SpreadsheetApp.getUi();
  ui.alert('ผลการจัดที่นั่งสอบ', assignSeats_(false).join('\n') +
    '\n\nผู้ที่มีเลขที่นั่งอยู่แล้วใช้เลขเดิม ตรวจแล้วจึงตั้งค่า "ประกาศที่นั่งสอบ" เป็น TRUE', ui.ButtonSet.OK);
}

function menuReassignSeats() {
  var ui = SpreadsheetApp.getUi();
  var published = truthy_(getSettings_()['ประกาศที่นั่งสอบ']);
  var msg = (published ? 'ขณะนี้ประกาศที่นั่งสอบแล้ว ผู้สมัครอาจได้เลขที่นั่งเปลี่ยนไปจากที่พิมพ์บัตรไว้\n\n' : '') +
    'ระบบจะล้างเลขที่นั่งเดิมทั้งหมดแล้วจัดใหม่ตามเลขที่สมัคร ดำเนินการต่อหรือไม่';
  if (ui.alert('จัดที่นั่งสอบใหม่ทั้งหมด', msg, ui.ButtonSet.YES_NO) !== ui.Button.YES) return;
  ui.alert('ผลการจัดที่นั่งสอบ', assignSeats_(true).join('\n'), ui.ButtonSet.OK);
}

/**
 * จัดที่นั่งสอบให้ผู้สมัครที่ "ยืนยันแล้ว" เรียงตามเลขที่สมัคร
 * resetAll = false (ค่าปกติ): คนที่มีเลขที่นั่งแล้วใช้เลขเดิม จัดเฉพาะคนที่ยังไม่มี ลงที่นั่งว่างแรก
 * resetAll = true: ล้างแล้วจัดใหม่ทั้งหมด (ใช้ก่อนประกาศเท่านั้น)
 * เลขที่นั่ง = รหัสกลุ่ม + ลำดับห้อง 2 หลัก + ลำดับที่นั่ง 2 หลัก เช่น P0101
 */
function assignSeats_(resetAll) {
  var approved = {};
  readRows_(SHEETS.PAYMENTS).forEach(function (r) { if (r['สถานะ'] === STATUS.CONFIRMED) approved[r['เลขที่รายการ']] = 1; });
  var rooms = readRows_(SHEETS.ROOMS).filter(function (r) { return r['กลุ่มสอบ'] && r['ห้อง'] !== ''; });
  var sh = getSheet_(SHEETS.APPLICANTS);
  var apps = readRows_(SHEETS.APPLICANTS);
  var clear = { 'เลขที่นั่งสอบ': '', 'ห้องสอบ': '', 'อาคาร/สถานที่': '' };
  var pad2 = function (n) { return String(n).padStart(2, '0'); };
  var report = [];
  CONFIG.GROUPS.forEach(function (g) {
    var gRooms = rooms.filter(function (r) { return r['กลุ่มสอบ'] === g.code; });
    var noCap = gRooms.filter(function (r) { return !(Number(r['ความจุ (คน)']) > 0); });
    if (!gRooms.length || noCap.length) {
      report.push(g.label + ': ยังไม่ได้ใส่ความจุห้อง ' + (gRooms.length ? noCap.map(function (r) { return r['ห้อง']; }).join(', ') : '(ไม่มีห้องในแท็บห้องสอบ)'));
      return;
    }
    var rows = apps.map(function (r, i) { return { r: r, row: i + 2 }; }).filter(function (x) { return x.r['กลุ่มสอบ'] === g.code; });
    var removed = 0;
    rows.forEach(function (x) { // คนที่ไม่ได้ยืนยันแล้ว (เช่น ไม่ผ่าน) ไม่มีที่นั่ง
      if (!approved[x.r['เลขที่รายการชำระเงิน']] && (x.r['เลขที่นั่งสอบ'] || x.r['ห้องสอบ'])) { updateRow_(sh, x.row, clear); removed++; }
    });
    var list = rows.filter(function (x) { return approved[x.r['เลขที่รายการชำระเงิน']]; })
      .sort(function (a, b) { return String(a.r['เลขที่สมัคร']).localeCompare(String(b.r['เลขที่สมัคร'])); });
    var taken = {}, keep = 0;
    if (!resetAll) list.forEach(function (x) {
      var no = String(x.r['เลขที่นั่งสอบ'] || '');
      if (no && no.indexOf(g.code) === 0 && !taken[no]) { taken[no] = true; x.keep = true; keep++; }
    });
    var slots = [];
    gRooms.forEach(function (room, ri) {
      for (var k = 1; k <= Number(room['ความจุ (คน)']); k++) {
        var no = g.code + pad2(ri + 1) + pad2(k);
        if (!taken[no]) slots.push({ no: no, room: room });
      }
    });
    var si = 0, added = 0, overflow = 0;
    list.forEach(function (x) {
      if (x.keep) return;
      var sl = slots[si++];
      if (!sl) { updateRow_(sh, x.row, { 'เลขที่นั่งสอบ': '', 'ห้องสอบ': 'ห้องไม่พอ', 'อาคาร/สถานที่': '' }); overflow++; return; }
      updateRow_(sh, x.row, { 'เลขที่นั่งสอบ': sl.no, 'ห้องสอบ': sl.room['ห้อง'], 'อาคาร/สถานที่': sl.room['อาคาร/สถานที่'] });
      added++;
    });
    var cap = gRooms.reduce(function (a, r) { return a + Number(r['ความจุ (คน)']); }, 0);
    report.push(g.label + ': จัดแล้ว ' + (keep + added) + '/' + list.length + ' คน (ใหม่ ' + added + ' · คงเลขเดิม ' + keep + ') ใน ' +
      gRooms.length + ' ห้อง ความจุรวม ' + cap + ' ที่นั่ง' + (overflow ? ' · ห้องไม่พอ ' + overflow + ' คน' : '') +
      (removed ? ' · ล้างที่นั่งของผู้ที่ไม่ได้ยืนยัน ' + removed + ' คน' : ''));
  });
  return report;
}

function menuComputeResults() {
  var n = computeResults_();
  SpreadsheetApp.getUi().alert('คำนวณแล้ว ' + n + ' คน (อันดับแยกตามกลุ่มสอบ คะแนนเท่ากันได้อันดับเดียวกัน)');
}

function computeResults_() {
  var sh = getSheet_(SHEETS.RESULTS);
  var values = sh.getDataRange().getValues();
  var head = values[0].map(String);
  var totalCol = head.indexOf('คะแนนรวม'), rankCol = head.indexOf('อันดับในกลุ่มสอบ');
  var subjectCols = [];
  head.forEach(function (h, i) { if (i > 0 && h && i !== totalCol && i !== rankCol) subjectCols.push(i); });
  var groupOf = {};
  readRows_(SHEETS.APPLICANTS).forEach(function (a) { groupOf[a['เลขที่สมัคร']] = a['กลุ่มสอบ']; });
  var rows = values.slice(1).map(function (r, i) {
    return { i: i + 2, id: r[0], total: subjectCols.reduce(function (a, c) { return a + (Number(r[c]) || 0); }, 0) };
  }).filter(function (x) { return x.id; });
  CONFIG.GROUPS.forEach(function (g) {
    var list = rows.filter(function (x) { return groupOf[x.id] === g.code; }).sort(function (a, b) { return b.total - a.total; });
    list.forEach(function (x, k) { x.rank = (k > 0 && list[k - 1].total === x.total) ? list[k - 1].rank : k + 1; });
  });
  rows.forEach(function (x) {
    sh.getRange(x.i, totalCol + 1).setValue(x.total);
    sh.getRange(x.i, rankCol + 1).setValue(x.rank || '');
  });
  return rows.length;
}

function menuSummary() {
  var by = {};
  readRows_(SHEETS.PAYMENTS).forEach(function (p) { by[p['สถานะ']] = (by[p['สถานะ']] || 0) + Number(p['จำนวนผู้สมัคร'] || 0); });
  var counts = groupCounts_();
  var lines = CONFIG.GROUPS.map(function (g) { return g.label + ': ' + counts[g.code] + ' คน'; });
  lines.push('', 'จำนวนคนแยกตามสถานะการชำระเงิน:');
  Object.keys(by).forEach(function (k) { lines.push('- ' + k + ': ' + by[k]); });
  lines.push('', 'ยอดเงินที่ยืนยันแล้ว: ' + ((by[STATUS.CONFIRMED] || 0) * CONFIG.FEE_PER_PERSON).toLocaleString() + ' บาท');
  SpreadsheetApp.getUi().alert('สรุปยอดผู้สมัคร', lines.join('\n'), SpreadsheetApp.getUi().ButtonSet.OK);
}

// ======================= ติดตั้งครั้งแรก =======================
function setup() {
  var ss = SpreadsheetApp.getActive();
  function ensure(name, headers, rows) {
    var sh = ss.getSheetByName(name) || ss.insertSheet(name);
    if (sh.getLastRow() === 0) {
      sh.getRange(1, 1, 1, headers.length).setValues([headers]).setFontWeight('bold').setBackground('#3a1d5c').setFontColor('#ffffff');
      sh.setFrozenRows(1);
      if (rows && rows.length) sh.getRange(2, 1, rows.length, headers.length).setValues(rows);
    }
    return sh;
  }
  ensure(SHEETS.APPLICANTS, APPLICANT_HEADERS);
  var pay = ensure(SHEETS.PAYMENTS, PAYMENT_HEADERS);
  pay.getRange(2, PAYMENT_HEADERS.indexOf('สถานะ') + 1, 2000, 1).setDataValidation(
    SpreadsheetApp.newDataValidation().requireValueInList(Object.keys(STATUS).map(function (k) { return STATUS[k]; }), true).build());
  ensure(SHEETS.STATEMENT, STATEMENT_HEADERS);
  // ห้องสอบตามคำสั่งปี 2569 (อาคาร 5) · ความจุยังไม่ทราบ ให้ใส่ก่อนจัดที่นั่ง
  var roomsP = ['531', '532', '533', '534', '535', '536', '537', '538', '548'].map(function (r) { return ['P', r, 'อาคาร 5', '', 'ห้องตามปี 2569 รอยืนยัน']; });
  var roomsM = ['541', '542', '543', '544', '545', '546'].map(function (r) { return ['M', r, 'อาคาร 5', '', 'ห้องตามปี 2569 รอยืนยัน']; });
  ensure(SHEETS.ROOMS, ['กลุ่มสอบ', 'ห้อง', 'อาคาร/สถานที่', 'ความจุ (คน)', 'หมายเหตุ'], roomsP.concat(roomsM));
  // 5 วิชาตามกำหนดการปี 2569 (คณิตฯ อังกฤษ วิทย์ ไทย สังคมฯ)
  ensure(SHEETS.RESULTS, ['เลขที่สมัคร', 'ภาษาไทย', 'คณิตศาสตร์', 'วิทยาศาสตร์', 'สังคมศึกษาฯ', 'ภาษาอังกฤษ', 'คะแนนรวม', 'อันดับในกลุ่มสอบ']);
  ensure(SHEETS.SCHEDULE, ['วันที่', 'รายการ', 'หมายเหตุ'], [
    ['มกราคม 2570', 'เปิดรับสมัครออนไลน์', 'วันเริ่ม-สิ้นสุด รอประกาศ'],
    ['(รอกำหนด)', 'ประกาศเลขที่นั่งสอบและห้องสอบ', 'เข้าระบบที่เว็บไซต์นี้'],
    ['24 มกราคม 2570', 'วันสอบ', 'ณ โรงเรียนพรตพิทยพยัต'],
    ['(รอกำหนด)', 'ประกาศผลสอบ', 'TOP 10 รับเกียรติบัตร · TOP 5 รับสิทธิพิเศษลดหย่อนค่าเทอม*']
  ]);
  ensure(SHEETS.TIMETABLE, ['เวลา', 'รายการ', 'หมายเหตุ'], [
    ['07.30–08.00 น.', 'ลงทะเบียนและเข้าแถวตามห้องสอบ', 'ลานโดมอเนกประสงค์ (ตามปี 2569 รอยืนยัน)'],
    ['08.30–10.00 น.', 'สอบวิชาคณิตศาสตร์ และวิชาภาษาอังกฤษ', ''],
    ['10.00–10.10 น.', 'พัก', ''],
    ['10.10–12.10 น.', 'สอบวิชาวิทยาศาสตร์ วิชาภาษาไทย และวิชาสังคมศึกษาฯ', '']
  ]);
  ensure(SHEETS.SETTINGS, ['หัวข้อ', 'ค่า', 'คำอธิบาย'], [
    ['เปิดรับสมัคร', false, 'TRUE = เปิดรับ (ใช้ร่วมกับวันเริ่ม/สิ้นสุด)'],
    ['วันเริ่มรับสมัคร', '', 'เว้นว่างได้'],
    ['วันสิ้นสุดรับสมัคร', '', 'เว้นว่างได้ (ปิดหลังเวลา 23:59 น. ของวันนี้)'],
    ['ข้อความเมื่อปิดรับสมัคร', 'ขณะนี้ยังไม่เปิดรับสมัคร', ''],
    ['รับสูงสุด กลุ่ม P', '', 'จำนวนรับสูงสุด สนาม ม.1 (เว้นว่าง = ไม่จำกัด)'],
    ['รับสูงสุด กลุ่ม M', '', 'จำนวนรับสูงสุด สนาม ม.4 (เว้นว่าง = ไม่จำกัด)'],
    ['เวลาคลาดเคลื่อนที่ยอมรับ (นาที)', 3, 'ใช้ตอนกระทบยอดเวลาในสลิปกับเวลาในรายการเงินเข้า'],
    ['ยืนยันอัตโนมัติเมื่อสลิปถูกต้อง (ไม่แนะนำ)', false, 'TRUE = ไม่รอกระทบยอด (เสี่ยงสลิปปลอม)'],
    ['ประกาศที่นั่งสอบ', false, 'TRUE = ผู้สมัครเห็นเลขที่นั่งสอบและพิมพ์บัตรเข้าสอบได้'],
    ['ประกาศผลสอบ', false, 'TRUE = ผู้สมัครเห็นคะแนน'],
    ['คะแนนเต็มต่อวิชา', '', 'รอยืนยัน ใส่เมื่อทราบจำนวนข้อ/คะแนนเต็ม (ว่าง = แสดงเฉพาะคะแนนที่ได้)'],
    ['แสดงอันดับในผลสอบ', false, 'TRUE = แสดงอันดับในกลุ่มสอบ และป้าย TOP 10'],
    ['ประกาศหน้าเว็บ', '', 'ข้อความแจ้งข่าวบนเว็บ GitHub Pages'],
    ['โมเดล Claude (ใช้เมื่อใส่ ANTHROPIC_API_KEY)', 'claude-opus-5-5', 'claude-opus-5-5 อ่านแม่นที่สุด · claude-sonnet-5-5 ราคาครึ่งหนึ่ง · claude-haiku-5-5 ถูกที่สุด'],
    ['ช่องทางติดต่อ', 'กลุ่มบริหารวิชาการ โทร. 0-2326-4050 หรือ 093-428-1595', 'จากโปสเตอร์ปี 2569 รอยืนยัน'],
    ['ลิงก์เว็บตรวจสถานะ (GitHub Pages)', '', 'ใส่หลังเปิดเว็บ']
  ]);
  var def = ss.getSheetByName('Sheet1') || ss.getSheetByName('ชีต1') || ss.getSheetByName('แผ่น1');
  if (def && ss.getSheets().length > 1 && def.getLastRow() === 0) ss.deleteSheet(def);
  getSlipFolder_();
  return 'ตั้งค่าเรียบร้อย';
}

// ======================= เครื่องมือช่วย =======================
function getSheet_(name) {
  var sh = SpreadsheetApp.getActive().getSheetByName(name);
  if (!sh) throw new Error('ไม่พบแท็บ ' + name + ' (เรียก setup() ก่อน)');
  return sh;
}

function readRows_(name) {
  var values = getSheet_(name).getDataRange().getValues();
  var head = (values.shift() || []).map(String);
  return values.filter(function (r) { return r.some(function (c) { return c !== ''; }); }).map(function (r) {
    var o = {}; head.forEach(function (h, i) { o[h] = r[i]; }); return o;
  });
}

function appendRow_(name, obj) {
  var sh = getSheet_(name);
  var head = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
  sh.appendRow(head.map(function (h) { return h in obj ? obj[h] : ''; }));
}

function updateRow_(sh, rowIdx, obj) {
  var head = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
  Object.keys(obj).forEach(function (k) {
    var c = head.indexOf(k);
    if (c >= 0) sh.getRange(rowIdx, c + 1).setValue(obj[k] === undefined || obj[k] === null ? '' : obj[k]);
  });
}

function findRowIndex_(sh, header, value) {
  var values = sh.getDataRange().getValues();
  var c = values[0].indexOf(header);
  for (var i = 1; i < values.length; i++) if (values[i][c] === value) return i + 1;
  throw new Error('ไม่พบ ' + value);
}

function getSettings_() {
  var ss = SpreadsheetApp.getActive();
  var sh = ss && ss.getSheetByName(SHEETS.SETTINGS);
  var o = {};
  if (!sh) return o;
  sh.getDataRange().getValues().slice(1).forEach(function (r) { if (r[0]) o[String(r[0]).trim()] = r[1]; });
  return o;
}

function groupCounts_() {
  var rejected = {};
  var c = {};
  CONFIG.GROUPS.forEach(function (g) { c[g.code] = 0; });
  var ss = SpreadsheetApp.getActive();
  if (!ss || !ss.getSheetByName(SHEETS.APPLICANTS)) return c;
  readRows_(SHEETS.PAYMENTS).forEach(function (r) { if (r['สถานะ'] === STATUS.REJECTED) rejected[r['เลขที่รายการ']] = 1; });
  readRows_(SHEETS.APPLICANTS).forEach(function (r) {
    var g = String(r['กลุ่มสอบ'] || '');
    if (g in c && !rejected[r['เลขที่รายการชำระเงิน']]) c[g]++;
  });
  return c;
}

function groupOf_(grade) { return CONFIG.GROUPS.filter(function (g) { return g.grades.indexOf(grade) >= 0; })[0] || null; }

function isRegistrationOpen_(s) {
  if (!truthy_(s['เปิดรับสมัคร'])) return false;
  var now = new Date(), start = s['วันเริ่มรับสมัคร'], end = s['วันสิ้นสุดรับสมัคร'];
  if (start instanceof Date && now < start) return false;
  if (end instanceof Date) { var e = new Date(end.getTime()); e.setHours(23, 59, 59); if (now > e) return false; }
  return true;
}

function nextId_(counterKey, prefix) {
  var props = PropertiesService.getScriptProperties();
  var n = Number(props.getProperty('SEQ_' + counterKey) || 0) + 1;
  props.setProperty('SEQ_' + counterKey, String(n));
  return prefix + '70' + ('0000' + n).slice(-4);
}

function getSlipFolder_() {
  var props = PropertiesService.getScriptProperties();
  var id = props.getProperty('SLIP_FOLDER_ID');
  if (id) { try { return DriveApp.getFolderById(id); } catch (e) { /* สร้างใหม่ */ } }
  var f = DriveApp.createFolder(CONFIG.SLIP_FOLDER_NAME);
  props.setProperty('SLIP_FOLDER_ID', f.getId());
  return f;
}

function sendConfirmEmail_(to, submissionId, apps, msg) {
  var list = apps.map(function (a) { return '- ' + a.appId + ' ' + a.name + ' (' + a.group + ')'; }).join('\n');
  var url = String(getSettings_()['ลิงก์เว็บตรวจสถานะ (GitHub Pages)'] || '');
  MailApp.sendEmail({
    to: to,
    subject: 'ได้รับใบสมัคร ' + CONFIG.EVENT_NAME + ' (' + submissionId + ')',
    body: 'เรียน ผู้ปกครอง\n\nระบบได้รับใบสมัครแล้ว\nเลขที่รายการ: ' + submissionId + '\n' + list + '\n\n' + msg +
      '\n\nเข้าระบบดูสถานะ เลขที่นั่งสอบ และผลสอบ ด้วยเลขประจำตัวประชาชนของผู้สมัคร (หรือเลขที่สมัคร) และเบอร์โทรศัพท์ที่ใช้สมัคร' +
      (url ? '\n' + url : '') + '\n\n' + CONFIG.TEAM_NAME,
    name: CONFIG.TEAM_NAME
  });
}

function isThaiId_(id) {
  if (!/^\d{13}$/.test(id)) return false;
  var sum = 0;
  for (var i = 0; i < 12; i++) sum += Number(id[i]) * (13 - i);
  return (11 - (sum % 11)) % 10 === Number(id[12]);
}

function sha256Hex_(bytes) {
  return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, bytes)
    .map(function (b) { return ('0' + (b & 0xff).toString(16)).slice(-2); }).join('');
}

function toArabicDigits_(s) { return s.replace(/[๐-๙]/g, function (c) { return String(c.charCodeAt(0) - 0x0E50); }); }
function fileIdFromUrl_(url) { var m = String(url).match(/[-\w]{25,}/); return m ? m[0] : ''; }
function maskId_(id) { return id ? id.slice(0, 1) + '-xxxx-xxxxx-' + id.slice(10, 12) + '-' + id.slice(12) : ''; }
function clean_(s, max) { return String(s == null ? '' : s).replace(/[<>]/g, '').trim().slice(0, max); }
function truthy_(v) { return v === true || String(v).toUpperCase() === 'TRUE'; }
function fmtCell_(v) { return v instanceof Date ? Utilities.formatDate(v, 'Asia/Bangkok', 'd/M/') + (v.getFullYear() + 543) : String(v || ''); }
function fmtTimeCell_(v) { return v instanceof Date ? Utilities.formatDate(v, 'Asia/Bangkok', 'HH.mm') + ' น.' : String(v || ''); }
function fmtDateTime_(d) { return Utilities.formatDate(d, 'Asia/Bangkok', 'd/M/yyyy HH:mm'); }
