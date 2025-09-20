/* public/ui.js */
(() => {
  const weekInput   = document.getElementById("weekInput");
  const drop        = document.getElementById("drop");
  const fileInput   = document.getElementById("file");
  const btnUpload   = document.getElementById("btnUpload");
  const btnClear    = document.getElementById("btnClear");
  const btnCopyJson = document.getElementById("btnCopyJson");
  const btnCopyTSV  = document.getElementById("btnCopyTSV");
  const output      = document.getElementById("output");
  const statusEl    = document.getElementById("status");
  const tableWrap   = document.getElementById("tableWrap");
  const previewWrap = document.getElementById("previewWrap");
  const previewImg  = document.getElementById("preview");

  // Safe helpers
  const setStatus = (t) => { if (statusEl) statusEl.textContent = t; };
  const setOutput = (txt) => { if (output) output.textContent = txt; };
  const setTable  = (html) => { if (tableWrap) tableWrap.innerHTML = html; };
  const showPreview = (url) => {
    if (previewImg && previewWrap) {
      previewImg.src = url;
      previewWrap.style.display = url ? "block" : "none";
    }
  };
  const enable = (el, v) => el && (el.disabled = !v);

  let imageDataUrl = null;
  let lastTSV = "";

  const fmt = (n) => {
    const v = Number(n);
    return Number.isFinite(v) ? v.toFixed(2) : String(n);
  };

  const toTSV = (matchups, week) => {
    if (!Array.isArray(matchups)) return "";
    const header = `Week ${week || ""}\n\n`;
    const body = matchups.map(m => `${m.homeTeam}\t${fmt(m.homeScore)}\n${m.awayTeam}\t${fmt(m.awayScore)}`).join("\n\n");
    return header + body;
  };

  const renderTable = (matchups) => {
    if (!tableWrap) return; // guard
    if (!Array.isArray(matchups) || !matchups.length) {
      setTable("");
      return;
    }
    const rows = matchups.map(m => `
      <tr>
        <td>${m.homeTeam}</td><td>${fmt(m.homeScore)}</td>
        <td style="padding:0 10px;text-align:center">vs</td>
        <td>${m.awayTeam}</td><td>${fmt(m.awayScore)}</td>
      </tr>`).join("");
    setTable(`
      <div class="muted" style="margin-bottom:6px">Preview</div>
      <table><tbody>${rows}</tbody></table>
    `);
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
    if (fileInput) fileInput.value = "";
    setOutput("");
    setTable("");
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

  // Upload
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

        setOutput(JSON.stringify(payload, null, 2));
        enable(btnCopyJson, true);

        if (Array.isArray(payload.matchups)) {
          lastTSV = toTSV(payload.matchups, weekInput?.value || "");
          renderTable(payload.matchups);
          enable(btnCopyTSV, true);
        } else {
          lastTSV = "";
          renderTable([]);
          enable(btnCopyTSV, false);
        }

        setStatus("Done");
      } catch (err) {
        setOutput(JSON.stringify({ error: String(err?.message || err) }, null, 2));
        lastTSV = "";
        renderTable([]);
        enable(btnCopyJson, true);
        enable(btnCopyTSV, false);
        setStatus("Error");
      } finally {
        enable(btnUpload, true);
      }
    });
  }

  if (btnCopyJson) {
    btnCopyJson.addEventListener("click", async () => {
      const txt = output?.textContent || "";
      if (txt) { await navigator.clipboard.writeText(txt); setStatus("JSON copied"); }
    });
  }
  if (btnCopyTSV) {
    btnCopyTSV.addEventListener("click", async () => {
      if (lastTSV) { await navigator.clipboard.writeText(lastTSV); setStatus("TSV copied"); }
    });
  }
  if (btnClear) btnClear.addEventListener("click", clearUI);

  clearUI();
})();
