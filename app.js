// ─────────────────────────────────────────────
//  SHA-1 Dehasher — app.js
//  Zero dependencies. Pure JS SHA-1 works on
//  file://, http://, and https:// alike.
// ─────────────────────────────────────────────

// ── Pure-JS SHA-1 (RFC 3174) ──────────────────
// Included both here (for validation) and inside
// the Worker string below.
function sha1(message) {
  function rotl(v, n) { return (v << n) | (v >>> (32 - n)); }
  function hex32(v) {
    let s = '';
    for (let i = 28; i >= 0; i -= 4) s += '0123456789abcdef'[(v >>> i) & 0xf];
    return s;
  }
  // UTF-8 encode via the deprecated-but-universal unescape trick
  const utf8 = unescape(encodeURIComponent(message));
  const len  = utf8.length;

  // Build 32-bit word array with padding
  const numBlocks = ((len + 8) >> 6) + 1;
  const w = new Array(numBlocks * 16).fill(0);
  for (let i = 0; i < len; i++) {
    w[i >> 2] |= (utf8.charCodeAt(i) & 0xff) << (24 - (i & 3) * 8);
  }
  w[len >> 2]      |= 0x80 << (24 - (len & 3) * 8);
  w[numBlocks * 16 - 1] = len * 8;

  let H0 = 0x67452301, H1 = 0xEFCDAB89,
      H2 = 0x98BADCFE, H3 = 0x10325476, H4 = 0xC3D2E1F0;

  for (let blk = 0; blk < numBlocks; blk++) {
    const W = new Array(80);
    for (let i = 0;  i < 16; i++) W[i] = w[blk * 16 + i];
    for (let i = 16; i < 80; i++) W[i] = rotl(W[i-3]^W[i-8]^W[i-14]^W[i-16], 1);

    let a = H0, b = H1, c = H2, d = H3, e = H4;
    for (let i = 0; i < 80; i++) {
      let f, k;
      if      (i < 20) { f = (b & c) | (~b & d);           k = 0x5A827999; }
      else if (i < 40) { f = b ^ c ^ d;                    k = 0x6ED9EBA1; }
      else if (i < 60) { f = (b & c) | (b & d) | (c & d); k = 0x8F1BBCDC; }
      else             { f = b ^ c ^ d;                    k = 0xCA62C1D6; }
      const t = (rotl(a, 5) + f + e + k + W[i]) | 0;
      e = d; d = c; c = rotl(b, 30); b = a; a = t;
    }
    H0 = (H0 + a) | 0; H1 = (H1 + b) | 0;
    H2 = (H2 + c) | 0; H3 = (H3 + d) | 0; H4 = (H4 + e) | 0;
  }
  return hex32(H0) + hex32(H1) + hex32(H2) + hex32(H3) + hex32(H4);
}

// ── Inline Worker (same SHA-1, no imports needed) ──
const WORKER_CODE = `
function rotl(v,n){return(v<<n)|(v>>>(32-n));}
function hex32(v){let s='';for(let i=28;i>=0;i-=4)s+='0123456789abcdef'[(v>>>i)&0xf];return s;}
function sha1(message){
  const utf8=unescape(encodeURIComponent(message));
  const len=utf8.length;
  const numBlocks=((len+8)>>6)+1;
  const w=new Array(numBlocks*16).fill(0);
  for(let i=0;i<len;i++)w[i>>2]|=(utf8.charCodeAt(i)&0xff)<<(24-(i&3)*8);
  w[len>>2]|=0x80<<(24-(len&3)*8);
  w[numBlocks*16-1]=len*8;
  let H0=0x67452301,H1=0xEFCDAB89,H2=0x98BADCFE,H3=0x10325476,H4=0xC3D2E1F0;
  for(let blk=0;blk<numBlocks;blk++){
    const W=new Array(80);
    for(let i=0;i<16;i++)W[i]=w[blk*16+i];
    for(let i=16;i<80;i++)W[i]=rotl(W[i-3]^W[i-8]^W[i-14]^W[i-16],1);
    let a=H0,b=H1,c=H2,d=H3,e=H4;
    for(let i=0;i<80;i++){
      let f,k;
      if(i<20){f=(b&c)|(~b&d);k=0x5A827999;}
      else if(i<40){f=b^c^d;k=0x6ED9EBA1;}
      else if(i<60){f=(b&c)|(b&d)|(c&d);k=0x8F1BBCDC;}
      else{f=b^c^d;k=0xCA62C1D6;}
      const t=(rotl(a,5)+f+e+k+W[i])|0;
      e=d;d=c;c=rotl(b,30);b=a;a=t;
    }
    H0=(H0+a)|0;H1=(H1+b)|0;H2=(H2+c)|0;H3=(H3+d)|0;H4=(H4+e)|0;
  }
  return hex32(H0)+hex32(H1)+hex32(H2)+hex32(H3)+hex32(H4);
}

self.onmessage = function(e) {
  const { prefix, targetHash, charset } = e.data;
  const maxLen = 6;
  let count = 0;

  // Try prefix alone first
  if (sha1(prefix) === targetHash) {
    self.postMessage({ type: 'found', result: prefix });
    return;
  }

  for (let len = 1; len <= maxLen; len++) {
    const indices = new Array(len).fill(0);
    while (true) {
      const suffix    = indices.map(i => charset[i]).join('');
      const candidate = prefix + suffix;
      count++;
      if (count % 500 === 0) {
        self.postMessage({ type: 'progress', current: candidate });
      }
      if (sha1(candidate) === targetHash) {
        self.postMessage({ type: 'found', result: candidate });
        return;
      }
      let pos = len - 1;
      while (pos >= 0) {
        indices[pos]++;
        if (indices[pos] < charset.length) break;
        indices[pos] = 0;
        pos--;
      }
      if (pos < 0) break;
    }
  }
  self.postMessage({ type: 'notFound' });
};
`;

// ── DOM refs ──
const viewForm    = document.getElementById('view-form');
const viewRunning = document.getElementById('view-running');
const viewResult  = document.getElementById('view-result');

const inputHash   = document.getElementById('input-hash');
const inputPrefix = document.getElementById('input-prefix');
const errorBanner = document.getElementById('error-banner');
const errorText   = document.getElementById('error-text');

const btnStart    = document.getElementById('btn-start');
const btnStop     = document.getElementById('btn-stop');
const btnReset    = document.getElementById('btn-reset');

const currentCandidate   = document.getElementById('current-candidate');
const resultIconFound    = document.getElementById('result-icon-found');
const resultIconNotFound = document.getElementById('result-icon-notfound');
const resultTitle        = document.getElementById('result-title');
const resultSub          = document.getElementById('result-sub');
const resultBox          = document.getElementById('result-box');
const resultValue        = document.getElementById('result-value');

// ── Checkbox wiring ──
// Listen to `change` on the (hidden) input — the browser toggles it
// when the wrapping label is clicked. This avoids the double-toggle
// bug that happens when you manually flip .checked inside a click handler.
const checkboxIds = ['cb-lower', 'cb-upper', 'cb-numbers', 'cb-symbols'];

checkboxIds.forEach(id => {
  const input = document.getElementById(id);
  const label = document.getElementById(id + '-label');

  // Sync visual state on every change
  function sync() {
    if (input.checked) label.classList.add('checked');
    else               label.classList.remove('checked');
  }

  input.addEventListener('change', sync);
  sync(); // apply initial state
});

function isChecked(id) {
  return document.getElementById(id).checked;
}

// ── Helpers ──
function buildCharset() {
  let chars = '';
  if (isChecked('cb-lower'))   chars += 'abcdefghijklmnopqrstuvwxyz';
  if (isChecked('cb-upper'))   chars += 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  if (isChecked('cb-numbers')) chars += '0123456789';
  if (isChecked('cb-symbols')) chars += "!@#$%^&*()-_=+[]{}|;:'\",.<>?/`~\\";
  return chars;
}

function showError(msg) {
  errorText.textContent = msg;
  errorBanner.classList.remove('hidden');
}

function clearError() {
  errorBanner.classList.add('hidden');
}

function showView(name) {
  viewForm.classList.add('hidden');
  viewRunning.classList.add('hidden');
  viewResult.classList.add('hidden');
  if (name === 'form')    viewForm.classList.remove('hidden');
  if (name === 'running') viewRunning.classList.remove('hidden');
  if (name === 'result')  viewResult.classList.remove('hidden');
}

// ── Worker ──
let worker = null;

btnStart.addEventListener('click', () => {
  clearError();

  const hash    = inputHash.value.trim().toLowerCase();
  const prefix  = inputPrefix.value;
  const charset = buildCharset();

  if (!/^[a-f0-9]{40}$/.test(hash)) {
    showError('ERR_INVALID_HASH: Target must be exactly 40 hexadecimal characters.');
    return;
  }
  if (!charset) {
    showError('ERR_NO_CHARSET: Select at least one character set to search.');
    return;
  }

  currentCandidate.textContent = prefix || '...';
  showView('running');

  const blob      = new Blob([WORKER_CODE], { type: 'application/javascript' });
  const workerUrl = URL.createObjectURL(blob);
  worker = new Worker(workerUrl);

  worker.onmessage = ({ data: msg }) => {
    if (msg.type === 'progress') {
      currentCandidate.textContent = msg.current;
    } else if (msg.type === 'found') {
      worker.terminate();
      showResult(true, msg.result);
    } else if (msg.type === 'notFound') {
      worker.terminate();
      showResult(false, null);
    }
  };

  worker.onerror = (err) => {
    worker.terminate();
    showView('form');
    showError('Worker error: ' + err.message);
  };

  worker.postMessage({ prefix, targetHash: hash, charset });
});

btnStop.addEventListener('click', () => {
  if (worker) worker.terminate();
  showView('form');
});

btnReset.addEventListener('click', () => showView('form'));

// ── Show result ──
function showResult(found, value) {
  resultIconFound.classList.add('hidden');
  resultIconNotFound.classList.add('hidden');
  resultBox.classList.add('hidden');

  if (found) {
    resultIconFound.classList.remove('hidden');
    resultTitle.textContent = 'Collision Found';
    resultTitle.className   = 'result-title found';
    resultSub.textContent   = 'Original string successfully recovered.';
    resultBox.classList.remove('hidden');
    resultValue.textContent = value;
  } else {
    resultIconNotFound.classList.remove('hidden');
    resultTitle.textContent = 'Search Exhausted';
    resultTitle.className   = 'result-title danger';
    resultSub.textContent   = 'No match found within the defined search space.';
  }

  showView('result');
}
