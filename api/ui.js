// api/ui.js (CommonJS)
module.exports = (req, res) => {
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.status(200).send(`<!doctype html>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Matchup Parser</title>
<style>
  :root { color-scheme: dark light; }
  body { font-family: system-ui,-apple-system,Segoe UI,Roboto,sans-serif; margin:0; background:#0b0f14; color:#dbe2ea; }
  header { padding:16px 20px; border-bottom:1px solid #1c2633; background:#0e141b; position:sticky; top:0; }
  h1 { margin:0; font-size:18px; }
  main { max-width:980px; margin:22px auto; padding:0 16px 48px; }
  .row { display:grid; grid-template-columns:1fr 1fr; gap:18px; align-items:start; }
  .panel { background:#101823; border:1px solid #1c2633; border-radius:12px; padding:14px; }
  .drop { border:2px dashed #2d3b4f; border-radius:12px; padding:18px; text-align:center; cursor:pointer; display:grid; place-items:center; min-height:240px; transition:120ms border-color ease; }
  .drop.dragover { border-color:#5aa1ff; }
  .muted { opacity:.75; font-size:13px; }
  .actions { display:flex; gap:10px; flex-wrap:wrap; margin-top:12px; }
  button { background:#1a2332; border:1px solid #2b3a52; color:#e6eef8; border-radius:10px; padding:10px 14px; cursor:pointer; font-weight:600; }
  button:disabled { opacity:.5; cursor:not-allowed; }
  input[type=file] { display:none; }
  img.preview { max-width:100%; border-radius:10px; border:1px solid #1c2633; }
  pre { margin:0; white-space:pre-wrap; word-break:break-word; }
  .table { width:100%; border-collapse:collapse; margin-top:10px; }
  .table th,.table td { padding:8px 10px; border-bottom:1px solid #1c2633; text-align:left; }
  .ok { color:#85f0a8; } .bad { color:#ff8f8f; }
</style>

<header><h1>Matchup Parser</h1></header>
<main>
  <div class="row">
    <section class="panel">
      <label id="drop" class="drop">
        <div>
          <div style="font-size:15px;font-weight:700">Drag & drop a screenshot here</div>
          <div class="muted" style="margin-top:6px">…or click to choose a file, or paste (Ctrl/Cmd+V)</div>
        </div>
        <input id="file" type="file" accept="image/*" />
      </label>
      <div class="actions">
        <button id="btnUpload" disabled>Upload & Parse</button>
        <button id="btnClear" disabled>Clear</button>
      </div>
      <div id="previewWrap" style="margin-top:12px; display:none">
        <img id="preview" class="preview" alt="preview"/>
      </div>
    </section>

    <section class="panel">
      <div style="display:flex;justify-content:space-between;align-items:center;gap:10px">
        <div>API response</div>
        <div class="actions" style="margin:0">
          <button id="btnCopyJson" disabled>Copy JSON</button>
          <button id="btnCopyTSV" disabled>Copy TSV</button>
        </div>
      </div>
      <div id="status" class="muted" style="margin:8px 0 12px">Ready</div>
      <pre id="output" style="min-height:220px"></pre>
      <div id="tableWrap" style="margin-top:12px"></div>
    </section>
  </div>
</main>

<script>
  const ENDPOINT = "/api/parse-matchups";

  const q = s => document.querySelector(s);
  const drop = q('#drop'), inpFile = q('#file');
  const btnUpload = q('#btnUpload'), btnClear = q('#btnClear');
  const btnCopyJson = q('#btnCopyJson'), btnCopyTSV = q('#btnCopyTSV');
  const previewWrap = q('#previewWrap'), preview = q('#preview');
  const out = q('#output'), statusEl = q('#status'), tableWrap = q('#tableWrap');

  let currentFile = null;

  function setStatus(t, cls=""){ statusEl.textContent=t; statusEl.className="muted "+cls; }
  function enable(has){ btnUpload.disabled=!has; btnClear.disabled=!has; }
  function reset(){ currentFile=null; inpFile.value=""; previewWrap.style.display="none"; preview.src=""; out.textContent=""; tableWrap.innerHTML=""; setStatus("Ready"); enable(false); btnCopyJson.disabled=true; btnCopyTSV.disabled=true; }
  function loadFile(file){ if(!file) return; currentFile=file; const r=new FileReader(); r.onload=e=>{ preview.src=e.target.result; previewWrap.style.display="block"; }; r.readAsDataURL(file); setStatus("Image selected: "+(file.name||file.type)); enable(true); }

  drop.addEventListener('click',()=>inpFile.click());
  inpFile.addEventListener('change',e=>loadFile(e.target.files[0]));
  ;['dragenter','dragover'].forEach(t=>drop.addEventListener(t,e=>{e.preventDefault(); drop.classList.add('dragover');}));
  ;['dragleave','drop'].forEach(t=>drop.addEventListener(t,e=>{e.preventDefault(); drop.classList.remove('dragover');}));
  drop.addEventListener('drop',e=>{const f=e.dataTransfer.files&&e.dataTransfer.files[0]; loadFile(f);});
  window.addEventListener('paste',e=>{const items=e.clipboardData&&e.clipboardData.items; if(!items) return; for(const it of items){ if(it.kind==='file'){ loadFile(it.getAsFile()); break; }}});
  btnClear.addEventListener('click',reset);

  btnUpload.addEventListener('click', async ()=>{
    if(!currentFile) return;
    setStatus("Uploading…"); out.textContent=""; tableWrap.innerHTML=""; btnCopyJson.disabled=true; btnCopyTSV.disabled=true;
    const fd=new FormData(); fd.append('file', currentFile, currentFile.name||'screenshot.png');
    try{
      const r = await fetch(ENDPOINT, { method:'POST', body: fd });
      const text = await r.text();
      if(!r.ok) throw new Error(text||r.statusText);
      let data; try{ data=JSON.parse(text); }catch{ data={ raw:text }; }
      out.textContent = JSON.stringify(data, null, 2);
      setStatus("Parsed ✓","ok"); btnCopyJson.disabled=false;
      if(data && Array.isArray(data.matchups)){ renderTable(data.matchups); btnCopyTSV.disabled=false; }
    }catch(err){ setStatus("Error: "+(err.message||err),"bad"); out.textContent=String(err); }
  });

  function renderTable(rows){
    const h=['Home','Score','Away','Score','Winner','Diff'];
    const html=['<table class="table"><thead><tr>',...h.map(x=>\`<th>\${x}</th>\`),'</tr></thead><tbody>',
      ...rows.map(r=>\`<tr>
        <td>\${esc(r.homeTeam)}</td><td>\${fmt(r.homeScore)}</td>
        <td>\${esc(r.awayTeam)}</td><td>\${fmt(r.awayScore)}</td>
        <td>\${esc(r.winner)}</td><td>\${fmt(r.diff)}</td>
      </tr>\`),'</tbody></table>'].join('');
    tableWrap.innerHTML=html;
  }
  function fmt(n){ return typeof n==='number' ? n.toFixed(2) : String(n); }
  function esc(s){ return String(s).replace(/[&<>\"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',\"'\":'&#39;'}[c])); }

  btnCopyJson.addEventListener('click', async ()=>{ await navigator.clipboard.writeText(out.textContent); setStatus("JSON copied ✓","ok"); });
  btnCopyTSV.addEventListener('click', async ()=>{
    try{
      const data=JSON.parse(out.textContent||"{}"); const rows=(data&&data.matchups)||[];
      const tsv=[["Home","HomeScore","Away","AwayScore","Winner","Diff"].join('\\t'),
        ...rows.map(r=>[r.homeTeam,fmt(r.homeScore),r.awayTeam,fmt(r.awayScore),r.winner,fmt(r.diff)].join('\\t'))].join('\\n');
      await navigator.clipboard.writeText(tsv); setStatus("TSV copied ✓","ok");
    }catch{ setStatus("Unable to copy TSV","bad"); }
  });
  reset();
</script>`);
};
