// ─────────────────────────────────────────────
//  SHA-1 Dehasher — app.js
//  No dependencies. Uses Web Crypto API + Web Workers.
// ─────────────────────────────────────────────

// ── Inline Web Worker code ──
const WORKER_CODE = `
async function sha1(str) {
  const encoder = new TextEncoder();
  const data = encoder.encode(str);
  const hashBuffer = await crypto.subtle.digest('SHA-1', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

self.onmessage = async function(e) {
  const { prefix, targetHash, charset } = e.data;
  const maxLen = 6;
  let count = 0;

  for (let len = 0; len <= maxLen; len++) {
    if (len === 0) {
      // Try the prefix alone as the full candidate
      const hash = await sha1(prefix);
      if (hash === targetHash) {
        self.postMessage({ type: 'found', result: prefix });
        return;
      }
      continue;
    }

    const indices = new Array(len).fill(0);
    while (true) {
      const suffix = indices.map(i => charset[i]).join('');
      const candidate = prefix + suffix;
      count++;
      if (count % 500 === 0) {
        self.postMessage({ type: 'progress', current: candidate });
      }
      const hash = await sha1(candidate);
      if (hash === targetHash) {
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

const currentCandidate  = document.getElementById('current-candidate');
const resultIconFound   = document.getElementById('result-icon-found');
const resultIconNotFound= document.getElementById('result-icon-notfound');
const resultTitle       = document.getElementById('result-title');
const resultSub         = document.getElementById('result-sub');
const resultBox         = document.getElementById('result-box');
const resultValue       = document.getElementById('result-value');

// ── Checkbox wiring ──
const checkboxDefs = [
  { cbId: 'cb-lower',   labelId: 'cb-lower-label',   boxId: 'cb-lower-box'   },
  { cbId: 'cb-upper',   labelId: 'cb-upper-label',   boxId: 'cb-upper-box'   },
  { cbId: 'cb-numbers', labelId: 'cb-numbers-label', boxId: 'cb-numbers-box' },
  { cbId: 'cb-symbols', labelId: 'cb-symbols-label', boxId: 'cb-symbols-box' },
];

checkboxDefs.forEach(({ cbId, labelId }) => {
  const label = document.getElementById(labelId);
  const input = document.getElementById(cbId);

  // Apply initial state
  syncCheckbox(labelId, input.checked);

  label.addEventListener('click', () => {
    input.checked = !input.checked;
    syncCheckbox(labelId, input.checked);
  });
});

function syncCheckbox(labelId, checked) {
  const label = document.getElementById(labelId);
  if (checked) label.classList.add('checked');
  else         label.classList.remove('checked');
}

function isChecked(id) {
  return document.getElementById(id).checked;
}

// ── Worker ──
let worker = null;

function buildCharset() {
  let chars = '';
  if (isChecked('cb-lower'))   chars += 'abcdefghijklmnopqrstuvwxyz';
  if (isChecked('cb-upper'))   chars += 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  if (isChecked('cb-numbers')) chars += '0123456789';
  if (isChecked('cb-symbols')) chars += '!@#$%^&*()-_=+[]{}|;:\'",.<>?/`~\\';
  return chars;
}

function showError(msg) {
  errorText.textContent = msg;
  errorBanner.classList.remove('hidden');
}

function clearError() {
  errorBanner.classList.add('hidden');
  errorText.textContent = '';
}

function showView(name) {
  viewForm.classList.add('hidden');
  viewRunning.classList.add('hidden');
  viewResult.classList.add('hidden');

  if (name === 'form')    viewForm.classList.remove('hidden');
  if (name === 'running') viewRunning.classList.remove('hidden');
  if (name === 'result')  viewResult.classList.remove('hidden');
}

// ── Start ──
btnStart.addEventListener('click', () => {
  clearError();

  const hash   = inputHash.value.trim().toLowerCase();
  const prefix = inputPrefix.value;
  const charset = buildCharset();

  if (!/^[a-f0-9]{40}$/.test(hash)) {
    showError('ERR_INVALID_HASH: Target must be exactly 40 hexadecimal characters.');
    return;
  }
  if (charset.length === 0) {
    showError('ERR_NO_CHARSET: Select at least one character set to search.');
    return;
  }

  currentCandidate.textContent = prefix || '...';
  showView('running');

  const blob      = new Blob([WORKER_CODE], { type: 'application/javascript' });
  const workerUrl = URL.createObjectURL(blob);
  worker = new Worker(workerUrl);

  worker.onmessage = (e) => {
    const msg = e.data;
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

  worker.postMessage({ prefix, targetHash: hash, charset });
});

// ── Stop ──
btnStop.addEventListener('click', () => {
  if (worker) worker.terminate();
  showView('form');
});

// ── Reset ──
btnReset.addEventListener('click', () => {
  showView('form');
});

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
