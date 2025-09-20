/* public/ui.js */

/* ---------------- DOM ---------------- */
const weekInput = document.getElementById('weekInput') || document.getElementById('week');
const drop = document.getElementById('drop');
const fileInput = document.getElementById('file');
const btnUpload = document.getElementById('btnUpload') || document.getElementById('uploadBtn') || document.getElementById('btnUploadParse') || document.getElementById('btnUploadParse'); 
const btnClear = document.getElementById('btnClear') || document.getElementById('clearBtn');
const output = document.getElementById('output');
const statusEl = document.getElementById('status');
const copyJsonBtn = document.getElementById('btnCopyJson');
const copyTsvBtn = document.getElementById('btnCopyTSV');
const previewImg = document.getElementById('preview');
const previewWrap = document.getElementById('previewWrap');

/* --------------- State --------------- */
let imageDataUrl = null;
let filenameWeek = null; // highest-priority week if present
let lastResponse = null;

/* ------------- Utilities ------------- */
function setStatus(msg) {
  if (statusEl) statusEl.textContent = msg;
}

function setOutput(text) {
  if (output) output.textContent = text;
}

function enableActions(enabled) {
  if (btnUpload) btnUpload.disabled = !enabled;
  if (btnClear) btnClear.disabled = !enabled && !imageDataUrl;
  if (copyJsonBtn) copyJsonBtn.disabled = !enabled || !lastResponse;
  if (copyTsvBtn) copyTsvBtn.disabled = !enabled || !lastResponse;
}

function guessWeekFromFilename(name) {
  if (!name) return null;
  const m = name.match(/week\s*(\d+)/i);
  return m ? parseInt(m[1], 10) : null;
}

function renderPreview(dataUrl) {
  if (!previewImg || !previewWrap) return;
  previewImg.src = dataUrl;
  previewWrap.style.display = 'block';
}

function buildTSV(resp) {
  // Week on first line (just the number), then blank line, then scores
  const weekLine = String(resp.week ?? '');
  const rows = resp.matchups.map(m =>
    `${m.homeTeam}\t${m.homeScore}\t${m.awayTeam}\t${m.awayScore}`
  );
  return [weekLine, '', ...rows].join('\n');
}

function renderResult(resp) {
  lastResponse = resp;
  const tsv = buildTSV(resp);
  const jsonPretty = JSON.stringify(resp, null, 2);

  // Show TSV first, then JSON below (as requested)
  setOutput(`${tsv}\n\nJSON\n\n${jsonPretty}`);
  setStatus('Done');
  enableActions(true);

  // Hook up copy buttons
  if (copyJsonBtn) {
    copyJsonBtn.onclick = () => navigator.clipboard.writeText(jsonPretty);
  }
  if (copyTsvBtn) {
    copyTsvBtn.onclick = () => navigator.clipboard.writeText(tsv);
  }
}

/* -------------- File/Paste ----------- */
async function readBlobAsDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = reject;
    r.readAsDataURL(blob);
  });
}

async function handleBlob(blob, name = '') {
  filenameWeek = guessWeekFromFilename(name);
  if (filenameWeek) {
    // populate selector from filename
    if (weekInput) weekInput.value = String(filenameWeek);
  }
  imageDataUrl = await readBlobAsDataUrl(blob);
  renderPreview(imageDataUrl);
  enableActions(true);
  setStatus('Ready');
}

// drag & drop
if (drop) {
  drop.addEventListener('dragover', e => {
    e.preventDefault();
    drop.classList.add('dragover');
  });
  drop.addEventListener('dragleave', e => {
    e.preventDefault();
    drop.classList.remove('dragover');
  });
  drop.addEventListener('drop', async e => {
    e.preventDefault();
    drop.classList.remove('dragover');
    const file = e.dataTransfer.files?.[0];
    if (file) await handleBlob(file, file.name);
  });
}

// click-to-choose
if (fileInput) {
  fileInput.addEventListener('change', async e => {
    const file = e.target.files?.[0];
    if (file) await handleBlob(file, file.name);
  });
}

// paste (Ctrl/Cmd+V)
document.addEventListener('paste', async e => {
  const items = e.clipboardData?.items || [];
  for (const it of items) {
    if (it.kind === 'file') {
      const blob = it.getAsFile();
      if (blob && blob.type.startsWith('image/')) {
        await handleBlob(blob, blob.name || '');
        break;
      }
    }
  }
});

/* --------------- Actions ------------- */
if (btnClear) {
  btnClear.addEventListener('click', () => {
    imageDataUrl = null;
    filenameWeek = null;
    lastResponse = null;
    if (previewWrap) previewWrap.style.display = 'none';
    if (previewImg) previewImg.src = '';
    setOutput('');
    setStatus('Ready');
    enableActions(false);
  });
}

if (btnUpload) {
  btnUpload.addEventListener('click', async () => {
    if (!imageDataUrl) return;
    enableActions(false);
    setStatus('Calling API...');
    setOutput('');

    // selector value (fallback)
    const selectorWeek = weekInput ? parseInt(weekInput.value || '0', 10) || 0 : 0;

    try {
      const res = await fetch('/api/parse-matchups', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          imageDataUrl,
          // send both; the API will choose by priority
          filenameWeek: filenameWeek ?? null,
          selectorWeek
        })
      });
      const data = await res.json();
      if (!res.ok) {
        setOutput(JSON.stringify(data, null, 2));
        setStatus('Error');
        enableActions(true);
        return;
      }

      // Set detected week back into selector for visibility
      if (data.week != null && weekInput) {
        weekInput.value = String(data.week);
      }
      renderResult(data);
    } catch (err) {
      setOutput(JSON.stringify({ error: String(err) }, null, 2));
      setStatus('Error');
      enableActions(true);
    }
  });
}

// init
enableActions(false);
setStatus('Ready');
