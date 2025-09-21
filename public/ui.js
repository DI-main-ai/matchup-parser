/* public/ui.js */
(() => {
  const els = {
    week: document.getElementById('week'),
    drop: document.getElementById('drop'),
    file: document.getElementById('file'),
    btnUpload: document.getElementById('btnUpload'),
    btnClear: document.getElementById('btnClear'),
    hint: document.getElementById('hint'),
    thumbWrap: document.getElementById('thumbWrap'),
    thumb: document.getElementById('thumb'),
    state: document.getElementById('state'),
    tsvOut: document.getElementById('tsvOut'),
    jsonOut: document.getElementById('jsonOut'),
    btnCopyTsv: document.getElementById('btnCopyTsv'),
    btnCopyJson: document.getElementById('btnCopyJson'),
  };

  // ---- helpers ----
  const setState = (txt) => els.state && (els.state.textContent = txt);
  const enable = (bool) => {
    [els.btnUpload, els.btnClear, els.btnCopyTsv, els.btnCopyJson].forEach(b => {
      if (!b) return;
      b.disabled = !bool;
    });
  };
  const clearOutputs = () => {
    if (els.tsvOut) els.tsvOut.textContent = '';
    if (els.jsonOut) els.jsonOut.textContent = '';
    setState('Ready');
    if (els.btnCopyTsv) els.btnCopyTsv.disabled = true;
    if (els.btnCopyJson) els.btnCopyJson.disabled = true;
  };
  const toFixed = (n) => {
    if (typeof n === 'number') return n.toFixed(2);
    if (!n) return '';
    const f = parseFloat(String(n).replace(/[^\d.-]/g, ''));
    return isFinite(f) ? f.toFixed(2) : String(n);
  };
  function buildTsv(week, matchups) {
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

  // ---- UI wiring ----
  if (els.drop && els.file) {
    els.drop.addEventListener('click', () => els.file.click());
    ['dragenter','dragover'].forEach(ev => els.drop.addEventListener(ev, e => { e.preventDefault(); e.dataTransfer.dropEffect='copy'; }));
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

  // enable paste-from-clipboard
  window.addEventListener('paste', async (e) => {
    const item = Array.from(e.clipboardData?.items || []).find(i => i.type.startsWith('image/'));
    if (!item) return;
    const file = item.getAsFile();
    if (file) await onFileChosen(file, { fromPaste: true });
  });

  async function onFileChosen(file, opts = {}) {
    clearOutputs();
    enable(true);
    const fnameWeek = extractWeekFromFilename(file.name);
    if (fnameWeek) {
      els.week.value = String(fnameWeek);
      if (els.hint) els.hint.textContent = `Week picked from filename: ${fnameWeek}`;
    } else if (els.hint) {
      els.hint.textContent = opts.fromPaste ? 'Image pasted from clipboard' : `File: ${file.name}`;
    }
    // preview
    const url = await fileToDataUrl(file);
    if (els.thumb) { els.thumb.src = url; }
    if (els.thumbWrap) els.thumbWrap.style.display = 'block';
    // stash for upload
    els.drop.dataset.imageDataUrl = url;
  }

  if (els.btnClear) {
    els.btnClear.addEventListener('click', () => {
      if (els.file) els.file.value = '';
      if (els.thumbWrap) els.thumbWrap.style.display = 'none';
      els.drop?.removeAttribute('data-image-data-url');
      clearOutputs();
      enable(false);
    });
  }

  if (els.btnUpload) {
    els.btnUpload.addEventListener('click', async () => {
      const dataUrl = els.drop?.dataset.imageDataUrl;
      if (!dataUrl) {
        setState('Please select an image first');
        return;
      }
      const weekManual = parseInt(els.week?.value || '0', 10) || null;

      setState('Calling API…');
      if (els.btnUpload) els.btnUpload.disabled = true;

      try {
        const body = { imageDataUrl: dataUrl, hintWeek: weekManual };
        const res = await fetch('/api/parse-matchups', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(body)
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || res.statusText);

        // Decide final week: filename > image-extracted > manual > (server week)
        const weekFromFile = extractWeekFromFilename(els.file?.files?.[0]?.name || '');
        const extracted = json.meta?.extractedWeek && json.meta?.weekSource === 'image' ? json.meta.extractedWeek : null;
        const finalWeek = weekFromFile ?? extracted ?? weekManual ?? json.week ?? null;

        if (els.week) els.week.value = finalWeek ? String(finalWeek) : (els.week.value || '1');

        // Build TSV exactly like your spec
        const matchups = json.matchups || [];
        const tsv = buildTsv(finalWeek, matchups);

        els.tsvOut.textContent = tsv;
        els.jsonOut.textContent = JSON.stringify({ week: finalWeek, matchups }, null, 2);

        setState('Done');
        if (els.btnCopyTsv) els.btnCopyTsv.disabled = false;
        if (els.btnCopyJson) els.btnCopyJson.disabled = false;
      } catch (err) {
        setState('Error');
        els.tsvOut.textContent = '';
        els.jsonOut.textContent = JSON.stringify({ error: String(err.message || err) }, null, 2);
      } finally {
        if (els.btnUpload) els.btnUpload.disabled = false;
      }
    });
  }

  if (els.btnCopyTsv) els.btnCopyTsv.addEventListener('click', () => copy(els.tsvOut.textContent));
  if (els.btnCopyJson) els.btnCopyJson.addEventListener('click', () => copy(els.jsonOut.textContent));
})();
