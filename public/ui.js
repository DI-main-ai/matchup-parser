/* ui.js — robust UI (null-safe), TSV format exact, week detection hierarchy */

(() => {
  // DOM
  const weekInput   = document.getElementById("weekInput");
  const fileInput   = document.getElementById("file");
  const dropZone    = document.getElementById("drop");
  const previewWrap = document.getElementById("previewWrap");
  const previewImg  = document.getElementById("preview");

  const btnUpload   = document.getElementById("btnUpload");
  const btnClear    = document.getElementById("btnClear");

  const tsvOut      = document.getElementById("tsvOut");
  const jsonOut     = document.getElementById("jsonOut");
  const btnCopyTSV  = document.getElementById("btnCopyTSV");
  const btnCopyJSON = document.getElementById("btnCopyJSON");

  const statusEl    = document.getElementById("status");

  // State
  let imageDataUrl = null;

  // Utils
  const fmt2 = (n) => Number(n).toFixed(2);
  const setStatus = (s) => { if (statusEl) statusEl.textContent = s; };
  const setDisabled = (el, v) => { if (el) el.disabled = !!v; };

  function showPreview(src) {
    if (!previewWrap || !previewImg) return;
    if (!src) { previewWrap.style.display = "none"; return; }
    previewImg.src = src;
    previewWrap.style.display = "block";
  }

  // filename → week number (e.g. "Week 3.png")
  function maybeWeekFromFilename(file) {
    if (!file || !file.name) return null;
    const m = /week\s*(\d{1,2})/i.exec(file.name);
    return m ? Number(m[1]) : null;
  }

  // Build TSV locally if API doesn't send `tsv`
  function buildTSV(payload) {
    const w = payload?.week ?? "";
    const rows = (payload?.matchups ?? []).map(m =>
      [
        m.homeTeam,
        fmt2(m.homeScore),
        m.awayTeam,
        fmt2(m.awayScore),
        m.winner,
        fmt2(m.diff)
      ].join("\t")
    );
    return `${w}\n\n${rows.join("\n")}`;
  }

  async function copy(text) {
    try { await navigator.clipboard.writeText(text); } catch {}
  }

  function readFileToDataURL(file) {
    return new Promise((resolve, reject) => {
      const fr = new FileReader();
      fr.onload = () => resolve(fr.result);
      fr.onerror = reject;
      fr.readAsDataURL(file);
    });
  }

  async function acceptFile(file) {
    if (!file) return;
    const w = maybeWeekFromFilename(file);
    if (w && weekInput) weekInput.value = String(w); // priority 1: filename

    imageDataUrl = await readFileToDataURL(file);
    showPreview(imageDataUrl);
    setDisabled(btnUpload, false);
    setDisabled(btnClear, false);
  }

  // Drag & drop
  if (dropZone) {
    dropZone.addEventListener("dragover", (e) => {
      e.preventDefault();
      dropZone.classList.add("drag");
    });
    dropZone.addEventListener("dragleave", () => dropZone.classList.remove("drag"));
    dropZone.addEventListener("drop", async (e) => {
      e.preventDefault();
      dropZone.classList.remove("drag");
      const f = e.dataTransfer?.files?.[0];
      if (f) acceptFile(f);
    });
  }

  // Choose
  if (fileInput) {
    fileInput.addEventListener("change", async (e) => {
      const f = e.target.files?.[0];
      if (f) acceptFile(f);
    });
  }

  // Paste screenshot
  window.addEventListener("paste", async (e) => {
    const item = [...(e.clipboardData?.items || [])].find(i => i.type?.startsWith("image/"));
    if (!item) return;
    const file = item.getAsFile();
    if (file) acceptFile(file);
  });

  // Upload & parse
  if (btnUpload) {
    btnUpload.addEventListener("click", async () => {
      if (!imageDataUrl) return;
      setDisabled(btnUpload, true);
      setStatus("Calling API...");

      const week = Number(weekInput?.value || 0) || 0; // priority 3 (fallback) – API may override if OCR finds week

      try {
        const res = await fetch("/api/parse-matchups", {
          method: "POST",
          headers: {"content-type":"application/json"},
          body: JSON.stringify({ week, imageDataUrl })
        });

        const data = await res.json();

        // If API inferred a week (priority 2), reflect it in the selector.
        if (typeof data.week === "number" && weekInput) {
          weekInput.value = String(data.week);
        }

        const tsv = data.tsv || buildTSV(data);
        if (tsvOut) tsvOut.textContent = tsv;

        if (jsonOut) jsonOut.textContent = JSON.stringify(
          { week: data.week, matchups: data.matchups },
          null, 2
        );

        setStatus("Done");
        setDisabled(btnCopyTSV, false);
        setDisabled(btnCopyJSON, false);
      } catch (err) {
        if (tsvOut)  tsvOut.textContent = "";
        if (jsonOut) jsonOut.textContent = JSON.stringify({ error: String(err) }, null, 2);
        setStatus("Error");
      } finally {
        setDisabled(btnUpload, false);
      }
    });
  }

  if (btnClear) {
    btnClear.addEventListener("click", () => {
      imageDataUrl = null;
      showPreview(null);
      if (tsvOut)  tsvOut.textContent = "";
      if (jsonOut) jsonOut.textContent = "";
      setStatus("Ready");
      setDisabled(btnUpload, true);
      setDisabled(btnClear, true);
      setDisabled(btnCopyTSV, true);
      setDisabled(btnCopyJSON, true);
    });
  }

  if (btnCopyTSV)  btnCopyTSV.addEventListener("click", () => copy(tsvOut?.textContent || ""));
  if (btnCopyJSON) btnCopyJSON.addEventListener("click", () => copy(jsonOut?.textContent || ""));

  // Init
  setStatus("Ready");
  setDisabled(btnUpload, true);
  setDisabled(btnClear, true);
  setDisabled(btnCopyTSV, true);
  setDisabled(btnCopyJSON, true);
})();
