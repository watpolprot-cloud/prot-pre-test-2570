// สร้าง repo/form-demo.html จาก apps-script/Index.html (ใส่ค่าตัวอย่างแทนค่าจาก Apps Script)
const fs = require('fs'), path = require('path');
const src = fs.readFileSync(path.join(__dirname, '../apps-script/Index.html'), 'utf8');
const cfg = {
  eventName: 'PRE PROT TEST 2570', subtitle: 'ลองสนามจริง ก่อนสอบจริง',
  examDate: 'วันอาทิตย์ที่ 24 มกราคม 2570', place: 'โรงเรียนพรตพิทยพยัต',
  fee: 99, maxStudents: 5,
  groups: [
    { code: 'P', label: 'ลองสนามสอบเข้า ม.1', grades: ['ป.5', 'ป.6'], full: false },
    { code: 'M', label: 'ลองสนามสอบเข้า ม.4', grades: ['ม.3'], full: false }
  ],
  bank: { bankName: 'ธนาคารกรุงไทย', branch: 'สาขาเทคโนโลยีพระจอมเกล้าฯ ลาดกระบัง', accountDisplay: '693-0-53838-8', accountName: 'เงินสวัสดิการโรงเรียนพรตพิทยพยัต' },
  team: 'ทีมงานวัดผลและประเมินผล โรงเรียนพรตพิทยพยัต',
  registrationOpen: true, registrationNote: 'ขณะนี้ยังไม่เปิดรับสมัคร',
  contact: 'กลุ่มบริหารวิชาการ โทร. 0-2326-4050 หรือ 093-428-1595',
  statusPageUrl: 'index.html', aiSlipCheck: true
};
if (!src.includes('<?!= JSON.stringify(cfg) ?>')) throw new Error('ไม่พบจุดแทนค่า cfg');
let out = src.replace('<?!= JSON.stringify(cfg) ?>', JSON.stringify(cfg));
if (/<\?/.test(out)) throw new Error('ยังมีแท็ก Apps Script เหลือ');
out = out.replace('<base target="_top">\n', '');
out = out.replace('<title>', '<!-- ไฟล์นี้สร้างจาก apps-script/Index.html เพื่อดูตัวอย่างเท่านั้น ส่งใบสมัครไม่ได้จริง -->\n<title>');
fs.writeFileSync(path.join(__dirname, '../form-demo.html'), out);
console.log('ok', out.length);
