// Minimal Google Apps Script mocks for local testing
const crypto = require('crypto');
function makeEnv(opts = {}) {
  const sheets = {};
  const order = [];
  const toSigned = buf => Array.from(buf).map(b => (b > 127 ? b - 256 : b));
  function Sheet(name) {
    this.name = name; this.data = [];
  }
  Sheet.prototype = {
    getName() { return this.name; },
    getLastRow() { return this.data.length; },
    getLastColumn() { return this.data.reduce((m, r) => Math.max(m, r.length), 0); },
    _ensure(r, c) { while (this.data.length < r) this.data.push([]); const row = this.data[r - 1]; while (row.length < c) row.push(''); },
    getRange(r, c, nr = 1, nc = 1) {
      const sh = this;
      const rng = {
        getValues() { const out = []; for (let i = 0; i < nr; i++) { const row = []; for (let j = 0; j < nc; j++) { const v = (sh.data[r - 1 + i] || [])[c - 1 + j]; row.push(v === undefined ? '' : v); } out.push(row); } return out; },
        setValues(vals) { vals.forEach((row, i) => row.forEach((v, j) => { sh._ensure(r + i, c + j); sh.data[r - 1 + i][c - 1 + j] = norm(v); })); return rng; },
        setValue(v) { sh._ensure(r, c); sh.data[r - 1][c - 1] = norm(v); return rng; },
        setFontWeight() { return rng; }, setBackground() { return rng; }, setFontColor() { return rng; }, setDataValidation() { return rng; },
        getRow() { return r; }, getNumRows() { return nr; }
      };
      return rng;
    },
    getDataRange() { const w = this.getLastColumn(); const sh = this; const vals = () => sh.data.map(r => { const x = r.slice(); while (x.length < w) x.push(''); return x; }); return { getValues: vals, getDisplayValues: () => vals().map(r => r.map(v => v instanceof Date ? v.toLocaleDateString('en-GB') : String(v))) }; },
    appendRow(arr) { this.data.push(arr.map(norm)); },
    setFrozenRows() {},
    getActiveRange() { return this._active; }
  };
  function norm(v) { if (typeof v === 'string' && v.startsWith("'")) return v.slice(1); if (typeof v === 'string' && /^(TRUE|FALSE)$/.test(v)) return v === 'TRUE'; return v; }
  const ss = {
    getSheetByName: n => sheets[n] || null,
    insertSheet: n => { sheets[n] = new Sheet(n); order.push(n); return sheets[n]; },
    getSheets: () => order.map(n => sheets[n]),
    deleteSheet: s => { delete sheets[s.name]; order.splice(order.indexOf(s.name), 1); }
  };
  const props = {}; const cache = {}; const files = {}; const mails = [];
  let fileSeq = 0;
  const newId = () => 'F' + String(++fileSeq).padStart(30, '0');
  const env = {
    _sheets: sheets, _mails: mails, _files: files, _ocrText: opts.ocrText || '',
    SpreadsheetApp: {
      getActive: () => ss, flush() {}, getActiveSheet: () => env._activeSheet,
      newDataValidation: () => { const b = { requireValueInList: () => b, build: () => ({}) }; return b; },
      getUi: () => ({ alert: (...a) => { env._alerts = (env._alerts || []).concat([a]); return 'YES'; }, ButtonSet: {}, Button: { YES: 'YES' } })
    },
    PropertiesService: { getScriptProperties: () => ({ getProperty: k => (k in props ? props[k] : null), setProperty: (k, v) => { props[k] = String(v); } }) },
    LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
    CacheService: { getScriptCache: () => ({ get: k => (k in cache ? cache[k] : null), put: (k, v) => { cache[k] = v; }, remove: k => { delete cache[k]; } }) },
    Utilities: {
      base64Decode: s => toSigned(Buffer.from(s, 'base64')),
      base64Encode: b => Buffer.from(b.map(x => x & 255)).toString('base64'),
      newBlob: (bytes, type, name) => ({ bytes, type, name, getBytes: () => bytes, getContentType: () => type }),
      DigestAlgorithm: { SHA_256: 'sha256' },
      computeDigest: (alg, bytes) => toSigned(crypto.createHash('sha256').update(Buffer.from(bytes.map(x => x & 255))).digest()),
      formatDate: (d, tz, f) => { const p = n => String(n).padStart(2, '0'); return f.replace('yyyy', d.getFullYear()).replace('HH', p(d.getHours())).replace('mm', p(d.getMinutes())).replace(/\bd\b/, d.getDate()).replace(/\bM\b/, d.getMonth() + 1); }
    },
    DriveApp: {
      createFolder: name => { const id = newId(); files[id] = { folder: true, name }; return { getId: () => id, createFile: blob => { const fid = newId(); files[fid] = { blob }; return { getUrl: () => 'https://drive.google.com/file/d/' + fid + '/view', getId: () => fid }; } }; },
      getFolderById: id => { if (!files[id]) throw new Error('nf'); return { getId: () => id, createFile: blob => { const fid = newId(); files[fid] = { blob }; return { getUrl: () => 'https://drive.google.com/file/d/' + fid + '/view', getId: () => fid }; } }; },
      getFileById: id => { const f = files[id]; if (!f) throw new Error('file nf ' + id); return { getBlob: () => f.blob, setTrashed: () => { f.trashed = true; } }; }
    },
    Drive: { Files: { create: (meta, blob, o) => { const id = newId(); files[id] = { doc: true, text: env._ocrText }; return { id }; } } },
    DocumentApp: { openById: id => ({ getBody: () => ({ getText: () => files[id].text }) }) },
    MailApp: { sendEmail: o => mails.push(o) },
    Session: { getActiveUser: () => ({ getEmail: () => 'staff@prot.ac.th' }) },
    ContentService: { createTextOutput: t => ({ t, setMimeType() { return this; } }), MimeType: {} },
    UrlFetchApp: { fetch: () => { throw new Error('no network in test'); } },
    console
  };
  return env;
}
module.exports = { makeEnv };
