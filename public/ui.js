// /public/ui.js
// Minimal, robust client. No reliance on raw.length, shows debug when available.

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
  };

  const setState = (txt) => els.state && (els.state.textContent = txt || '');
  const copy = (text) => { try { navigator.clipboard.writeText(text); } catch {} };
  const toFixed = (n) => {
    if (typeof n === 'number') return n.toFixed(2);
    if (n == null) return '';
    const f = parseFloat(String(n).replace(/[^\d.-]/g, ''));
    return Number.isFinite(f) ? f.toFixed(2) : String(n);
  };
  const buildTsv = (week, matchups = []) => {
    const lines = [];
    lines.push(String(week ?? ''));
    lines.push('');
    for (const m of matchups) {
      lines.push(`${m.homeTeam}\t${toFixed(m.homeScore)}`);
      lines.push(`${m.awayTeam}\t${toFixed(m.awayScore)}`);
      lines.push('');
    }
    return lines.join('\n').trimEnd();
  };
  const enableCopies = (on) => {
    if (els.btnCopyTsv) els.btnCopyTsv.disabled = !on;
    if (els.btnCopyJson) els.btnCopyJson.disabled = !on;
  };
  const clearOutputs = () => {
    if (els.tsvOut) els.tsvOut.textContent = '';
    if (els.jsonOut) els.jsonOut.textContent = '';
    setState('Ready');
    enableCopies(false);
  };
  const fileToDataUrl = (file) => new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onerror = reject;
    fr.onload = () => resolve(fr.result);
    fr.readAsDataURL(file);
  });

  // drag & drop + file choose
  if (els.drop && els.file) {
    els.drop.addEventListener('click', () => els.file.click());
    ['dragenter', 'dragover'].forEach(ev => els.drop.addEventListener(ev, e => {
      e.preventDefault(); e.dataTransfer.dropEffect = 'copy';
    }));
    els.drop.addEventListener('drop', async (e) => {
      e.preventDefault();
      const f = e.dataTransfer.files?.[0];
      if (f) await onFileChosen(f);
    });
    els.file.addEventListener('change', async () => {
      const f = els.file.files?.[0];
      if (f) await onFileChosen(f);
    });
  }

  // paste-from-clipboard
  window.addEventListener('paste', async (e) => {
    const item = Array.from(e.clipboardData?.items || []).find(i => i.type.startsWith('image/'));
    if (!item) return;
    const file = item.getAsFile();
    if (file) await onFileChosen(file);
  });

  async function onFileChosen(file) {
    clearOutputs();
    const url = await fileToDataUrl(file);
    els.drop.dataset.imageDataUrl = url;
    if (els.thumb) els.thumb.src = url;
    if (els.thumbWrap) els.thumbWrap.style.display = 'block';
  }

  if (els.btnClear) {
    els.btnClear.addEventListener('click', () => {
      if (els.file) els.file.value = '';
      if (els.thumbWrap) els.thumbWrap.style.display = 'none';
      els.drop?.removeAttribute('data-image-data-url');
      clearOutputs();
    });
  }

  if (els.btnUpload) {
    els.btnUpload.addEventListener('click', async () => {
      try {
        const dataUrl = els.drop?.dataset.imageDataUrl;
        if (!dataUrl) { setState('Please choose/paste an image'); return; }

        const weekManual = parseInt(els.week?.value || '0', 10) || null;
        setState('Calling API…');
        els.btnUpload.disabled = true;

        const res = await fetch('/api/parse-matchups', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ imageDataUrl: dataUrl, hintWeek: weekManual }),
        });

        const payload = await res.json().catch(() => ({}));

        if (!res.ok) {
          setState('Error');
          els.tsvOut.textContent = '';
          els.jsonOut.textContent = JSON.stringify(payload, null, 2);
          enableCopies(false);
          return;
        }

        const finalWeek = payload.week ?? weekManual ?? null;
        if (els.week && finalWeek != null) els.week.value = String(finalWeek);

        els.tsvOut.textContent = buildTsv(finalWeek, payload.matchups || []);
        els.jsonOut.textContent = JSON.stringify({ week: finalWeek, matchups: payload.matchups || [] }, null, 2);

        setState('Done');
        enableCopies(true);
      } catch (err) {
        setState('Error');
        els.tsvOut.textContent = '';
        els.jsonOut.textContent = JSON.stringify({ error: String(err?.message || err) }, null, 2);
        enableCopies(false);
      } finally {
        els.btnUpload.disabled = false;
      }
    });
  }

  if (els.btnCopyTsv) els.btnCopyTsv.addEventListener('click', () => copy(els.tsvOut.textContent));
  if (els.btnCopyJson) els.btnCopyJson.addEventListener('click', () => copy(els.jsonOut.textContent));
})();
