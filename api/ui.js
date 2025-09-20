(() => {
  const el = (id) => document.getElementById(id);
  const drop = el('drop');
  const file = el('file');
  const weekInput = el('weekInput');
  const btnUpload = el('btnUpload');
  const btnClear = el('btnClear');
  const btnCopyJson = el('btnCopyJson');
  const btnCopyTSV = el('btnCopyTSV');
  const output = el('output');
  const statusEl = el('status');
  const previewWrap = el('previewWrap');
  const preview = el('preview');

  let dataUrl = null;

  function setStatus(s) { statusEl.textContent = s; }
  function enableActions(hasImg) {
    btnUpload.disabled = !hasImg;
    btnClear.disabled = !hasImg;
    btnCopyJson.disabled = output.textContent.trim().length === 0;
    btnCopyTSV.disabled = btnCopyJson.disabled;
  }
  function clearAll() {
    dataUrl = null;
    preview.src = '';
    previewWrap.style.display = 'none';
    output.textContent = '';
    setStatus('Ready');
    enableActions(false);
  }
  clearAll();

  // drag & drop + click to open file
  drop.addEventListener('click', () => file.click());
  drop.addEventListener('dragover', (e) => { e.preventDefault(); drop.classList.add('hover'); });
  drop.addEventListener('dragleave', () => drop.classList.remove('hover'));
  drop.addEventListener('drop', async (e) => {
    e.preventDefault(); drop.classList.remove('hover');
    const f = e.dataTransfer.files?.[0]; if (f) await handleFile(f);
  });
  file.addEventListener('change', async (e) => {
    const f = e.target.files?.[0]; if (f) await handleFile(f);
  });

  // paste image (Ctrl/Cmd+V)
  window.addEventListener('paste', async (e) => {
    const item = [...e.clipboardData.items].find(i => i.type.startsWith('image/'));
    if (!item) return;
    const blob = item.getAsFile();
    await handleFile(blob);
  });

  async function handleFile(f) {
    dataUrl = await fileToDataURL(f);
    preview.src = dataUrl;
    previewWrap.style.display = 'block';
    enableActions(true);
  }
  function fileToDataURL(f) {
    return new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onerror = reject;
      r.onload = () => resolve(r.result);
      r.readAsDataURL(f);
    });
  }

  btnClear.addEventListener('click', clearAll);

  btnUpload.addEventListener('click', async () => {
    if (!dataUrl) return;
    const week = weekInput.value ? Number(weekInput.value) : null;
    setStatus('Calling /api/parse-matchups …');
    output.textContent = '';

    try {
      const res = await fetch('/api/parse-matchups', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ imageDataUrl: dataUrl, week })
      });
      const text = await res.text();
      if (!res.ok) {
        setStatus(`Error: ${res.status}`);
        output.textContent = text;
        enableActions(true);
        return;
      }
      setStatus('OK');
      output.textContent = text;
      enableActions(true);
    } catch (err) {
      setStatus('Network error');
      output.textContent = String(err);
      enableActions(true);
    }
  });

  btnCopyJson.addEventListener('click', async () => {
    await navigator.clipboard.writeText(output.textContent);
    setStatus('JSON copied');
  });
  btnCopyTSV.addEventListener('click', async () => {
    try {
      const json = JSON.parse(output.textContent);
      const rows = (json.matchups || []).map(m =>
        [m.homeTeam, m.homeScore, m.awayTeam, m.awayScore, m.winner, m.diff].join('\t')
      );
      const tsv = rows.join('\n');
      await navigator.clipboard.writeText(tsv);
      setStatus('TSV copied');
    } catch {
      setStatus('No valid JSON in output');
    }
  });
})();
