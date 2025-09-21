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
    matchTable: document.getElementById('matchTable'),

    // league tables
    wlTable: document.getElementById('wlTable'),
    wavyTable: document.getElementById('wavyTable'),
    pfTable: document.getElementById('pfTable'),
    summaryTable: document.getElementById('summaryTable'),

    // weeks list
    weeksTbl: document.getElementById('weeksTable'),
  };

  const setState = (t) => els.state && (els.state.textContent = t || '');
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

  // --- current-week TSV builder (unchanged from your earlier behavior)
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

  // --- render current-week match table
  function renderMatchTable(matchups = []) {
    const tbl = els.matchTable;
    if (!tbl) return;

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
  }

  function clearOutputs() {
    if (els.tsvOut) els.tsvOut.textContent = '';
    if (els.jsonOut) els.jsonOut.textContent = '';
    if (els.matchTable) els.matchTable.innerHTML = '';
    setState('Ready');
    enableCopies(false);
  }

  // --- file helpers
  const fileToDataUrl = (file) => new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onerror = reject;
    fr.onload = () => resolve(fr.result);
    fr.readAsDataURL(file);
  });

  // --- choose/paste/drag
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

  // ---------- Weeks list (load previous, show saved stamps) ----------
  function renderWeeksSummary(weeks = []) {
    const weeksTbl = els.weeksTbl;
    if (!weeksTbl) return;
    const body = weeksTbl.querySelector('tbody');
    body.innerHTML = '';

    for (let w = 1; w <= 18; w++) {
      const found = weeks.find(x => Number(x.week) === w);
      const has = !!found;
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${w}</td>
        <td class="${has ? '' : 'dim'}">${has ? '✔ has data' : '—'}</td>
        <td>${has ? (found.savedAtLocal || found.savedAt || '') : ''}</td>
        <td>${has ? `<button data-week="${w}" class="wk-load">Load</button>` : ''}</td>
      `;
      body.appendChild(tr);
    }

    body.querySelectorAll('.wk-load').forEach(btn => {
      btn.addEventListener('click', async () => {
        const w = Number(btn.dataset.week);
        const res = await fetch(`/api/history?week=${w}`);
        const json = await res.json();
        if (!res.ok || !json?.items?.length) return;
        const mostRecent = json.items[0];

        els.week.value = String(w);
        const payload = { week: w, matchups: mostRecent.matchups || [] };
        els.tsvOut.textContent = buildTsv(w, payload.matchups);
        els.jsonOut.textContent = JSON.stringify(payload, null, 2);
        renderMatchTable(payload.matchups);
        enableCopies(true);
        setState('Loaded');
      });
    });
  }

  async function refreshWeeksSummary() {
    try {
      const res = await fetch('/api/history');
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || res.statusText);
      // Keep only the newest per week
      const byWeek = new Map();
      (json.items || []).forEach(item => {
        const w = Number(item.week);
        if (!w) return;
        if (!byWeek.has(w)) byWeek.set(w, item);
      });
      const list = Array.from(byWeek.values()).sort((a,b) => a.week - b.week);
      renderWeeksSummary(list);

      // also (re)build league tables from full history
      renderLeagueTables(json.items || []);
    } catch {
      renderWeeksSummary([]);
      renderLeagueTables([]);
    }
  }

  // ---------- League tables (your 4 views) ----------
  function canonicalTeamName(s){ return (s || '').trim(); }

  function collectTeams(allItems) {
    const set = new Set();
    for (const it of allItems) {
      for (const m of (it.matchups || [])) {
        set.add(canonicalTeamName(m.homeTeam));
        set.add(canonicalTeamName(m.awayTeam));
      }
    }
    return Array.from(set).filter(Boolean).sort();
  }

  function computePerWeek(allItems, teams) {
    // Build per-week maps: scores, winners
    const perWeek = {}; // week -> { scores: Map(team->score), winners:Set(team), losers:Set(team) }
    for (const it of allItems) {
      const w = Number(it.week);
      if (!w) continue;
      perWeek[w] ||= { scores:new Map(), winners:new Set(), losers:new Set() };
      for (const m of (it.matchups || [])) {
        const home = canonicalTeamName(m.homeTeam);
        const away = canonicalTeamName(m.awayTeam);
        perWeek[w].scores.set(home, Number(m.homeScore));
        perWeek[w].scores.set(away, Number(m.awayScore));
        const win = canonicalTeamName(m.winner);
        if (win) {
          if (win.toLowerCase() === home.toLowerCase()) {
            perWeek[w].winners.add(home); perWeek[w].losers.add(away);
          } else if (win.toLowerCase() === away.toLowerCase()) {
            perWeek[w].winners.add(away); perWeek[w].losers.add(home);
          }
        }
      }
      // Fill missing teams with 0 for PF grid
      teams.forEach(t => { if (!perWeek[w].scores.has(t)) perWeek[w].scores.set(t, 0); });
    }
    return perWeek;
  }

  function computeWL(perWeek, teams) {
    // W/L grid and totals
    const WL = { totals: new Map(teams.map(t => [t, 0])), byWeek: {} }; // totals = wins
    for (let w = 1; w <= 18; w++) {
      const row = {};
      if (perWeek[w]) {
        teams.forEach(t => {
          if (perWeek[w].winners.has(t)) { row[t] = 'W'; WL.totals.set(t, WL.totals.get(t)+1); }
          else if (perWeek[w].losers.has(t)) { row[t] = 'L'; }
          else { row[t] = ''; }
        });
      } else {
        teams.forEach(t => row[t] = '');
      }
      WL.byWeek[w] = row;
    }
    return WL;
  }

  function rankArrayDescending(values) {
    // returns map: name->rank (1 = best) with average ranks for ties
    const entries = [...values].sort((a,b) => b[1]-a[1]); // desc by value
    let i=0, out=new Map();
    while (i<entries.length) {
      let j=i, sumPos=0, count=0, rankStart=i+1;
      const val = entries[i][1];
      while (j<entries.length && entries[j][1]===val) { sumPos += (j+1); count++; j++; }
      const avgRank = sumPos/count;
      for (let k=i;k<j;k++) out.set(entries[k][0], avgRank);
      i=j;
    }
    return out;
  }

  function computeWavyPoints(perWeek, teams) {
    // Wavy points: each week, rank teams by PF (higher better) and award 12..1
    // If you have a different scale, tweak `pointsForRank`.
    const scale = teams.length; // 12 teams => 12..1
    const byWeek = {};
    const totals = new Map(teams.map(t => [t, 0]));
    for (let w = 1; w <= 18; w++) {
      const row = {};
      if (perWeek[w]) {
        const pfPairs = teams.map(t => [t, perWeek[w].scores.get(t) || 0]);
        const ranks = rankArrayDescending(pfPairs);
        teams.forEach(t => {
          const r = ranks.get(t) || scale; // 1=best
          const pts = (scale + 1 - r);     // 12->1
          row[t] = pts;
          totals.set(t, totals.get(t) + pts);
        });
      } else {
        teams.forEach(t => row[t] = 0);
      }
      byWeek[w] = row;
    }
    return { byWeek, totals };
  }

  function computePointsForTotals(perWeek, teams) {
    const byWeek = {};
    const totals = new Map(teams.map(t => [t, 0]));
    for (let w = 1; w <= 18; w++) {
      const row = {};
      if (perWeek[w]) {
        teams.forEach(t => {
          const v = Number(perWeek[w].scores.get(t) || 0);
          row[t] = v;
          totals.set(t, totals.get(t) + v);
        });
      } else {
        teams.forEach(t => row[t] = 0);
      }
      byWeek[w] = row;
    }
    return { byWeek, totals };
  }

  function renderMatrixTable(tbl, titleRow, teams, dataByWeek, formatter = (x)=>x) {
    if (!tbl) return;
    const weeks = [...Array(18)].map((_,i)=>i+1);
    tbl.innerHTML = `
      <thead>
        <tr>
          <th class="left">Team</th>
          <th class="right dim">Total</th>
          ${weeks.map(w=>`<th class="center">Week ${w}</th>`).join('')}
        </tr>
      </thead>
      <tbody></tbody>
    `;
    const tbody = tbl.querySelector('tbody');

    // totals
    const totals = new Map(teams.map(t => [t, 0]));
    teams.forEach(t => {
      weeks.forEach(w => {
        const v = dataByWeek[w]?.[t] ?? 0;
        if (typeof v === 'number') totals.set(t, totals.get(t)+v);
      });
    });

    teams.forEach(t => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${t}</td>
        <td class="right mono">${typeof totals.get(t)==='number' ? toFixed(totals.get(t)) : totals.get(t)}</td>
        ${weeks.map(w => `<td class="center mono">${formatter(dataByWeek[w]?.[t] ?? '')}</td>`).join('')}
      `;
      tbody.appendChild(tr);
    });
  }

  function renderSummaryTable(tbl, teams, wlTotals, wavyTotals, pfTotals) {
    if (!tbl) return;

    // “Yahoo rank” = rank by Wins (desc), tiebreak Points For (desc)
    const yahooSorted = [...teams].sort((a,b) => {
      const dw = (wlTotals.get(b)||0) - (wlTotals.get(a)||0);
      if (dw) return dw;
      return (pfTotals.get(b)||0) - (pfTotals.get(a)||0);
    });
    const yahooRank = new Map(yahooSorted.map((t,i)=>[t, i+1]));

    // “Wavy Points rank” (desc totals)
    const wavySorted = [...teams].sort((a,b) => (wavyTotals.get(b)||0) - (wavyTotals.get(a)||0));
    const wavyRank = new Map(wavySorted.map((t,i)=>[t, i+1]));

    // Hybrid = average
    const hybrid = new Map(
      teams.map(t => [
        t,
        ((yahooRank.get(t) || 0) + (wavyRank.get(t) || 0)) / 2,
      ])
    );
    
    // Sort by hybrid rank (asc). Break ties with Points For (desc).
    const order = [...teams].sort((a, b) => {
      const diff = hybrid.get(a) - hybrid.get(b);
      if (Math.abs(diff) > 1e-9) return diff; // not tied
      return (pfTotals.get(b) || 0) - (pfTotals.get(a) || 0);
    });


    tbl.innerHTML = `
      <thead>
        <tr>
          <th>Place</th><th>Team</th>
          <th class="right">Hybrid Rank</th>
          <th class="right">Yahoo Rank</th>
          <th class="right">Wavy Points Rank</th>
          <th class="right">Wavy Points</th>
          <th class="right">Points For</th>
        </tr>
      </thead>
      <tbody></tbody>
    `;
    const tbody = tbl.querySelector('tbody');

    function ordinal(n){ return n + (['th','st','nd','rd'][(n%100>>3^1&&n%10)||0]||'th'); }

    order.forEach((t,idx) => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${ordinal(idx+1)}</td>
        <td>${t}</td>
        <td class="right mono">${toFixed(hybrid.get(t))}</td>
        <td class="right mono">${yahooRank.get(t)}</td>
        <td class="right mono">${wavyRank.get(t)}</td>
        <td class="right mono">${toFixed(wavyTotals.get(t)||0)}</td>
        <td class="right mono">${toFixed(pfTotals.get(t)||0)}</td>
      `;
      tbody.appendChild(tr);
    });
  }

  function renderLeagueTables(allItems) {
    const teams = collectTeams(allItems);
    const perWeek = computePerWeek(allItems, teams);
    const WL = computeWL(perWeek, teams);
    const wavy = computeWavyPoints(perWeek, teams);
    const pf = computePointsForTotals(perWeek, teams);

    // W-L table: totals are wins; weekly cells show “W/L/blank”
    const wlByWeek = {};
    for (let w=1; w<=18; w++) wlByWeek[w] = WL.byWeek[w];

    renderMatrixTable(els.wlTable, 'W-L', teams, wlByWeek, (v)=>v||'');
    renderMatrixTable(els.wavyTable, 'Wavy', teams, wavy.byWeek, (v)=>v?toFixed(v):'');
    renderMatrixTable(els.pfTable, 'PointsFor', teams, pf.byWeek, (v)=>v?toFixed(v):'');

    renderSummaryTable(els.summaryTable, teams, WL.totals, wavy.totals, pf.totals);
  }

  // ---------- Upload & Parse ----------
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

        // set week from server if it guessed from filename/vision
        const week = data.week ?? hintWeek ?? null;
        if (els.week && week != null) els.week.value = String(week);

        // Current-week outputs
        els.tsvOut.textContent = buildTsv(week, data.matchups || []);
        els.jsonOut.textContent = JSON.stringify({ week, matchups: data.matchups || [] }, null, 2);
        renderMatchTable(data.matchups || []);
        enableCopies(true);
        setState('Done');

        // refresh history + league tables (the API saved this already)
        await refreshWeeksSummary();
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

  // initial
  refreshWeeksSummary();
})();
