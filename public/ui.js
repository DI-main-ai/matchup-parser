// /public/ui.js
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
    tableWrap: document.getElementById('tableWrap'),
    matchTable: document.getElementById('matchTable'),
  };

  const setState = (txt) => els.state && (els.state.textContent = txt || '');
  const copy = (text) => { try { navigator.clipboard.writeText(text); } catch {} };
  const enableCopies = (on) => {
    if (els.btnCopyTsv) els.btnCopyTsv.disabled = !on;
    if (els.btnCopyJson) els.btnCopyJson.disabled = !on;
  };

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

  const renderTable = (matchups = []) => {
    const tbl = els.matchTable;
    if (!tbl) return;

    // header
    tbl.innerHTML = `
      <thead>
        <tr>
          <th>Home</th><th class="score">Score</th>
          <th></th>
          <th>Away</th><th class="score">Score</th>
          <th>Winner</th><th class="score">Diff</th>
        </tr>
      </thead>
      <tbody></tbody>
    `;
    const tbody = tbl.querySelector('tbody');

    matchups.forEach(m => {
      const w = (m.winner || '').trim();
      const homeWin = w && w.toLowerCase() === (m.homeTeam || '').toLowerCase();
      const awayWin = w && w.toLowerCase() === (m.awayTeam || '').toLowerCase();

      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td ${homeWin ? 'class="winner"' : ''}>${m.homeTeam ?? ''}</td>
        <td class="score">${toFixed(m.homeScore)}</td>
        <td class="score" style="color:#72839a">vs</td>
        <td ${awayWin ? 'class="winner"' : ''}>${m.awayTeam ?? ''}</td>
        <td class="score">${toFixed(m.awayScore)}</td>
        <td ${w ? 'class="winner"' : ''}>${w || ''}</td>
        <td class="score">${toFixed(m.diff)}</td>
      `;
      tbody.appendChild(tr);
    });
  };

  const clearOutputs = () => {
    if (els.tsvOut) els.tsvOut.textContent = '';
    if (els.jsonOut) els.jsonOut.textContent = '';
    if (els.matchTable) els.matchTable.innerHTML = '';
    setState('Ready');
    enableCopies(false);
  };

  const fileToDataUrl = (file) => new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onerror = reject;
    fr.onload = () => resolve(fr.result);
    fr.readAsDataURL(file);
  });

  // UI: choose/paste/drag
  if (els.drop && els.file) {
    els.drop.addEventListener('click', () => els.file.click());
    ['dragenter','dragover'].forEach(ev => els.drop.addEventListener(ev, e => {
      e.preventDefault(); e.dataTransfer.dropEffect = 'copy';
    }));
    els.drop.addEventListener('drop', async (e) => {
      e.preventDefault();
      const f = e.dataTransfer.files?.[0];
      if (f) await onFile(f);
    });
    els.file.addEventListener('change', async () => {
      const f = els.file.files?.[0];
      if (f) await onFile(f);
    });
  }
  window.addEventListener('paste', async (e) => {
    const item = Array.from(e.clipboardData?.items || []).find(i => i.type.startsWith('image/'));
    if (!item) return;
    const file = item.getAsFile();
    if (file) await onFile(file);
  });

  async function onFile(file) {
    clearOutputs();
    const url = await fileToDataUrl(file);
    els.drop.dataset.imageDataUrl = url;
    if (els.thumb) els.thumb.src = url;
    if (els.thumbWrap) els.thumbWrap.style.display = 'block';
    if (els.btnUpload) els.btnUpload.disabled = false;
    if (els.btnClear) els.btnClear.disabled = false;
  }

  if (els.btnClear) {
    els.btnClear.addEventListener('click', () => {
      if (els.file) els.file.value = '';
      els.drop?.removeAttribute('data-image-data-url');
      if (els.thumbWrap) els.thumbWrap.style.display = 'none';
      clearOutputs();
      if (els.btnUpload) els.btnUpload.disabled = true;
      els.week.value = els.week.value || '1';
    });
  }

  if (els.btnUpload) {
    els.btnUpload.addEventListener('click', async () => {
      const img = els.drop?.dataset.imageDataUrl;
      if (!img) { setState('Please choose/paste an image'); return; }
      const hintWeek = parseInt(els.week?.value || '0', 10) || null;

      try {
        setState('Calling API…');
        els.btnUpload.disabled = true;

        const resp = await fetch('/api/parse-matchups', {
          method: 'POST',
          headers: { 'content-type':'application/json' },
          body: JSON.stringify({ imageDataUrl: img, hintWeek }),
        });
        const data = await resp.json().catch(() => ({}));

        if (!resp.ok) {
          setState('Error');
          els.tsvOut.textContent = '';
          els.jsonOut.textContent = JSON.stringify(data, null, 2);
          enableCopies(false);
          return;
        }

        const week = data.week ?? hintWeek ?? null;
        if (els.week && week != null) els.week.value = String(week);

        // TSV + JSON + TABLE
        els.tsvOut.textContent = buildTsv(week, data.matchups || []);
        els.jsonOut.textContent = JSON.stringify({ week, matchups: data.matchups || [] }, null, 2);
        renderTable(data.matchups || []);

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
