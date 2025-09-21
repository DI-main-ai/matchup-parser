/* public/ui.js */
(() => {
  const els = {
    week: document.getElementById('week'),
    drop: document.getElementById('drop'),
    file: document.getElementById('file'),
    btnUpload: document.getElementById('btnUpload'),
    btnClear: document.getElementById('btnClear'),
    thumbWrap: document.getElementById('thumbWrap'),
    thumb: document.getElementById('thumb'),
    state: document.getElementById('state'),
    tsvOut: document.getElementById('tsvOut'),
    jsonOut: document.getElementById('jsonOut'),
    btnCopyTsv: document.getElementById('btnCopyTsv'),
    btnCopyJson: document.getElementById('btnCopyJson'),
    apiHeader: document.getElementById('apiResponseHeader'),
  };

  const setState = (txt) => els.state && (els.state.textContent = txt || '');
  const enableCopies = (on) => {
    [els.btnCopyTsv, els.btnCopyJson].forEach(b => b && (b.disabled = !on));
  };
  const clearOutputs = () => {
    if (els.tsvOut) els.tsvOut.textContent = '';
    if (els.jsonOut) els.jsonOut.textContent = '';
    enableCopies(false);
    setState('Ready');
  };
  const toFixed = (n) => {
    if (typeof n === 'number') return n.toFixed(2);
    if (!n) return '';
    const f = parseFloat(String(n).replace(/[^\d.-]/g, ''));
    return isFinite(f) ? f.toFixed(2) : String(n);
  };
  function buildTsv(week, matchups) {
    const lines = [String(week ?? ''), ''];
    for (const m of matchups) {
      lines.push(`${m.homeTeam}\t${toFixed(m.homeScore)}`);
      lines.push(`${m.awayTeam}\t${toFixed(m.awayScore)}`);
      lines.push('');
    }
    return lines.join('\n').trimEnd();
  }
  function extractWeekFromFilename(name) {
    if (!name) return null;
    const m = name.match(/(?:^|[\s_-])(week|wk|w)\s*([0-9]{1,2})(?=\D|$)/i);
    return m ? parseInt(m[2], 10) : null;
  }
  const fileToDataUrl = (file) => new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onerror = reject;
    fr.onload = () => resolve(fr.result);
    fr.readAsDataURL(file);
  });

  // ---- History UI (injected) ----
  const hist = {};
  function injectHistoryUI() {
    if (hist.wrap) return;
    const anchor = els.apiHeader || els.tsvOut?.parentElement || document.body;

    const wrap = document.createElement('div');
    wrap.style.display = 'flex';
    wrap.style.gap = '8px';
    wrap.style.flexWrap = 'wrap';
    wrap.style.alignItems = 'center';
    wrap.style.margin = '8px 0 10px';

    const label = document.createElement('span');
    label.textContent = 'History:';
    label.style.opacity = '0.8';

    const select = document.createElement('select');
    select.style.minWidth = '300px';
    select.disabled = true;

    const btnRevert = document.createElement('button');
    btnRevert.textContent = 'Revert';
    btnRevert.disabled = true;

    const btnDelete = document.createElement('button');
    btnDelete.textContent = 'Delete';
    btnDelete.disabled = true;

    wrap.append(label, select, btnRevert, btnDelete);
    anchor.parentElement.insertBefore(wrap, anchor.nextSibling);

    hist.wrap = wrap;
    hist.select = select;
    hist.btnRevert = btnRevert;
    hist.btnDelete = btnDelete;

    btnRevert.addEventListener('click', onRevert);
    btnDelete.addEventListener('click', onDelete);
  }

  async function historyList() {
    try {
      const res = await fetch('/api/history/list');
      const raw = await res.text();
      let json; try { json = JSON.parse(raw); } catch { throw new Error(raw); }
      return json;
    } catch { return { items: [] }; }
  }
  async function historyGet(id) {
    const res = await fetch(`/api/history/get?id=${encodeURIComponent(id)}`);
    const raw = await res.text();
    let json; try { json = JSON.parse(raw); } catch { throw new Error(raw); }
    return json;
  }
  async function historyUse(id) {
    const res = await fetch(`/api/history/use?id=${encodeURIComponent(id)}`, { method:'POST' });
    const raw = await res.text();
    let json; try { json = JSON.parse(raw); } catch { throw new Error(raw); }
    return json;
  }
  async function historyDelete(id) {
    const res = await fetch(`/api/history/delete?id=${encodeURIComponent(id)}`, { method:'POST' });
    const raw = await res.text();
    let json; try { json = JSON.parse(raw); } catch { throw new Error(raw); }
    return json;
  }

  function ctLabel(ts) {
    try {
      const d = new Date(ts);
      return new Intl.DateTimeFormat('en-US', {
        timeZone:'America/Chicago',
        month:'2-digit', day:'2-digit',
        hour:'2-digit', minute:'2-digit', hour12:true
      }).format(d).replace(',', '');
    } catch { return ts; }
  }
  async function refreshHistory() {
    injectHistoryUI();
    hist.select.innerHTML = '';
    hist.select.disabled = true; hist.btnRevert.disabled = true; hist.btnDelete.disabled = true;

    const { items } = await historyList();
    if (!items.length) {
      const opt = document.createElement('option');
      opt.textContent = 'No history yet';
      opt.disabled = true; opt.selected = true;
      hist.select.appendChild(opt);
      return;
    }
    for (const it of items) {
      const opt = document.createElement('option');
      opt.value = it.id;
      opt.textContent = it.label || `W${it.week} • ${ctLabel(it.createdAt)}`;
      hist.select.appendChild(opt);
    }
    hist.select.disabled = false; hist.btnRevert.disabled = false; hist.btnDelete.disabled = false;
  }
  async function onRevert() {
    const id = hist.select?.value;
    if (!id) return;
    try {
      setState('Loading history…');
      const data = await historyGet(id);
      renderResult(data.week, data.matchups);
      setState('Loaded from history');
    } catch (e) { renderError(e); }
  }
  async function onDelete() {
    const id = hist.select?.value;
    if (!id) return;
    if (!confirm('Delete this saved version?')) return;
    try {
      setState('Deleting…');
      await historyDelete(id);
      await refreshHistory();
      setState('Deleted');
    } catch (e) { renderError(e); }
  }

  // ---- drag/drop/paste/file ----
  if (els.drop && els.file) {
    els.drop.addEventListener('click', () => els.file.click());
    ['dragenter','dragover'].forEach(ev => els.drop.addEventListener(ev, e => {
      e.preventDefault(); e.dataTransfer.dropEffect='copy';
    }));
    els.drop.addEventListener('drop', async (e) => {
      e.preventDefault();
      const file = e.dataTransfer.files?.[0];
      if (file) await onFileChosen(file);
    });
    els.file.addEventListener('change', async () => {
      const file = els.file.files?.[0];
      if (file) await onFileChosen(file);
    });
  }
  window.addEventListener('paste', async (e) => {
    const item = Array.from(e.clipboardData?.items || []).find(i => i.type.startsWith('image/'));
    if (!item) return;
    const file = item.getAsFile();
    if (file) await onFileChosen(file, { fromPaste:true });
  });
  async function onFileChosen(file) {
    clearOutputs();
    const fnameWeek = extractWeekFromFilename(file.name);
    if (fnameWeek && els.week) els.week.value = String(fnameWeek);

    const url = await fileToDataUrl(file);
    els.drop.dataset.imageDataUrl = url;
    if (els.thumb) els.thumb.src = url;
    if (els.thumbWrap) els.thumbWrap.style.display = 'block';
  }

  // ---- API call with robust parsing ----
  async function callParse({ imageDataUrl, hintWeek, previousId }) {
    const res = await fetch('/api/parse-matchups', {
      method:'POST',
      headers:{ 'content-type':'application/json' },
      body: JSON.stringify({ imageDataUrl, hintWeek, previousId })
    });
    const raw = await res.text();
    let json; try { json = JSON.parse(raw); } catch { throw new Error(raw); }
    if (!res.ok) throw new Error(json.error || raw || res.statusText);
    return json;
  }
  function finalWeek(json, manual) {
    const fromFile = extractWeekFromFilename(els.file?.files?.[0]?.name || '');
    const fromImage = (json.meta?.weekSource === 'image' && json.meta?.extractedWeek) ? json.meta.extractedWeek : null;
    return fromFile ?? fromImage ?? (manual || null) ?? json.week ?? null;
  }
  function renderResult(week, matchups) {
    if (els.week) els.week.value = week ? String(week) : (els.week.value || '1');
    els.tsvOut.textContent = buildTsv(week, matchups);
    els.jsonOut.textContent = JSON.stringify({ week, matchups }, null, 2);
    enableCopies(true);
  }
  function renderError(err) {
    setState('Error');
    enableCopies(false);
    els.tsvOut.textContent = '';
    els.jsonOut.textContent = JSON.stringify({ error: String(err.message || err) }, null, 2);
  }

  if (els.btnUpload) {
    els.btnUpload.addEventListener('click', async () => {
      const url = els.drop?.dataset.imageDataUrl;
      if (!url) { setState('Please select an image first'); return; }
      const manualWeek = parseInt(els.week?.value || '0', 10) || null;
      const prevId = hist.select?.value && !hist.select.disabled ? hist.select.value : null;

      try {
        setState('Calling API…'); els.btnUpload.disabled = true;
        const json = await callParse({ imageDataUrl: url, hintWeek: manualWeek, previousId: prevId });
        const week = finalWeek(json, manualWeek);
        renderResult(week, json.matchups || []);
        setState('Done');
        await refreshHistory();
      } catch (e) {
        renderError(e);
      } finally {
        els.btnUpload.disabled = false;
      }
    });
  }
  if (els.btnClear) {
    els.btnClear.addEventListener('click', () => {
      if (els.file) els.file.value = '';
      els.drop?.removeAttribute('data-image-data-url');
      if (els.thumbWrap) els.thumbWrap.style.display = 'none';
      clearOutputs();
    });
  }
  els.btnCopyTsv && els.btnCopyTsv.addEventListener('click', () => navigator.clipboard.writeText(els.tsvOut.textContent || ''));
  els.btnCopyJson && els.btnCopyJson.addEventListener('click', () => navigator.clipboard.writeText(els.jsonOut.textContent || ''));

  (async () => {
    clearOutputs();
    injectHistoryUI();
    await refreshHistory();
  })();
})();
