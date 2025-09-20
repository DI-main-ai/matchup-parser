/* ui.js — renders TSV and JSON exactly as requested */

(() => {
  // --- DOM -------------
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

  // --- state -----------
  let imageDataUrl = null;

  // --- helpers ---------
  const fmt2 = (n) => Number(n).toFixed(2); // keep trailing zeros (e.g., 0.70)
  const enable = (el, on = true) => { el.disabled = !on; };

  function setStatus(s) { statusEl.textContent = s; }

  function showPreview(src) {
    if (!src) { previewWrap.style.display = "none"; return; }
    previewImg.src = src;
    previewWrap.style.display = "block";
  }

  // Try to pull week from filename like "Week 3.png"
  function maybeWeekFromFilename(file) {
    if (!file || !file.name) return null;
    const m = /week\s*(\d{1,2})/i.exec(file.name);
    return m ? Number(m[1]) : null;
  }

  // --- TSV builder (this is the bit you asked for) -------------------------
  function buildTSV(payload) {
    // payload = { week, matchups:[{homeTeam,homeScore,awayTeam,awayScore,winner,diff}, ...] }
    const w = payload?.week ?? "";
    const lines = (payload?.matchups ?? []).map(m =>
      [
        m.homeTeam,
        fmt2(m.homeScore),
        m.awayTeam,
        fmt2(m.awayScore),
        m.winner,
        fmt2(m.diff)
      ].join("\t")
    );
    // Week on first line, then a blank line, then rows
    return `${w}\n\n${lines.join("\n")}`;
  }

  // --- copy helpers ---------------------------------------------------------
  async function copy(text) {
    try { await navigator.clipboard.writeText(text); } catch {}
  }

  // --- file / paste handling ------------------------------------------------
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
    // prefer week from filename, if present
    const w = maybeWeekFromFilename(file);
    if (w) weekInput.value = String(w);

    imageDataUrl = await readFileToDataURL(file);
    showPreview(imageDataUrl);
    enable(btnUpload, true);
    enable(btnClear, true);
  }

  // drag&drop
  dropZone.addEventListener("dragover", (e) => {
    e.preventDefault();
    dropZone.classList.add("drag");
  });
  dropZone.addEventListener("dragleave", () => dropZone.classList.remove("drag"));
  dropZone.addEventListener("drop", async (e) => {
    e.preventDefault();
    dropZone.classList.remove("drag");
    const file = e.dataTransfer?.files?.[0];
    if (file) acceptFile(file);
  });

  // choose
  fileInput.addEventListener("change", async (e) => {
    const file = e.target.files?.[0];
    if (file) acceptFile(file);
  });

  // paste (screenshot)
  window.addEventListener("paste", async (e) => {
    const item = [...(e.clipboardData?.items || [])].find(i => i.type.startsWith("image/"));
    if (!item) return;
    const file = item.getAsFile();
    if (file) acceptFile(file);
  });

  // --- upload & render ------------------------------------------------------
  btnUpload.addEventListener("click", async () => {
    if (!imageDataUrl) return;
    enable(btnUpload, false);
    setStatus("Calling API...");

    const week = Number(weekInput.value || 0) || 0;

    try {
      const res = await fetch("/api/parse-matchups", {
        method: "POST",
        headers: {"content-type":"application/json"},
        body: JSON.stringify({ week, imageDataUrl })
      });

      const data = await res.json();

      // If server inferred week, reflect it in the selector
      if (typeof data.week !== "undefined" && data.week !== null) {
        weekInput.value = String(data.week);
      }

      // Render TSV exactly as requested (week, blank line, rows)
      const tsv = data.tsv || buildTSV(data);
      tsvOut.textContent  = tsv;

      // Render JSON nicely underneath
      jsonOut.textContent = JSON.stringify({ week: data.week, matchups: data.matchups }, null, 2);

      setStatus("Done");
      enable(btnCopyTSV, true);
      enable(btnCopyJSON, true);
    } catch (err) {
      tsvOut.textContent  = "";
      jsonOut.textContent = JSON.stringify({ error: String(err) }, null, 2);
      setStatus("Error");
    } finally {
      enable(btnUpload, true);
    }
  });

  btnClear.addEventListener("click", () => {
    imageDataUrl = null;
    showPreview(null);
    tsvOut.textContent = "";
    jsonOut.textContent = "";
    setStatus("Ready");
    enable(btnUpload, false);
    enable(btnClear, false);
  });

  btnCopyTSV.addEventListener("click", () => copy(tsvOut.textContent));
  btnCopyJSON.addEventListener("click", () => copy(jsonOut.textContent));

  // init
  setStatus("Ready");
  enable(btnUpload, false);
  enable(btnClear,  false);
  enable(btnCopyTSV,  false);
  enable(btnCopyJSON, false);
})();
