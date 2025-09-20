/* public/ui.js
   Frontend for Matchup Parser
   - Drag/drop or pick a screenshot
   - Sends week + image to /api/parse-matchups
   - Shows JSON result
   - "Copy TSV" copies tab-delimited pairs exactly like the user's sample
*/

(() => {
  // ---- DOM ----
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

  // ---- State ----
  let imageDataUrl = null;
  let lastJson = null;
  let lastTSV = "";

  // ---- Helpers ----
  const setStatus = (text) => (statusEl.textContent = text);
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
    lastJson = null;
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

  // Format scores as shown in the screenshots (two decimals)
  const fmt = (n) => {
    if (typeof n === "number" && Number.isFinite(n)) return n.toFixed(2);
    const num = Number(n);
    return Number.isFinite(num) ? num.toFixed(2) : String(n);
  };

  // === TSV formatter: EXACTLY like the sample ===
  // TeamA<TAB>Score
  // TeamB<TAB>Score
  //
  // (blank line between matchups)
  function toTSV(matchups) {
    if (!Array.isArray(matchups)) return "";
    const blocks = matchups.map((m) => {
      const a = `${m.homeTeam}\t${fmt(m.homeScore)}`;
      const b = `${m.awayTeam}\t${fmt(m.awayScore)}`;
      return `${a}\n${b}`;
    });
    return blocks.join("\n\n");
  }

  // Optional mini table to eyeball results
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

  // ---- Drag & Drop ----
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
          imageDataUrl, // base64 data URL
        }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data?.error || `HTTP ${res.status}`);
      }

      lastJson = data;
      output.textContent = JSON.stringify(data, null, 2);

      // Build TSV from the returned matchups, if present
      if (data && Array.isArray(data.matchups)) {
        lastTSV = toTSV(data.matchups);
        renderTable(data.matchups);
        enable(btnCopyTSV, true);
      } else {
        lastTSV = "";
        renderTable([]);
        enable(btnCopyTSV, false);
      }

      enable(btnCopyJson, true);
      setStatus("Done");
    } catch (err) {
      output.textContent = JSON.stringify(
        { error: String(err?.message || err) },
        null,
        2
      );
      lastJson = null;
      lastTSV = "";
      renderTable([]);
      enable(btnCopyJson, false);
      enable(btnCopyTSV, false);
      setStatus("Error");
    } finally {
      enable(btnUpload, true);
    }
  });

  // ---- Copy buttons ----
  btnCopyJson.addEventListener("click", async () => {
    const txt = output.textContent || "";
    if (!txt) return;
    await navigator.clipboard.writeText(txt);
    setStatus("JSON copied");
  });

  btnCopyTSV.addEventListener("click", async () => {
    if (!lastTSV) return;
    await navigator.clipboard.writeText(lastTSV);
    setStatus("TSV copied");
  });

  btnClear.addEventListener("click", clearUI);

  // init
  clearUI();
})();
