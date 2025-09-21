async function fetchHistory(week) {
  const res = await fetch(`/api/history?week=${week}`);
  return res.json();
}

document.getElementById("uploadBtn").addEventListener("click", async () => {
  const week = document.getElementById("week").value;
  const versionSelect = document.getElementById("versionSelect");
  const selectedVersionIndex = versionSelect.value ? parseInt(versionSelect.value) : 0;

  const fileInput = document.getElementById("fileInput");
  const file = fileInput.files[0];
  if (!file) return alert("Please upload an image");

  const reader = new FileReader();
  reader.onloadend = async () => {
    const imageDataUrl = reader.result;

    const res = await fetch("/api/parse-matchups", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ week, imageDataUrl, selectedVersionIndex }),
    });

    const data = await res.json();
    if (data.error) {
      document.getElementById("jsonOutput").textContent = JSON.stringify(data, null, 2);
      return;
    }

    renderOutputs(data.newVersion, week);
    populateHistoryDropdown(data.history);
  };
  reader.readAsDataURL(file);
});

async function populateHistoryDropdown(history) {
  const versionSelect = document.getElementById("versionSelect");
  versionSelect.innerHTML = "";

  history.forEach((entry, idx) => {
    const opt = document.createElement("option");
    opt.value = idx;
    opt.textContent = `${idx === 0 ? "Latest" : `v${idx + 1}`} — ${entry.timestamp}`;
    versionSelect.appendChild(opt);
  });
}

function renderOutputs(newVersion, week) {
  const tsvOutput = document.getElementById("tsvOutput");
  const jsonOutput = document.getElementById("jsonOutput");

  let tsv = `${week}\n\n`;
  newVersion.data.matchups.forEach(m => {
    tsv += `${m.homeTeam}\t${m.homeScore}\t${m.awayTeam}\t${m.awayScore}\n`;
  });

  tsvOutput.textContent = tsv;
  jsonOutput.textContent = JSON.stringify(newVersion.data, null, 2);

  document.getElementById("copyTsv").onclick = () => navigator.clipboard.writeText(tsv);
  document.getElementById("copyJson").onclick = () => navigator.clipboard.writeText(JSON.stringify(newVersion.data, null, 2));
}

// Load history when week changes
document.getElementById("week").addEventListener("change", async () => {
  const week = document.getElementById("week").value;
  const { history } = await fetchHistory(week);
  populateHistoryDropdown(history);
});
