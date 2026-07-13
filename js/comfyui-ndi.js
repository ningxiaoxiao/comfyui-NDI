import { app } from "../../scripts/app.js";
import { api } from "../../scripts/api.js";

let ndiPanel = null;
let autoRefreshTimer = null;
let isAutoRefresh = false;

function createNdiPanel() {
  if (ndiPanel) return ndiPanel;

  const panel = document.createElement("div");
  panel.id = "ndi-source-panel";
  panel.style.cssText = `
    position: fixed;
    bottom: 20px;
    right: 20px;
    z-index: 9999;
    width: 280px;
    background: #2a2a2a;
    border: 1px solid #444;
    border-radius: 8px;
    box-shadow: 0 4px 16px rgba(0,0,0,0.5);
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    color: #ddd;
    overflow: hidden;
    display: none;
    flex-direction: column;
  `;

  const header = document.createElement("div");
  header.style.cssText = `
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 10px 14px;
    background: #333;
    border-bottom: 1px solid #444;
    cursor: pointer;
    user-select: none;
  `;

  const title = document.createElement("span");
  title.textContent = "🔴 NDI Sources";
  title.style.cssText = `font-weight: 600; font-size: 14px;`;

  const collapseBtn = document.createElement("span");
  collapseBtn.textContent = "−";
  collapseBtn.style.cssText = `font-size: 18px; color: #888; cursor: pointer;`;

  header.appendChild(title);
  header.appendChild(collapseBtn);
  panel.appendChild(header);

  const content = document.createElement("div");
  content.id = "ndi-panel-content";
  content.style.cssText = `
    padding: 12px 14px;
    max-height: 320px;
    overflow-y: auto;
  `;
  panel.appendChild(content);

  const controls = document.createElement("div");
  controls.style.cssText = `
    display: flex;
    gap: 8px;
    padding: 10px 14px;
    border-top: 1px solid #444;
    background: #2a2a2a;
  `;

  const refreshBtn = document.createElement("button");
  refreshBtn.textContent = "🔄 Refresh";
  refreshBtn.style.cssText = btnStyle("#4a7a4a");

  const autoToggle = document.createElement("button");
  autoToggle.textContent = "⏸ Auto: OFF";
  autoToggle.style.cssText = btnStyle("#5a5a5a");

  const status = document.createElement("span");
  status.id = "ndi-status";
  status.textContent = "Idle";
  status.style.cssText = `font-size: 11px; color: #888; align-self: center; margin-left: auto;`;

  controls.appendChild(refreshBtn);
  controls.appendChild(autoToggle);
  controls.appendChild(status);
  panel.appendChild(controls);

  document.body.appendChild(panel);

  let collapsed = false;
  header.addEventListener("click", () => {
    collapsed = !collapsed;
    content.style.display = collapsed ? "none" : "block";
    controls.style.display = collapsed ? "none" : "flex";
    collapseBtn.textContent = collapsed ? "+" : "−";
  });

  refreshBtn.addEventListener("click", () => {
    doRefresh(refreshBtn, content, status);
  });

  autoToggle.addEventListener("click", () => {
    isAutoRefresh = !isAutoRefresh;
    autoToggle.textContent = isAutoRefresh ? "▶ Auto: ON" : "⏸ Auto: OFF";
    autoToggle.style.background = isAutoRefresh ? "#4a6a8a" : "#5a5a5a";
    status.textContent = isAutoRefresh ? "Auto-scanning..." : "Idle";

    if (isAutoRefresh) {
      doRefresh(refreshBtn, content, status);
      autoRefreshTimer = setInterval(() => {
        doRefresh(null, content, status);
      }, 5000);
    } else {
      clearInterval(autoRefreshTimer);
      autoRefreshTimer = null;
    }
  });

  ndiPanel = panel;
  return panel;
}

function btnStyle(bg) {
  return `
    padding: 6px 12px;
    background: ${bg};
    color: #fff;
    border: none;
    border-radius: 4px;
    font-size: 12px;
    cursor: pointer;
    transition: background 0.2s;
  `;
}

function updateNdiNodes(sourceNames) {
  if (!app.graph || !app.graph._nodes) return 0;

  const ndiNodes = app.graph._nodes.filter(
    (n) => n.type === "NDI_LoadImage"
  );

  let updated = 0;
  ndiNodes.forEach((node) => {
    const widget = node.widgets?.find((w) => w.name === "ndi_name");
    if (!widget) return;

    const oldValue = widget.value;
    const oldOptions = widget.options?.values || [];

    if (widget.options) widget.options.values = sourceNames;
    else widget.options = { values: sourceNames };

    if (!sourceNames.includes(oldValue)) {
      widget.value = sourceNames[0] || "";
    }

    const changed =
      oldValue !== widget.value ||
      oldOptions.length !== sourceNames.length ||
      oldOptions.some((v, i) => v !== sourceNames[i]);

    if (changed) {
      node.setDirtyCanvas(true, true);
      updated++;
    }
  });

  return updated;
}

async function doRefresh(btnEl, contentEl, statusEl) {
  if (btnEl) {
    btnEl.textContent = "⏳ Scanning...";
    btnEl.disabled = true;
  }
  statusEl.textContent = "Scanning NDI network...";
  statusEl.style.color = "#aaa";

  try {
    const resp = await api.fetchApi("/ndi/update_list");
    const data = await resp.json();
    const sourceNames = (data.sources || []).map((s) => s.name);

    renderSourceList(contentEl, data.sources || []);

    const updatedNodes = updateNdiNodes(sourceNames);

    const timeStr = new Date().toLocaleTimeString();
    const nodeInfo = updatedNodes > 0 ? ` • ${updatedNodes} node(s) synced` : "";
    statusEl.textContent = `${data.count} source(s)${nodeInfo} • ${timeStr}`;
    statusEl.style.color = "#6a6";
  } catch (err) {
    console.error("[NDI Patch] Refresh failed:", err);
    contentEl.innerHTML = `<div style="color:#c66; font-size:12px; padding:8px;">❌ Failed to scan NDI sources.<br>Make sure NDI runtime is installed.</div>`;
    statusEl.textContent = "Error";
    statusEl.style.color = "#c66";
  } finally {
    if (btnEl) {
      btnEl.textContent = "🔄 Refresh";
      btnEl.disabled = false;
    }
  }
}

function renderSourceList(container, sources) {
  container.innerHTML = "";

  if (sources.length === 0) {
    container.innerHTML = `<div style="color:#888; font-size:12px; text-align:center; padding:16px;">No NDI sources found on network.<br>Make sure an NDI sender is running.</div>`;
    return;
  }

  const list = document.createElement("div");
  list.style.cssText = `display:flex; flex-direction:column; gap:4px;`;

  sources.forEach((src, i) => {
    const row = document.createElement("div");
    row.style.cssText = `
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 8px 10px;
      background: #333;
      border-radius: 4px;
      cursor: pointer;
      transition: background 0.15s;
    `;

    const dot = document.createElement("span");
    dot.textContent = "●";
    dot.style.cssText = `color: #4a6; font-size: 10px; flex-shrink: 0;`;

    const name = document.createElement("span");
    name.textContent = src.name;
    name.style.cssText = `font-size: 13px; flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;`;
    name.title = src.name;

    const copyHint = document.createElement("span");
    copyHint.textContent = "📋";
    copyHint.style.cssText = `font-size: 11px; opacity: 0; transition: opacity 0.2s;`;

    row.addEventListener("mouseenter", () => {
      row.style.background = "#3a3a3a";
      copyHint.style.opacity = "1";
    });
    row.addEventListener("mouseleave", () => {
      row.style.background = "#333";
      copyHint.style.opacity = "0";
    });

    row.addEventListener("click", () => {
      navigator.clipboard.writeText(src.name).then(() => {
        copyHint.textContent = "✅";
        setTimeout(() => { copyHint.textContent = "📋"; }, 1200);
      });
    });

    row.appendChild(dot);
    row.appendChild(name);
    row.appendChild(copyHint);
    list.appendChild(row);
  });

  container.appendChild(list);
}

function createTriggerButton() {
  const btn = document.createElement("button");
  btn.id = "ndi-trigger-btn";
  btn.textContent = "🔴 NDI";
  btn.style.cssText = `
    position: fixed;
    bottom: 20px;
    right: 20px;
    z-index: 10000;
    padding: 10px 16px;
    background: #4a4a4a;
    color: #fff;
    border: 1px solid #666;
    border-radius: 6px;
    font-size: 13px;
    font-weight: 500;
    cursor: pointer;
    box-shadow: 0 2px 8px rgba(0,0,0,0.4);
    transition: all 0.2s;
  `;

  btn.addEventListener("mouseenter", () => { btn.style.background = "#5a5a5a"; });
  btn.addEventListener("mouseleave", () => { btn.style.background = "#4a4a4a"; });

  btn.addEventListener("click", () => {
    const panel = createNdiPanel();
    const isHidden = panel.style.display === "none";
    panel.style.display = isHidden ? "flex" : "none";
    btn.style.display = isHidden ? "none" : "block";

    if (isHidden) {
      const refreshBtn = panel.querySelector("button");
      const content = panel.querySelector("#ndi-panel-content");
      const status = panel.querySelector("#ndi-status");
      doRefresh(refreshBtn, content, status);
    }
  });

  document.body.appendChild(btn);
  return btn;
}

function setupPanelCloseHandler(panel, triggerBtn) {
  document.addEventListener("click", (e) => {
    if (panel.style.display === "flex" && !panel.contains(e.target) && e.target !== triggerBtn) {
      panel.style.display = "none";
      triggerBtn.style.display = "block";
    }
  });
}

app.registerExtension({
  name: "Comfy.NDI.SourcePanel",
  init() {},
  async setup() {
    const triggerBtn = createTriggerButton();
    const panel = createNdiPanel();
    setupPanelCloseHandler(panel, triggerBtn);
  },
});
