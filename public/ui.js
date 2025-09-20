const el = (id) => document.getElementById(id);
const weekInput = el("weekInput");
const fileInput  = el("file");
const drop       = el("drop");
const preview    = el("preview");
const previewWrap= el("previewWrap");
const statusEl   = el("status");
const outputEl   = el("output");
const btnUpload  = el("btnUpload");
const btnClear   = el("btnClear");
const btnCopyJson= el("btnCopyJson");
const btnCopyTSV = el("btnCopyTSV");

let chosenFile = null;

function setStatus(s) { statusEl.textContent = s; }
function showJson(obj) { outputEl.textContent = JSON.stringify(obj, null, 2); }

function enableActions(enabled) {
  btnUpload.disabled  = !enabled;
  btnClear.disabled   = !enabled;
  btnCopyJson.disabled= true;
  btnCopyTSV.disabled = true;
}

function handleFiles(files) {
  if (!files || !files[0]) return;
  chosenFile = files[0];
  const url = URL.createObjectURL(chosenFile);
  preview.src = url;
  previewWrap.style.display = "block";
  enableActions(true);
  setStatus(`Ready (week ${weekInput.value || "?"})`);
}

drop.addEventListener("click", () => fileInput.click());
drop.addEventListener("dragover", (e) => { e.preventDefault(); drop.style.background="#0c1117"; });
drop.addEventListener("dragleave", () => { drop.style.background=""; });
drop.addEventListener("drop", (e) => { e.preventDefault(); drop.style.background=""; handleFiles(e.dataTransfer.files); });
fileInput.addEventListener("change", (e) => handleFiles(e.target.files));
window.addEventListener("paste", (e) => {
  const items = e.clipboardData?.items || [];
  for (const it of items) {
    if (it.type?.startsWith("image/")) handleFiles([it.getAsFile()]);
  }
});

btnClear.addEventListener("click", () => {
  chosenFile = null;
  preview.src = "";
  previewWrap.style.display = "none";
  outputEl.textContent = "";
  setStatus("Cleared");
  enableActions(false);
});

btnUpload.addEventListener("click", async () => {
  if (!chosenFile) return;
  try {
    setStatus("Calling /api/parse-matchups…");
    const reader = new FileReader();
    const base64 = await new Promise((resolve, reject) => {
      reader.onerror = reject;
      reader.onload = () => resolve(reader.result);
      reader.readAsDataURL(chosenFile);
    });

    const resp = await fetch("/api/parse-matchups", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ week: Number(weekInput.value)||null, imageDataUrl: base64 })
    });

    const data = await resp.json();
    showJson(data);
    setStatus(resp.ok ? "Done" : "Error");
    btnCopyJson.disabled = false;
  } catch (err) {
    showJson({ error: String(err) });
    setStatus("Error");
  }
});

btnCopyJson.addEventListener("click", async () => {
  await navigator.clipboard.writeText(outputEl.textContent||"");
  setStatus("JSON copied");
});
btnCopyTSV.addEventListener("click", async () => {
  await navigator.clipboard.writeText("Not wired in this minimal test yet");
  setStatus("TSV copied");
});
