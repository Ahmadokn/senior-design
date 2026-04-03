import { state } from "./state.js";
import { saveConfig } from "./api.js";
import { centreCamera, drawScene } from "./canvas.js";
import { clampPointToPolygon, getPolygonBounds } from "./geometry.js";

export function isSetupModalOpen() {
    return document.getElementById("setup-modal").classList.contains("open");
}

export function updateRoomBadge() {
    const badge = document.getElementById("room-badge");
    const label = document.getElementById("room-dims-label");
    const polygon = state.ROOM.polygon || [];

    if (polygon.length < 3) {
        badge.style.display = "none";
        return;
    }

    const bounds = getPolygonBounds(polygon);

    badge.style.display = "flex";
    label.textContent = `${polygon.length} pts | ${bounds.width.toFixed(2)}m × ${bounds.height.toFixed(2)}m`;
}

export function updateEditorModeUI() {
    const badge = document.getElementById("editor-mode-badge");
    const help = document.getElementById("canvas-help");

    const map = {
        view: {
            label: "MODE: VIEW",
            help: "VIEW: drag to pan, scroll to zoom"
        },
        drawRoom: {
            label: "MODE: DRAW ROOM",
            help: "DRAW ROOM: click snapped grid points to add room vertices. Click near the first point or press FINISH ROOM to close."
        },
        editBeacons: {
            label: "MODE: PLACE BEACONS",
            help: "PLACE BEACONS: select a live beacon from the left sidebar, then click-drag on the canvas or edit X/Y below."
        }
    };

    const current = map[state.editor.mode] || map.view;
    badge.textContent = current.label;
    help.textContent = current.help;

    document.querySelectorAll(".tool-btn").forEach(btn => btn.classList.remove("active"));
    if (state.editor.mode === "view") document.getElementById("tool-view").classList.add("active");
    if (state.editor.mode === "drawRoom") document.getElementById("tool-draw-room").classList.add("active");
    if (state.editor.mode === "editBeacons") document.getElementById("tool-edit-beacons").classList.add("active");
}

function getConfiguredBeaconMap() {
    return new Map(
        state.BEACON_POS.map(b => [String(b.mac || "").toLowerCase(), b])
    );
}

function getNextStableBeaconLabel() {
    const usedNumbers = new Set();

    Object.values(state.beaconDraft || {}).forEach(draft => {
        const label = String(draft?.label || "");
        const match = label.match(/^Beacon\s+(\d+)$/i);
        if (match) usedNumbers.add(Number(match[1]));
    });

    state.BEACON_POS.forEach(beacon => {
        const label = String(beacon?.label || "");
        const match = label.match(/^Beacon\s+(\d+)$/i);
        if (match) usedNumbers.add(Number(match[1]));
    });

    let n = 1;
    while (usedNumbers.has(n)) n += 1;
    return `Beacon ${n}`;
}

function ensureStableDraftForMac(mac, fallbackLabel = null) {
    const key = String(mac || "").toLowerCase();
    if (!key) return null;

    if (!state.beaconDraft[key]) {
        state.beaconDraft[key] = {
            mac: key,
            label: fallbackLabel || getNextStableBeaconLabel(),
            x: "",
            y: ""
        };
    } else if (!state.beaconDraft[key].label) {
        state.beaconDraft[key].label = fallbackLabel || getNextStableBeaconLabel();
    }

    return state.beaconDraft[key];
}

export function renderLiveBeaconList() {
    const list = document.getElementById("live-beacon-list");

    if (!state.LIVE_BEACONS.length) {
        list.innerHTML = '<div class="live-beacon-item">No live beacons found yet.</div>';
        renderLiveBeaconSidebar();
        return;
    }

    list.innerHTML = state.LIVE_BEACONS.map(b => {
        const mac = String(b.mac || "").toLowerCase();
        const draft = ensureStableDraftForMac(mac);
        return `
            <div class="live-beacon-item">
              <div><strong>${draft.label}</strong></div>
              <div style="color:var(--dim);font-size:.58rem">${mac}</div>
              <div style="color:var(--dim)">Last seen: ${b.lastSeenAt ? new Date(b.lastSeenAt).toLocaleTimeString() : '—'} | RSSI: ${b.sampleRssi || '—'}</div>
            </div>
        `;
    }).join("");

    renderLiveBeaconSidebar();
}

export function renderLiveBeaconSidebar() {
    const container = document.getElementById("live-beacon-sidebar");
    if (!container) return;

    if (!state.LIVE_BEACONS.length) {
        container.innerHTML = '<div class="no-trackers">Waiting for<br>live beacon data...</div>';
        return;
    }

    container.innerHTML = state.LIVE_BEACONS.map((b) => {
        const mac = String(b.mac || "").toLowerCase();
        const active = state.selectedBeaconMac === mac ? "active" : "";
        const draft = ensureStableDraftForMac(mac);
        const posText = draft && draft.x !== "" && draft.y !== ""
            ? `x: ${draft.x} | y: ${draft.y}`
            : "Not placed";

        return `
            <div class="beacon-sidebar-card ${active}" onclick="selectBeacon('${mac}')">
                <div class="beacon-sidebar-name">${draft.label}</div>
                <div class="beacon-sidebar-mac">${mac}</div>
                <div class="beacon-sidebar-meta">
                    ${posText}<br>
                    RSSI: ${b.sampleRssi || '—'}
                </div>
            </div>
        `;
    }).join("");
}

export function captureBeaconDraftFromForm() {
    const draft = { ...state.beaconDraft };

    state.LIVE_BEACONS.forEach((beacon, i) => {
        const mac = String(beacon.mac || "").toLowerCase();
        const labelInput = document.getElementById(`blabel-${i}`);
        const xInput = document.getElementById(`bx-${i}`);
        const yInput = document.getElementById(`by-${i}`);

        if (!labelInput || !xInput || !yInput) return;

        draft[mac] = {
            mac,
            label: String(labelInput.value || "").trim() || ensureStableDraftForMac(mac)?.label || getNextStableBeaconLabel(),
            x: xInput.value,
            y: yInput.value
        };
    });

    state.beaconDraft = draft;
}

export function initializeBeaconDraft() {
    const configured = getConfiguredBeaconMap();
    const nextDraft = { ...state.beaconDraft };

    state.LIVE_BEACONS.forEach((beacon) => {
        const mac = String(beacon.mac || "").toLowerCase();
        const existing = configured.get(mac);
        const previous = nextDraft[mac];

        nextDraft[mac] = {
            mac,
            label: previous?.label || existing?.label || getNextStableBeaconLabel(),
            x: previous?.x ?? existing?.x ?? "",
            y: previous?.y ?? existing?.y ?? ""
        };
    });

    state.beaconDraft = nextDraft;
}

export function syncBeaconDraftPosition(mac, x, y) {
    const key = String(mac || "").toLowerCase();
    const draft = ensureStableDraftForMac(key);

    let point = {
        x: Number(x),
        y: Number(y)
    };

    if ((state.ROOM.polygon || []).length >= 3) {
        point = clampPointToPolygon(point, state.ROOM.polygon);
    }

    draft.x = point.x;
    draft.y = point.y;

    const rowIndex = state.LIVE_BEACONS.findIndex(b => String(b.mac || "").toLowerCase() === key);
    if (rowIndex >= 0) {
        const xInput = document.getElementById(`bx-${rowIndex}`);
        const yInput = document.getElementById(`by-${rowIndex}`);
        const labelInput = document.getElementById(`blabel-${rowIndex}`);
        if (xInput) xInput.value = point.x;
        if (yInput) yInput.value = point.y;
        if (labelInput) labelInput.value = draft.label;
    }

    const existingIdx = state.BEACON_POS.findIndex(b => String(b.mac || "").toLowerCase() === key);
    if (existingIdx >= 0) {
        state.BEACON_POS[existingIdx].x = point.x;
        state.BEACON_POS[existingIdx].y = point.y;
        state.BEACON_POS[existingIdx].label = draft.label || key;
    } else {
        state.BEACON_POS.push({
            mac: key,
            label: draft.label || key,
            x: point.x,
            y: point.y
        });
    }

    updateSelectedBeaconPanel();
    renderLiveBeaconSidebar();
}

export function buildBeaconFields() {
    const container = document.getElementById("beacon-fields");
    container.innerHTML = "";

    if (!state.LIVE_BEACONS.length) {
        container.innerHTML = `<div class="live-beacon-box">No live beacons available yet. Wait for decoded BLE data first.</div>`;
        return;
    }

    if (!state.beaconDraft || Object.keys(state.beaconDraft).length === 0) {
        initializeBeaconDraft();
    }

    state.LIVE_BEACONS.forEach((beacon, i) => {
        const mac = String(beacon.mac || "").toLowerCase();
        const draft = ensureStableDraftForMac(mac);

        const row = document.createElement("div");
        row.className = "beacon-row";
        row.innerHTML = `
            <div class="beacon-row-label">${draft.label}</div>
            <div class="dim-field" style="flex:1.4">
                <div class="dim-label">MAC</div>
                <input class="dim-input" id="bmac-${i}" type="text" value="${mac}" readonly>
            </div>
            <div class="dim-field">
                <div class="dim-label">LABEL</div>
                <input class="dim-input" id="blabel-${i}" type="text" value="${draft.label ?? ""}">
            </div>
            <div class="dim-field">
                <div class="dim-label">X</div>
                <input class="dim-input" id="bx-${i}" type="text" value="${draft.x ?? ""}" readonly>
            </div>
            <div class="beacon-coord-sep">,</div>
            <div class="dim-field">
                <div class="dim-label">Y</div>
                <input class="dim-input" id="by-${i}" type="text" value="${draft.y ?? ""}" readonly>
            </div>
        `;
        container.appendChild(row);
    });
}

export function openSetupModal() {
    renderLiveBeaconList();
    initializeBeaconDraft();
    buildBeaconFields();
    document.getElementById("cancel-btn").style.display = "";
    document.getElementById("setup-modal").classList.add("open");
}

export function closeSetupModal() {
    document.getElementById("setup-modal").classList.remove("open");
}

export async function applyConfig() {
    captureBeaconDraftFromForm();

    const polygon = state.ROOM.polygon || [];
    if (polygon.length < 3) {
        alert("Please draw a room polygon first.");
        return;
    }

    if (state.LIVE_BEACONS.length < 3) {
        alert("Need at least 3 live beacons before configuration.");
        return;
    }

    const beacons = [];

    for (const beacon of state.LIVE_BEACONS) {
        const mac = String(beacon.mac || "").toLowerCase();
        const draft = ensureStableDraftForMac(mac);

        const label = String(draft.label || "").trim() || mac;
        const x = parseFloat(draft.x);
        const y = parseFloat(draft.y);

        if (isNaN(x) || isNaN(y)) {
            alert(`Please place ${label} on the canvas or enter its X/Y below.`);
            return;
        }

        beacons.push({ mac, label, x, y });
    }

    try {
        const saved = await saveConfig({
            room: {
                polygon: polygon
            },
            beacons,
            algorithm: "trilateration"
        });

        state.ROOM = {
            polygon: Array.isArray(saved.room?.polygon) ? saved.room.polygon : []
        };

        state.BEACON_POS = Array.isArray(saved.beacons)
            ? saved.beacons.map(b => ({
                mac: String(b.mac || "").toLowerCase(),
                label: b.label || String(b.mac || "").toLowerCase(),
                x: Number(b.x),
                y: Number(b.y)
            }))
            : state.BEACON_POS;

        updateRoomBadge();
        centreCamera();
        drawScene();
        renderLiveBeaconSidebar();
        updateSelectedBeaconPanel();

        document.getElementById("setup-modal").classList.remove("open");
    } catch (err) {
        console.error(err);
        alert("Failed to save configuration.");
    }
}

export function updateSidebar() {
    const list = document.getElementById("tracker-list");

    if (!Object.keys(state.positions).length) {
        list.innerHTML = '<div class="no-trackers">Waiting for<br>position data...</div>';
        return;
    }

    list.innerHTML = Object.entries(state.positions).map(([eui, t]) => `
        <div class="tracker-card ${eui === state.selectedEui ? 'active' : ''}" onclick="selectTracker('${eui}')">
          <div class="tracker-name">${t.deviceName || 'TRACKER'}</div>
          <div class="tracker-eui">${eui}</div>
          <div class="tracker-pos">x: ${Number(t.x).toFixed(2)}m &nbsp; y: ${Number(t.y).toFixed(2)}m</div>
        </div>
    `).join("");
}

export function updateInfoPanel() {
    const el = document.getElementById("info-content");

    if (!state.selectedEui || !state.positions[state.selectedEui]) {
        el.innerHTML = '<div style="color:var(--dim);font-size:.6rem">Click a tracker to inspect</div>';
        return;
    }

    const t = state.positions[state.selectedEui];
    el.innerHTML = `
        <div class="info-row"><span class="info-label">NAME</span><span class="info-val">${t.deviceName || '—'}</span></div>
        <div class="info-row"><span class="info-label">X</span><span class="info-val">${Number(t.x).toFixed(3)} m</span></div>
        <div class="info-row"><span class="info-label">Y</span><span class="info-val">${Number(t.y).toFixed(3)} m</span></div>
        <div class="info-row"><span class="info-label">BEACONS</span><span class="info-val">${t.beaconsUsed}</span></div>
        <div class="info-row"><span class="info-label">UPDATED</span><span class="info-val">${t.estimatedAt ? new Date(t.estimatedAt).toLocaleTimeString() : '—'}</span></div>
        <div class="info-row"><span class="info-label">DEV EUI</span><span class="info-val" style="font-size:.5rem">${t.devEui || state.selectedEui}</span></div>
    `;
}

export function selectTracker(eui) {
    state.selectedEui = eui;
    updateSidebar();
    updateInfoPanel();
    drawScene();
}

export function selectBeacon(mac) {
    const key = String(mac || "").toLowerCase();
    state.selectedBeaconMac = key;
    ensureStableDraftForMac(key);
    updateSelectedBeaconPanel();
    renderLiveBeaconSidebar();
    drawScene();
}

export function updateSelectedBeaconPanel() {
    const el = document.getElementById("beacon-editor-content");
    if (!el) return;

    if (!state.selectedBeaconMac) {
        el.innerHTML = '<div style="color:var(--dim);font-size:.6rem">Click a live beacon from the sidebar</div>';
        return;
    }

    const mac = state.selectedBeaconMac;
    const draft = ensureStableDraftForMac(mac);

    el.innerHTML = `
        <div class="info-row"><span class="info-label">MAC</span><span class="info-val" style="font-size:.55rem">${mac}</span></div>
        <div class="info-row"><span class="info-label">LABEL</span><span class="info-val">${draft.label || mac}</span></div>

        <div class="beacon-editor-grid">
            <div>
                <div class="dim-label">X (metres)</div>
                <input class="beacon-editor-input" id="selected-beacon-x" type="number" step="0.1" value="${draft.x ?? ""}">
            </div>
            <div>
                <div class="dim-label">Y (metres)</div>
                <input class="beacon-editor-input" id="selected-beacon-y" type="number" step="0.1" value="${draft.y ?? ""}">
            </div>
        </div>

        <div class="beacon-editor-actions">
            <button class="tool-btn" onclick="applySelectedBeaconPosition()">APPLY X/Y</button>
        </div>
    `;
}

export function applySelectedBeaconPosition() {
    if (!state.selectedBeaconMac) return;

    const xInput = document.getElementById("selected-beacon-x");
    const yInput = document.getElementById("selected-beacon-y");

    if (!xInput || !yInput) return;

    const x = parseFloat(xInput.value);
    const y = parseFloat(yInput.value);

    if (isNaN(x) || isNaN(y)) {
        alert("Enter valid X and Y values.");
        return;
    }

    syncBeaconDraftPosition(state.selectedBeaconMac, x, y);
    drawScene();
}