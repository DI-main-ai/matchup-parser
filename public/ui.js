/* public/ui.js */
(() => {
  const weekInput   = document.getElementById("weekInput");
  const drop        = document.getElementById("drop");
  const fileInput   = document.getElementById("file");
  const btnUpload   = document.getElementById("btnUpload");
  const btnClear    = document.getElementById("btnClear");
  const btnCopyJson = document.getElementById("btnCopyJson");
  const btnCopyTSV  = document.getElementById("btnCopyTSV");
  const output      = document.getElementById("output");     // shows TSV
  const statusEl    = document.getElementById("status");
  const tableWrap   = document.getElementById("tableWrap");  // shows JSON below
  const previewWrap = document.getElementById("previewWrap");
  const previewImg  = document.getElementById("preview");

  // ---------- helpers ----------
  const setStatus = (t) => { if (statusEl) statusEl.textContent = t; };
  const showTSV   = (txt) => { if (output) output.textContent = txt; };
  const clearBelow = () => { if (tableWrap) tableWrap.innerHTML = ""; };
  const showBelowJSON = (obj) => {
    if (!tableWrap) return;
    const jsonStr = JSON.stringify(obj, null, 2);
    tableWrap.innerHTML = `
      <div class="muted" style="margin:12px 0 6px">JSON</div>
      <pre>${escapeHTML(jsonStr)}</pre>
    `;
  };
  const showPreview = (url) => {
    if (!previewImg || !previewWrap) return;
    previewImg.src = url || "";
    previewWrap.style.display = url ? "block" : "none";
  };
  const enable = (el, v) => el && (el.disabled = !v);
  const escapeHTML = (s) => s.replace(/[&<>"']/g, c =>
    ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])
  );
  const clampWeek = (val) => {
    const n = parseInt(val, 10);
    if (Number.isNaN(n)) return "";
    return String(Math.max(1, Math.min(18, n)));
  };
  const fmt = (n) => {
    const v = Number(n);
    return Number.isFinite(v) ? v.toFixed(2) : String(n);
  };

  // Parse week from filename like: "Week 3.png", "week-12.jpg", "wk_7.JPEG"
  const parseWeekFromName = (name = "") => {
    const m = name.match(/\b(?:week|wk)[\s\-_]*?(\d{1,2})\b/i);
    if (!m) return null;
    const num = parseInt(m[1], 10);
    if (!Number.isFinite(num)) return null;
    if (num < 1 || num > 18) return null;
    return num;
  };

  // Build TSV: first line is just the week number (if provided), then a blank line, then pairs
  const toTSV = (matchups, week) => {
    const header = (week ? `${String(week)}\n\n` : "");
    const body = (Array.isArray(matchups) ? matchups : [])
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

  let imageDataUrl = null;
  let lastTSV = "";
  let lastJSON = "";
  let weekFromFilename = null; // carry into request as a hint

  function clearUI() {
    imageDataUrl = null;
    lastTSV = "";
    lastJSON = "";
    weekFromFilename = null;

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

  function setWeekSelectorIfEmptyOrHint(n) {
    if (!weekInput) return;
    const current = (weekInput.value || "").trim();
    if (!current) {
      weekInput.value = String(n);
    } else {
      // If it already has a value, leave it unless it's "0"
      if (current === "0") weekInput.value = String(n);
    }
  }

  async function handleFile(file) {
    setStatus("Loading image…");
    try {
      // 1) Try to pull week from filename first
      weekFromFilename = parseWeekFromName(file?.name || "");
      if (weekFromFilename) {
        setWeekSelectorIfEmptyOrHint(weekFromFilename);
      }

      // 2) Read file to data URL for preview and upload
      imageDataUrl = await bytesToDataUrl(file);
      showPreview(imageDataUrl);

      setStatus("Image ready");
      enable(btnUpload, true);
      enable(btnClear, true);
    } catch (e) {
      setStatus("Failed to read image");
    }
  }

  // ---------- drag & drop ----------
  if (drop) {
    drop.addEventListener("dragover", (e) => { e.preventDefault(); drop.classList.add("dragover"); });
    drop.addEventListener("dragleave", () => drop.classList.remove("dragover"));
    drop.addEventListener("drop", async (e) => {
      e.preventDefault(); drop.classList.remove("dragover");
      const f = e.dataTransfer?.files?.[0]; if (f) await handleFile(f);
    });
    drop.addEventListener("click", () => fileInput && fileInput.click());
  }

  // ---------- file chooser ----------
  if (fileInput) {
    fileInput.addEventListener("change", async (e) => {
      const f = e.target.files?.[0]; if (f) await handleFile(f);
    });
  }

  // ---------- paste support (no filename here, so image OCR will be the first resort) ----------
  window.addEventListener("paste", async (e) => {
    const items = e.clipboardData?.items || [];
    for (const it of items) {
      if (it.type.startsWith("image/")) {
        const f = it.getAsFile();
        if (f) {
          e.preventDefault();
          // No filename advantage; this leaves detection to the server response
          weekFromFilename = null;
          await handleFile(f);
          break;
        }
      }
    }
  });

  // ---------- upload & parse ----------
  if (btnUpload) {
    btnUpload.addEventListener("click", async () => {
      if (!imageDataUrl) return;

      // Build final "hint" for week: filename > selector > empty
      const selectorVal = clampWeek(weekInput?.value || "");
      // If filename provided a week, prefer it; else fall back to whatever is in selector
      const weekHint = weekFromFilename != null ? String(weekFromFilename) : selectorVal;

      setStatus("Calling API…");
      enable(btnUpload, false);

      try {
        const res = await fetch("/api/parse-matchups", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            // Send both hint & explicit current value for compatibility
            weekHint,
            week: selectorVal,          // legacy field if your API expects it
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

        // If server extracted a week from the image, let that override the selector
        const detected =
          payload?.week ??
          payload?.detectedWeek ??
          payload?.metadata?.week ??
          null;

        if (detected != null && weekInput) {
          const clamped = clampWeek(String(detected));
          if (clamped) weekInput.value = clamped;
        }

        lastJSON = JSON.stringify(payload, null, 2);

        if (Array.isArray(payload.matchups)) {
          // Prefer the most reliable week to print in TSV:
          const tsvWeek =
            (weekInput?.value && clampWeek(weekInput.value)) ||
            (detected != null ? clampWeek(String(detected)) : "") ||
            (weekHint || "");
          lastTSV = toTSV(payload.matchups, tsvWeek);
          showTSV(lastTSV);
          showBelowJSON(payload);
          enable(btnCopyTSV, true);
        } else {
          lastTSV = "";
          showTSV(lastJSON);
          clearBelow();
          enable(btnCopyTSV, false);
        }

        enable(btnCopyJson, true);
        setStatus("Done");
      } catch (err) {
        const errMsg = String(err?.message || err);
        lastJSON = JSON.stringify({ error: errMsg }, null, 2);
        lastTSV = "";
        showTSV(lastJSON);
        clearBelow();
        enable(btnCopyJson, true);
        enable(btnCopyTSV, false);
        setStatus("Error");
      } finally {
        enable(btnUpload, true);
      }
    });
  }

  // ---------- copy buttons ----------
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
