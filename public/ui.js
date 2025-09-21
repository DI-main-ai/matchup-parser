/* public/ui.js */
(() => {
  // ---------- element handles ----------
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
  };

  // ---------- inject history UI (no index.html change needed) ----------
  let hist = {
    wrap: null,
    select: null,
    btnRevert: null,
    btnDelete: null,
  };

  function ensureHistoryUI() {
    if (hist.wrap) return;
    // Find a good place – near the copy buttons, or under the "API response" area.
    const anchor =
      (els.btnCopyJson && els.btnCopyJson.parentElement) ||
      (els.btnCopyTsv && els.btnCopyTsv.parentElement) ||
      document.querySelector('#apiResponseHeader') ||
      (els.tsvOut && els.tsvOut.parentElement) ||
      document.body;

    hist.wrap = document.createElement('div');
    hist.wrap.style.display = 'flex';
    hist.wrap.style.gap = '8px';
    hist.wrap.style.alignItems = 'center';
    hist.wrap.style.flexWrap = 'wrap';
    hist.wrap.style.margin = '8px 0';

    const label = document.createElement('span');
    label.textContent = 'History:';
    label.style.opacity = '0.8';

    hist.select = document.createElement('select');
    hist.select.id = 'historySelect';
    hist.select.style.minWidth = '280px';
    hist.select.disabled = true;

    hist.btnRevert = document.createElement('button');
    hist.btnRevert.textContent = 'Revert';
    hist.btnRevert.disabled = true;

    hist.btnDelete = document.createElement('button');
    hist.btnDelete.textContent = 'Delete';
    hist.btnDelete.disabled = true;

    hist.wrap.appendChild(label);
    hist.wrap.appendChild(hist.select);
    hist.wrap.appendChild(hist.btnRevert);
    hist.wrap.appendChild(hist.btnDelete);

    // Insert just before the TSV output if we can
    if (els.tsvOut && els.tsvOut.parentElement) {
      els.tsvOut.parentElement.insertBefore(hist.wrap, els.tsvOut);
    } else {
      anchor.appendChild(hist.wrap);
    }

    // Wire up events
    hist.select.addEventListener('change', onHistorySelect);
    hist.btnRevert.addEventListener('click', onHistoryRevert);
    hist.btnDelete.addEventListener('click', onHistoryDelete);
  }

  // ---------- small helpers ----------
  const setState = (txt) => els.state && (els.state.textContent = txt || '');
  const enablePostActions = (yes) => {
    [els.btnCopyTsv, els.btnCopyJson].forEach(b => b && (b.disabled = !yes));
  };
  const resetOutputs = () => {
    if (els.tsvOut) els.tsvOut.textContent = '';
    if (els.jsonOut) els.jsonOut.textContent = '';
    setState('Ready');
    enablePostActions(false);
  };
  const toFixed = (n) => {
    if (typeof n === 'number') return n.toFixed(2);
    if (!n) return '';
    const f = parseFloat(String(n).replace(/[^\d.-]/g, ''));
    return isFinite(f) ? f.toFixed(2) : String(n);
  };

  function buildTsv(week, matchups) {
    // Your requested TSV: week number alone, a blank line, then pairs of lines
    // teamName\tScore  (blank line between matchups)
    const lines = [];
    lines.push(String(week ?? ''));
    lines.push('');
    for (const m of matchups) {
      lines.push(`${m.homeTeam}\t${toFixed(m.homeScore)}`);
      lines.push(`${m.awayTeam}\t${toFixed(m.awayScore)}`);
      lines.push('');
    }
    return lines.join('\n').trimEnd();
  }

  function copy(text) {
    try { navigator.clipboard.writeText(text); } catch {}
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

  // ---------- history API helpers ----------
  async function historyList() {
    try {
      const res = await fetch('/api/history/list');
      if (!res.ok) throw new Error(await res.text());
      return await res.json(); // { items: [{id, week, createdAt, label}] }
    } catch (e) {
      console.warn('history/list error', e);
      return { items: [] };
    }
  }
  async function historyGet(id) {
    const res = await fetch(`/api/history/get?id=${encodeURIComponent(id)}`);
    if (!res.ok) throw new Error(await res.text());
    return await res.json(); // { week, matchups }
  }
  async function historyUse(id) {
    const res = await fetch(`/api/history/use?id=${encodeURIComponent(id)}`, { method: 'POST' });
    if (!res.ok) throw new Error(await res.text());
    return await res.json();
  }
  async function historyDelete(id) {
    const res = await fetch(`/api/history/delete?id=${encodeURIComponent(id)}`, { method: 'POST' });
    if (!res.ok) throw new Error(await res.text());
    return await res.json();
  }

  // Populate the select with Central-time labels
  async function refreshHistory() {
    ensureHistoryUI();
    hist.select.innerHTML = '';
    hist.select.disabled = true;
    hist.btnRevert.disabled = true;
    hist.btnDelete.disabled = true;

    const { items } = await historyList();
    if (!items || items.length === 0) {
      const opt = document.createElement('option');
      opt.textContent = 'No history yet';
      opt.disabled = true;
      opt.selected = true;
      hist.select.appendChild(opt);
      return;
    }

    // newest first
    for (const it of items) {
      const opt = document.createElement('option');
      opt.value = it.id;
      // Label example: "W2 • 09/21 07:13 PM CT"
      opt.textContent = it.label || `W${it.week} • ${toCentralTime(it.createdAt)}`;
      hist.select.appendChild(opt);
    }
    hist.select.disabled = false;
    hist.btnRevert.disabled = false;
    hist.btnDelete.disabled = false;
  }

  function toCentralTime(ts) {
    try {
      const d = new Date(ts);
      const z = 'America/Chicago';
      const fmt = new Intl.DateTimeFormat('en-US', {
        timeZone: z, month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit',
        hour12: true,
      });
      return fmt.format(d).replace(',', '');
    } catch {
      return ts;
    }
  }

  async function onHistorySelect() {
    // nothing on change by default; we only load on Revert
  }
  async function onHistoryRevert() {
    const id = hist.select?.value;
    if (!id) return;
    try {
      setState('Loading history…');
      const data = await historyGet(id);
      showResults(data.week, data.matchups);
      setState('Loaded from history');
    } catch (e) {
      showError(e);
    }
  }
  async function onHistoryDelete() {
    const id = hist.select?.value;
    if (!id) return;
    if (!confirm('Delete this saved version?')) return;
    try {
      setState('Deleting…');
      await historyDelete(id);
      await refreshHistory();
      setState('Deleted');
    } catch (e) {
      showError(e);
    }
  }

  // ---------- UI wiring for upload / paste / drag ----------
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
    if (file) await onFileChosen(file, { fromPaste: true });
  });

  async function onFileChosen(file, opts = {}) {
    resetOutputs();

    // try week from filename
    const fnameWeek = extractWeekFromFilename(file.name);
    if (fnameWeek && els.week) els.week.value = String(fnameWeek);

    // preview
    const url = await fileToDataUrl(file);
    if (els.thumb) els.thumb.src = url;
    if (els.thumbWrap) els.thumbWrap.style.display = 'block';
    // stash for upload
    els.drop.dataset.imageDataUrl = url;
  }

  if (els.btnClear) {
    els.btnClear.addEventListener('click', () => {
      if (els.file) els.file.value = '';
      if (els.thumbWrap) els.thumbWrap.style.display = 'none';
      els.drop?.removeAttribute('data-image-data-url');
      resetOutputs();
    });
  }

  async function callParseApi({ imageDataUrl, hintWeek, previousId }) {
    const res = await fetch('/api/parse-matchups', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ imageDataUrl, hintWeek, previousId })
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || res.statusText);
    return json; // { week, matchups, meta }
  }

  function finalWeekFrom(json, manualWeek) {
    const fromFile = extractWeekFromFilename(els.file?.files?.[0]?.name || '');
    const fromImage = (json.meta?.weekSource === 'image' && json.meta?.extractedWeek) ? json.meta.extractedWeek : null;
    return fromFile ?? fromImage ?? (manualWeek || null) ?? json.week ?? null;
  }

  function showResults(week, matchups) {
    // update controls
    if (els.week) els.week.value = week ? String(week) : (els.week.value || '1');

    const tsv = buildTsv(week, matchups);
    els.tsvOut && (els.tsvOut.textContent = tsv);
    els.jsonOut && (els.jsonOut.textContent = JSON.stringify({ week, matchups }, null, 2));
    enablePostActions(true);
  }

  function showError(err) {
    setState('Error');
    enablePostActions(false);
    els.tsvOut && (els.tsvOut.textContent = '');
    els.jsonOut && (els.jsonOut.textContent = JSON.stringify({ error: String(err.message || err) }, null, 2));
  }

  if (els.btnUpload) {
    els.btnUpload.addEventListener('click', async () => {
      const dataUrl = els.drop?.dataset.imageDataUrl;
      if (!dataUrl) {
        setState('Please select an image first');
        return;
      }

      // If a history entry is currently selected, we propagate it so the server
      // can treat the new submission as "derived from" that previous table.
      const previousId = hist.select?.value && !hist.select.disabled ? hist.select.value : null;
      const manualWeek = parseInt(els.week?.value || '0', 10) || null;

      try {
        setState('Calling API…');
        els.btnUpload.disabled = true;

        const json = await callParseApi({ imageDataUrl: dataUrl, hintWeek: manualWeek, previousId });
        const week = finalWeekFrom(json, manualWeek);
        showResults(week, json.matchups || []);
        setState('Done');

        // Refresh history list so the newly saved version appears at the top
        await refreshHistory();
      } catch (e) {
        showError(e);
      } finally {
        els.btnUpload.disabled = false;
      }
    });
  }

  // Copy buttons
  els.btnCopyTsv && els.btnCopyTsv.addEventListener('click', () => copy(els.tsvOut?.textContent || ''));
  els.btnCopyJson && els.btnCopyJson.addEventListener('click', () => copy(els.jsonOut?.textContent || ''));

  // Initial boot
  (async function boot() {
    ensureHistoryUI();
    resetOutputs();
    await refreshHistory();
  })();
})();
