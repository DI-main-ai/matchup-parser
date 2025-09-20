/* public/ui.js */
(() => {
  const weekInput = document.getElementById("weekInput");
  const drop = document.getElementById("drop");
  const fileInput = document.getElementById("file");

  const btnUpload = document.getElementById("btnUpload");
  const btnClear = document.getElementById("btnClear");
  const btnCopyJson = document.getElementById("btnCopyJson");
  const btnCopyTSV = document.getElementById("btnCopyTSV");

  const output = document.getElementById("output");
  const statusEl = document.getElementById("status");
  const tableWrap = document.getElementById("tableWrap");
  const previewWrap = document.getElementById("previewWrap");
  const previewImg = document.getElementById("preview");

  let imageDataUrl = null;
  let lastTSV = "";

  const setStatus = (t) => (statusEl.textContent = t);
  const enable = (el, v) => (el.disabled = !v);

  function bytesToDataUrl(file) {
    return new Promise((resolve, reject) => {
      const fr = new FileReader();
      fr.onload = () => resolve(fr.result);
      fr.onerror = reject;
      fr.readAsDataURL(file);
    });
  }

  function clearUI() {
    imageDataUrl = null;
    lastTSV = "";
    fileInput.value = "";
    previewWrap.style.display = "none";
    previewImg.src = "";
    output.textContent = "";
    tableWrap.innerHTML = "";
    setStatus("Ready");
    enable(btnUpload, false);
    enable(btnClear, false);
    enable(btnCopyJson, false);
    enable(btnCopyTSV, false);
  }

  const fmt = (n) => {
    if (typeof n === "number" && Number.isFinite(n)) return n.toFixed(2);
    const v = Number(n);
    return Number.isFinite(v) ? v.toFixed(2) : String(n);
    };

  function toTSV(matchups) {
    if (!Array.isArray(matchups)) return "";
    const blocks = matchups.map((m) => {
      const a = `${m.homeTeam}\t${fmt(m.homeScore)}`;
      const b = `${m.awayTeam}\t${fmt(m.awayScore)}`;
      return `${a}\n${b}`;
    });
    return blocks.join("\n\n");
  }

  function renderTable(matchups) {
    if (!Array.isArray(matchups) || matchups.length === 0) {
      tableWrap.innerHTML = "";
      return;
    }
    const rows = matchups
      .map(
        (m) => `
      <tr>
        <td>${m.homeTeam}</td><td style="text-align:right">${fmt(m.homeScore)}</td>
        <td style="padding:0 10px">vs</td>
        <td>${m.awayTeam}</td><td style="text-align:right">${fmt(m.awayScore)}</td>
      </tr>`
      )
      .join("");
    tableWrap.innerHTML = `
      <div style="margin-top:8px;font-size:12px;color:#9aa4ad">Preview</div>
      <table style="width:100%;border-collapse:collapse;font-size:14px">
        <tbody>${rows}</tbody>
      </table>`;
  }

  // ---- Drag & drop ----
  drop.addEventListener("dragover", (e) => {
    e.preventDefault();
    drop.classList.add("dragover");
  });
  drop.addEventListener("dragleave", () => drop.classList.remove("dragover"));
  drop.addEventListener("drop", async (e) => {
    e.preventDefault();
    drop.classList.remove("dragover");
    const f = e.dataTransfer.files?.[0];
    if (f) await handleFile(f);
  });
  drop.addEventListener("click", () => fileInput.click());
  fileInput.addEventListener("change", async (e) => {
    const f = e.target.files?.[0];
    if (f) await handleFile(f);
  });

  // ---- Paste support (Ctrl/Cmd+V) ----
  async function handlePaste(e) {
    if (!e.clipboardData) return;
    for (const item of e.clipboardData.items) {
      if (item.type.startsWith("image/")) {
        const file = item.getAsFile();
        if (file) {
          e.preventDefault();
          await handleFile(file);
          return;
        }
      }
    }
  }
  window.addEventListener("paste", handlePaste);

  async function handleFile(file) {
    setStatus("Loading image…");
    imageDataUrl = await bytesToDataUrl(file);
    previewImg.src = imageDataUrl;
    previewWrap.style.display = "block";
    setStatus("Image ready");
    enable(btnUpload, true);
    enable(btnClear, true);
  }

  // ---- Upload & parse ----
  btnUpload.addEventListener("click", async () => {
    if (!imageDataUrl) return;
    setStatus("Calling API…");
    enable(btnUpload, false);

    try {
      const res = await fetch("/api/parse-matchups", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          week: (weekInput.value || "").trim(),
          imageDataUrl,
        }),
      });

      const ctype = (res.headers.get("content-type") || "").toLowerCase();
      let payload;
      if (ctype.includes("application/json")) {
        payload = await res.json();
      } else {
        const txt = await res.text();
        if (!res.ok) throw new Error(txt || `HTTP ${res.status}`);
        try { payload = JSON.parse(txt); } catch { throw new Error(txt); }
      }

      if (!res.ok) {
        throw new Error(payload?.error || `HTTP ${res.status}`);
      }

      output.textContent = JSON.stringify(payload, null, 2);
      enable(btnCopyJson, true);

      if (payload && Array.isArray(payload.matchups)) {
        lastTSV = toTSV(payload.matchups);
        renderTable(payload.matchups);
        enable(btnCopyTSV, true);
      } else {
        lastTSV = "";
        renderTable([]);
        enable(btnCopyTSV, false);
      }

      setStatus("Done");
    } catch (err) {
      output.textContent = JSON.stringify({ error: String(err?.message || err) }, null, 2);
      lastTSV = "";
      renderTable([]);
      enable(btnCopyJson, true);
      enable(btnCopyTSV, false);
      setStatus("Error");
    } finally {
      enable(btnUpload, true);
    }
  });

  btnCopyJson.addEventListener("click", async () => {
    const txt = output.textContent || "";
    if (txt) {
      await navigator.clipboard.writeText(txt);
      setStatus("JSON copied");
    }
  });

  btnCopyTSV.addEventListener("click", async () => {
    if (lastTSV) {
      await navigator.clipboard.writeText(lastTSV);
      setStatus("TSV copied");
    }
  });

  btnClear.addEventListener("click", clearUI);
  clearUI();
})();
