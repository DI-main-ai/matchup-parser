/* public/ui.js */
(() => {
  const weekInput   = document.getElementById("weekInput");
  const drop        = document.getElementById("drop");
  const fileInput   = document.getElementById("file");
  const btnUpload   = document.getElementById("btnUpload");
  const btnClear    = document.getElementById("btnClear");
  const btnCopyJson = document.getElementById("btnCopyJson");
  const btnCopyTSV  = document.getElementById("btnCopyTSV");
  const output      = document.getElementById("output");     // will show TSV now
  const statusEl    = document.getElementById("status");
  const tableWrap   = document.getElementById("tableWrap");  // will show JSON below TSV
  const previewWrap = document.getElementById("previewWrap");
  const previewImg  = document.getElementById("preview");

  // Helpers
  const setStatus = (t) => { if (statusEl) statusEl.textContent = t; };
  const showTSV   = (txt) => { if (output) output.textContent = txt; };
  const showBelowJSON = (obj) => {
    if (!tableWrap) return;
    const jsonStr = JSON.stringify(obj, null, 2);
    tableWrap.innerHTML = `
      <div class="muted" style="margin:12px 0 6px">JSON</div>
      <pre>${escapeHTML(jsonStr)}</pre>
    `;
  };
  const clearBelow = () => { if (tableWrap) tableWrap.innerHTML = ""; };
  const showPreview = (url) => {
    if (previewImg && previewWrap) {
      previewImg.src = url;
      previewWrap.style.display = url ? "block" : "none";
    }
  };
  const enable = (el, v) => el && (el.disabled = !v);
  const escapeHTML = (s) => s.replace(/[&<>"']/g, c =>
    ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])
  );

  let imageDataUrl = null;
  let lastTSV = "";
  let lastJSON = "";

  const fmt = (n) => {
    const v = Number(n);
    return Number.isFinite(v) ? v.toFixed(2) : String(n);
  };

  // Build TSV with week number alone on first line, then a blank line, then pairs
  const toTSV = (matchups, week) => {
    if (!Array.isArray(matchups)) return "";
    const header = `${(week || "").trim()}\n\n`;
    const body = matchups
      .map(m => `${m.homeTeam}\t${fmt(m.homeScore)}\n${m.awayTeam}\t${fmt(m.awayScore)}`)
      .join("\n\n");
    return header + body;
  };

  const bytesToDataUrl = (file) => new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(fr.result);
    fr.onerror = reject;
    fr.readAsDataURL(file);
  });

  function clearUI() {
    imageDataUrl = null;
    lastTSV = "";
    lastJSON = "";
    if (fileInput) fileInput.value = "";
    showTSV("");
    clearBelow();
    showPreview("");
    setStatus("Ready");
    enable(btnUpload, false);
    enable(btnClear, false);
    enable(btnCopyJson, false);
    enable(btnCopyTSV, false);
  }

  async function handleFile(file) {
    setStatus("Loading image…");
    try {
      imageDataUrl = await bytesToDataUrl(file);
      showPreview(imageDataUrl);
      setStatus("Image ready");
      enable(btnUpload, true);
      enable(btnClear, true);
    } catch (e) {
      setStatus("Failed to read image");
    }
  }

  // Drag & drop
  if (drop) {
    drop.addEventListener("dragover", (e) => { e.preventDefault(); drop.classList.add("dragover"); });
    drop.addEventListener("dragleave", () => drop.classList.remove("dragover"));
    drop.addEventListener("drop", async (e) => {
      e.preventDefault(); drop.classList.remove("dragover");
      const f = e.dataTransfer?.files?.[0]; if (f) await handleFile(f);
    });
    drop.addEventListener("click", () => fileInput && fileInput.click());
  }

  // File chooser
  if (fileInput) {
    fileInput.addEventListener("change", async (e) => {
      const f = e.target.files?.[0]; if (f) await handleFile(f);
    });
  }

  // Paste support
  window.addEventListener("paste", async (e) => {
    const items = e.clipboardData?.items || [];
    for (const it of items) {
      if (it.type.startsWith("image/")) {
        const f = it.getAsFile();
        if (f) {
          e.preventDefault();
          await handleFile(f);
          break;
        }
      }
    }
  });

  // Upload & Parse
  if (btnUpload) {
    btnUpload.addEventListener("click", async () => {
      if (!imageDataUrl) return;
      setStatus("Calling API…");
      enable(btnUpload, false);

      try {
        const res = await fetch("/api/parse-matchups", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            week: (weekInput?.value || "").trim(),
            imageDataUrl
          }),
        });

        const contentType = (res.headers.get("content-type") || "").toLowerCase();
        let payload;
        if (contentType.includes("application/json")) {
          payload = await res.json();
        } else {
          const txt = await res.text();
          if (!res.ok) throw new Error(txt || `HTTP ${res.status}`);
          payload = JSON.parse(txt);
        }
        if (!res.ok) throw new Error(payload?.error || `HTTP ${res.status}`);

        // Keep JSON & TSV around for copy buttons
        lastJSON = JSON.stringify(payload, null, 2);

        if (Array.isArray(payload.matchups)) {
          lastTSV = toTSV(payload.matchups, weekInput?.value || "");
          showTSV(lastTSV);              // TSV on top (main box)
          showBelowJSON(payload);        // JSON below
          enable(btnCopyTSV, true);
        } else {
          lastTSV = "";
          showTSV(lastJSON);             // fallback to JSON if no matchups
          clearBelow();
          enable(btnCopyTSV, false);
        }

        enable(btnCopyJson, true);
        setStatus("Done");
      } catch (err) {
        const errMsg = String(err?.message || err);
        lastJSON = JSON.stringify({ error: errMsg }, null, 2);
        lastTSV = "";
        showTSV(lastJSON);   // show error in main box
        clearBelow();
        enable(btnCopyJson, true);
        enable(btnCopyTSV, false);
        setStatus("Error");
      } finally {
        enable(btnUpload, true);
      }
    });
  }

  // Copy buttons
  if (btnCopyJson) {
    btnCopyJson.addEventListener("click", async () => {
      if (lastJSON) {
        await navigator.clipboard.writeText(lastJSON);
        setStatus("JSON copied");
      }
    });
  }
  if (btnCopyTSV) {
    btnCopyTSV.addEventListener("click", async () => {
      if (lastTSV) {
        await navigator.clipboard.writeText(lastTSV);
        setStatus("TSV copied");
      }
    });
  }

  if (btnClear) btnClear.addEventListener("click", clearUI);

  clearUI();
})();
