/* public/ui.js */

/* ---------------- DOM refs ---------------- */
const weekInput = document.getElementById('weekInput');
const drop = document.getElementById('drop');
const fileInput = document.getElementById('file');
const btnUpload = document.getElementById('btnUpload');
const btnClear = document.getElementById('btnClear');
const previewImg = document.getElementById('preview');
const previewWrap = document.getElementById('previewWrap');

const statusEl = document.getElementById('status');
const tsvOut = document.getElementById('tsvOut');
const jsonOut = document.getElementById('jsonOut');
const copyJsonBtn = document.getElementById('btnCopyJson');
const copyTsvBtn = document.getElementById('btnCopyTSV');

/* ---------------- State ------------------- */
let imageDataUrl = null;
let filenameWeek = null;
let lastJson = null; // parsed JSON object
let lastTsv = "";    // TSV string

/* ---------------- Utils ------------------- */
function setStatus(msg){ if(statusEl) statusEl.textContent = msg; }
function enableActions(ok){
  if(btnUpload) btnUpload.disabled = !ok || !imageDataUrl;
  if(btnClear) btnClear.disabled = !ok && !imageDataUrl;
  if(copyJsonBtn) copyJsonBtn.disabled = !lastJson;
  if(copyTsvBtn) copyTsvBtn.disabled = !lastTsv;
}
function guessWeekFromFilename(name){
  if(!name) return null;
  const m = name.match(/week\s*(\d+)/i);
  return m ? parseInt(m[1],10) : null;
}
function renderPreview(dataUrl){
  if(!previewImg || !previewWrap) return;
  previewImg.src = dataUrl;
  previewWrap.style.display = 'block';
}
function readBlobAsDataUrl(blob){
  return new Promise((resolve,reject)=>{
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = reject;
    r.readAsDataURL(blob);
  });
}

/** Build TSV:
 *  First line: the week number ONLY
 *  second line: blank
 *  then rows: Home<TAB>Score<TAB>Away<TAB>Score<TAB>Winner<TAB>Diff
 */
function buildTSV(resp){
  const weekLine = String(resp.week ?? "");
  const rows = resp.matchups.map(m => {
    const homeScore = Number(m.homeScore).toFixed(2);
    const awayScore = Number(m.awayScore).toFixed(2);
    const diff = Number(m.diff ?? Math.abs(m.homeScore - m.awayScore)).toFixed(2);
    return [
      m.homeTeam,
      homeScore,
      m.awayTeam,
      awayScore,
      m.winner || (m.homeScore > m.awayScore ? m.homeTeam : (m.awayScore > m.homeScore ? m.awayTeam : "TIE")),
      diff
    ].join('\t');
  });
  return [weekLine, '', ...rows].join('\n');
}

function renderResults(resp){
  lastJson = resp;
  lastTsv = buildTSV(resp);

  if(tsvOut) tsvOut.textContent = lastTsv;
  if(jsonOut) jsonOut.textContent = JSON.stringify(resp, null, 2);

  setStatus('Done');
  enableActions(true);

  if(copyJsonBtn) copyJsonBtn.onclick = () => navigator.clipboard.writeText(JSON.stringify(resp,null,2));
  if(copyTsvBtn)  copyTsvBtn.onclick  = () => navigator.clipboard.writeText(lastTsv);
}

/* ------------ File / Paste handlers ------------ */
async function handleBlob(blob, name=""){
  filenameWeek = guessWeekFromFilename(name);
  if(filenameWeek && weekInput) weekInput.value = String(filenameWeek);

  imageDataUrl = await readBlobAsDataUrl(blob);
  renderPreview(imageDataUrl);
  setStatus('Ready');
  enableActions(true);
}

if(drop){
  drop.addEventListener('dragover', e => { e.preventDefault(); drop.classList.add('dragover'); });
  drop.addEventListener('dragleave', e => { e.preventDefault(); drop.classList.remove('dragover'); });
  drop.addEventListener('drop', async e => {
    e.preventDefault(); drop.classList.remove('dragover');
    const file = e.dataTransfer.files?.[0];
    if(file) await handleBlob(file, file.name);
  });
  drop.addEventListener('click', () => fileInput?.click());
}

if(fileInput){
  fileInput.addEventListener('change', async e => {
    const file = e.target.files?.[0];
    if(file) await handleBlob(file, file.name);
  });
}

document.addEventListener('paste', async e => {
  const items = e.clipboardData?.items || [];
  for(const it of items){
    if(it.kind === 'file'){
      const blob = it.getAsFile();
      if(blob && blob.type.startsWith('image/')){
        await handleBlob(blob, blob.name || '');
        break;
      }
    }
  }
});

/* ---------------- Actions ----------------- */
if(btnClear){
  btnClear.addEventListener('click', () => {
    imageDataUrl = null;
    filenameWeek = null;
    lastJson = null;
    lastTsv = "";
    if(previewWrap) previewWrap.style.display = 'none';
    if(previewImg) previewImg.src = '';
    if(tsvOut) tsvOut.textContent = '';
    if(jsonOut) jsonOut.textContent = '';
    setStatus('Ready');
    enableActions(false);
  });
}

if(btnUpload){
  btnUpload.addEventListener('click', async () => {
    if(!imageDataUrl) return;
    setStatus('Calling API…');
    enableActions(false);

    const selectorWeek = weekInput ? parseInt(weekInput.value||'0',10) || 0 : 0;

    try{
      const res = await fetch('/api/parse-matchups', {
        method: 'POST',
        headers: { 'Content-Type':'application/json' },
        body: JSON.stringify({
          imageDataUrl,
          filenameWeek: filenameWeek ?? null,
          selectorWeek
        })
      });
      const data = await res.json();
      if(!res.ok){
        if(tsvOut) tsvOut.textContent = '';
        if(jsonOut) jsonOut.textContent = JSON.stringify(data,null,2);
        setStatus('Error');
        enableActions(true);
        return;
      }

      // Reflect final week back into the input
      if(typeof data.week !== 'undefined' && weekInput) {
        weekInput.value = String(data.week ?? 0);
      }

      renderResults(data);
    }catch(err){
      if(tsvOut) tsvOut.textContent = '';
      if(jsonOut) jsonOut.textContent = JSON.stringify({ error: String(err) }, null, 2);
      setStatus('Error');
      enableActions(true);
    }
  });
}

/* init */
enableActions(false);
setStatus('Ready');
