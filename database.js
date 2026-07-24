// ─────────────────────────────────────────────
//  Hash Database — database.js
//  Storage: localStorage key "hashdb_rows"
//  No dependencies.
// ─────────────────────────────────────────────

const STORAGE_KEY  = 'hashdb_rows';
const ROWS_PER_PAGE = 10;

// ── State ──────────────────────────────────────
let allRows   = [];   // full dataset
let editMode  = false;
let currentPage = 1;
let filterVal = 'all';

// ── DOM refs ───────────────────────────────────
const tbody         = document.getElementById('db-tbody');
const emptyState    = document.getElementById('empty-state');
const filterSelect  = document.getElementById('filter-select');
const btnEditMode   = document.getElementById('btn-edit-mode');
const btnDeleteSel  = document.getElementById('btn-delete-selected');
const btnSave       = document.getElementById('btn-save');
const btnAdd        = document.getElementById('btn-add');
const btnPrev       = document.getElementById('btn-prev');
const btnNext       = document.getElementById('btn-next');
const pageInfo      = document.getElementById('page-info');
const saveToast     = document.getElementById('save-toast');
const rowCountDisp  = document.getElementById('row-count-display');
const selectAllCb   = document.getElementById('select-all');
const thCheck       = document.getElementById('th-check');

// ── Persistence ────────────────────────────────
function loadRows() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

function saveRows() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(allRows));
  showToast();
}

// ── Unique ID ──────────────────────────────────
function uid() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

// ── Filter & paginate ─────────────────────────
function filteredRows() {
  if (filterVal === 'all') return allRows;
  return allRows.filter(r => r.status === filterVal);
}

function totalPages() {
  return Math.max(1, Math.ceil(filteredRows().length / ROWS_PER_PAGE));
}

function pageRows() {
  const rows = filteredRows();
  const start = (currentPage - 1) * ROWS_PER_PAGE;
  return rows.slice(start, start + ROWS_PER_PAGE);
}

// ── Status badge HTML ─────────────────────────
function statusBadge(status) {
  const cls = status === 'Succeeded'   ? 'succeeded'
            : status === 'Failed'      ? 'failed'
            : status === 'In Progress' ? 'inprogress'
            : '';
  return `<span class="status-badge ${cls}">${status || '—'}</span>`;
}

// ── Status select HTML ─────────────────────────
function statusSelect(current) {
  const opts = ['Succeeded', 'Failed', 'In Progress'];
  const options = opts.map(o =>
    `<option value="${o}" ${o === current ? 'selected' : ''}>${o}</option>`
  ).join('');
  return `<select class="cell-select" data-field="status">${options}</select>`;
}

// ── Render ─────────────────────────────────────
function render() {
  const rows = pageRows();
  const filtered = filteredRows();
  const tp = totalPages();

  // Clamp page
  if (currentPage > tp) currentPage = tp;

  // Update header count
  rowCountDisp.textContent = `${allRows.length} ROW${allRows.length !== 1 ? 'S' : ''}`;

  // Empty state
  if (filtered.length === 0) {
    tbody.innerHTML = '';
    emptyState.classList.remove('hidden');
  } else {
    emptyState.classList.add('hidden');
  }

  // Pagination controls
  pageInfo.textContent = `Page ${currentPage} / ${tp}`;
  btnPrev.disabled = currentPage <= 1;
  btnNext.disabled = currentPage >= tp;

  // Global row index offset for numbering
  const offset = (currentPage - 1) * ROWS_PER_PAGE;

  tbody.innerHTML = '';
  rows.forEach((row, i) => {
    const globalIdx = filteredRows().indexOf(row); // index in filtered set
    const displayNum = offset + i + 1;
    const tr = document.createElement('tr');
    if (row._new) tr.classList.add('new-row');

    // checkbox cell (only visible in edit mode)
    const tdCheck = document.createElement('td');
    tdCheck.className = 'col-check' + (editMode ? '' : ' hidden');
    tdCheck.innerHTML = `
      <label class="cb-wrap">
        <input type="checkbox" class="row-cb" data-id="${row.id}" ${row._selected ? 'checked' : ''} />
        <span class="cb-box"></span>
      </label>`;
    tr.appendChild(tdCheck);

    // number cell
    const tdNum = document.createElement('td');
    tdNum.className = 'col-num';
    tdNum.textContent = displayNum;
    tr.appendChild(tdNum);

    // data cells
    const fields = ['username', 'password', 'hash', 'status'];
    fields.forEach(field => {
      const td = document.createElement('td');
      if (field === 'status') td.className = 'col-status';

      if (editMode || row._new) {
        // editable
        if (field === 'status') {
          td.innerHTML = statusSelect(row.status);
        } else {
          td.innerHTML = `<input
            class="cell-input ${field === 'hash' ? 'mono' : ''}"
            type="${field === 'password' ? 'text' : 'text'}"
            data-field="${field}"
            value="${escHtml(row[field] || '')}"
            placeholder="${field}"
          />`;
        }
      } else {
        // read-only
        if (field === 'status') {
          td.innerHTML = statusBadge(row.status);
        } else {
          td.innerHTML = `<span class="cell-text ${field === 'hash' ? 'hash-text' : ''}">${escHtml(row[field] || '—')}</span>`;
        }
      }
      tr.appendChild(td);
    });

    tbody.appendChild(tr);
  });

  // Wire up cell inputs → allRows
  tbody.querySelectorAll('input.cell-input, select.cell-select').forEach(el => {
    el.addEventListener('input', onCellChange);
    el.addEventListener('change', onCellChange);
  });

  // Wire up row checkboxes
  tbody.querySelectorAll('.row-cb').forEach(cb => {
    cb.addEventListener('change', () => {
      const row = allRows.find(r => r.id === cb.dataset.id);
      if (row) row._selected = cb.checked;
      updateDeleteBtn();
      updateSelectAll();
    });
  });

  // Select-all header checkbox
  thCheck.classList.toggle('hidden', !editMode);
  updateSelectAll();
  updateDeleteBtn();
}

function onCellChange(e) {
  const input = e.target;
  const field = input.dataset.field;
  const tr = input.closest('tr');
  // Find which row this tr belongs to
  const rowIdx = Array.from(tbody.children).indexOf(tr);
  const rows = pageRows();
  const row = rows[rowIdx];
  if (row) {
    row[field] = input.value;
  }
}

function updateDeleteBtn() {
  const anySelected = allRows.some(r => r._selected);
  btnDeleteSel.classList.toggle('hidden', !anySelected);
}

function updateSelectAll() {
  const cbs = Array.from(tbody.querySelectorAll('.row-cb'));
  if (cbs.length === 0) { selectAllCb.checked = false; selectAllCb.indeterminate = false; return; }
  const checked = cbs.filter(c => c.checked).length;
  selectAllCb.checked = checked === cbs.length;
  selectAllCb.indeterminate = checked > 0 && checked < cbs.length;
}

function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ── Toast ──────────────────────────────────────
let toastTimer = null;
function showToast() {
  saveToast.classList.remove('hidden');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => saveToast.classList.add('hidden'), 2000);
}

// ── Event handlers ──────────────────────────────

// Filter
filterSelect.addEventListener('change', () => {
  filterVal = filterSelect.value;
  currentPage = 1;
  render();
});

// Edit mode toggle
btnEditMode.addEventListener('click', () => {
  editMode = !editMode;
  if (!editMode) {
    // leaving edit mode: clear selections, finalize new rows
    allRows.forEach(r => { r._selected = false; delete r._new; });
  }
  btnEditMode.classList.toggle('active', editMode);
  render();
});

// Delete selected
btnDeleteSel.addEventListener('click', () => {
  allRows = allRows.filter(r => !r._selected);
  currentPage = Math.min(currentPage, totalPages());
  render();
});

// Select all
selectAllCb.addEventListener('change', () => {
  const cbs = tbody.querySelectorAll('.row-cb');
  cbs.forEach(cb => {
    cb.checked = selectAllCb.checked;
    const row = allRows.find(r => r.id === cb.dataset.id);
    if (row) row._selected = selectAllCb.checked;
  });
  updateDeleteBtn();
});

// Save
btnSave.addEventListener('click', () => {
  // Commit any open inputs before saving
  tbody.querySelectorAll('input.cell-input, select.cell-select').forEach(el => {
    const field = el.dataset.field;
    const tr = el.closest('tr');
    const rowIdx = Array.from(tbody.children).indexOf(tr);
    const row = pageRows()[rowIdx];
    if (row) row[field] = el.value;
  });
  // Strip internal flags
  allRows.forEach(r => { delete r._new; delete r._selected; });
  saveRows();
  render();
});

// Add row
btnAdd.addEventListener('click', () => {
  const newRow = {
    id: uid(),
    username: '',
    password: '',
    hash: '',
    status: 'In Progress',
    _new: true,
    _selected: false,
  };
  allRows.push(newRow);

  // Jump to last page so new row is visible
  filterVal = 'all';
  filterSelect.value = 'all';
  currentPage = totalPages();
  render();

  // Focus the username input of the last row
  const inputs = tbody.querySelectorAll('input.cell-input[data-field="username"]');
  if (inputs.length) inputs[inputs.length - 1].focus();
});

// Pagination
btnPrev.addEventListener('click', () => {
  if (currentPage > 1) { currentPage--; render(); }
});
btnNext.addEventListener('click', () => {
  if (currentPage < totalPages()) { currentPage++; render(); }
});

// ── Boot ───────────────────────────────────────
allRows = loadRows();
render();
