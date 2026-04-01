import { state } from "./state.js";
import { saveConfig } from "./api.js";
import { centreCamera, drawScene } from "./canvas.js";

export function isSetupModalOpen() {
    return document.getElementById("setup-modal").classList.contains("open");
}

export function updateRoomBadge() {
    const badge = document.getElementById("room-badge");
    const label = document.getElementById("room-dims-label");

    if (!state.ROOM.w || !state.ROOM.h) {
        badge.style.display = "none";
        return;
    }

    badge.style.display = "flex";
    label.textContent = `${state.ROOM.w}×${state.ROOM.h}m`;
}

export function renderLiveBeaconList() {
    const list = document.getElementById("live-beacon-list");

    if (!state.LIVE_BEACONS.length) {
        list.innerHTML = '<div class="live-beacon-item">No live beacons found yet.</div>';
        return;
    }

    list.innerHTML = state.LIVE_BEACONS.map(b => `
    <div class="live-beacon-item">
      <div><strong>${b.mac}</strong></div>
      <div style="color:var(--dim)">Last seen: ${b.lastSeenAt ? new Date(b.lastSeenAt).toLocaleTimeString() : '—'} | RSSI: ${b.sampleRssi || '—'}</div>
    </div>
  `).join("");
}

function getConfiguredBeaconMap() {
    return new Map(
        state.BEACON_POS.map(b => [String(b.mac || "").toLowerCase(), b])
    );
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
            label: String(labelInput.value || "").trim(),
            x: xInput.value,
            y: yInput.value
        };
    });

    state.beaconDraft = draft;
}

export function initializeBeaconDraft() {
    const configured = getConfiguredBeaconMap();
    const draft = {};

    state.LIVE_BEACONS.forEach((beacon, i) => {
        const mac = String(beacon.mac || "").toLowerCase();
        const existing = configured.get(mac);

        draft[mac] = {
            mac,
            label: existing?.label || `Beacon ${i + 1}`,
            x: existing?.x ?? "",
            y: existing?.y ?? ""
        };
    });

    state.beaconDraft = draft;
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
        const draft = state.beaconDraft[mac] || {
            mac,
            label: `Beacon ${i + 1}`,
            x: "",
            y: ""
        };

        const row = document.createElement("div");
        row.className = "beacon-row";
        row.innerHTML = `
      <div class="beacon-row-label">Beacon ${i + 1}</div>
      <div class="dim-field" style="flex:1.4">
        <div class="dim-label">MAC</div>
        <input class="dim-input" id="bmac-${i}" type="text" value="${mac}" readonly>
      </div>
      <div class="dim-field">
        <div class="dim-label">LABEL</div>
        <input class="dim-input" id="blabel-${i}" type="text" value="${draft.label ?? ""}">
      </div>
      <div class="dim-field">
        <div class="dim-label">X (metres)</div>
        <input class="dim-input" id="bx-${i}" type="number" placeholder="0" step="0.1" min="0" value="${draft.x ?? ""}">
      </div>
      <div class="beacon-coord-sep">,</div>
      <div class="dim-field">
        <div class="dim-label">Y (metres)</div>
        <input class="dim-input" id="by-${i}" type="number" placeholder="0" step="0.1" min="0" value="${draft.y ?? ""}">
      </div>
    `;
        container.appendChild(row);
    });
}

export function openSetupModal() {
    document.getElementById("room-w").value = state.ROOM.w || "";
    document.getElementById("room-h").value = state.ROOM.h || "";

    renderLiveBeaconList();

    // Start modal with current saved config as draft snapshot
    initializeBeaconDraft();
    buildBeaconFields();

    document.getElementById("cancel-btn").style.display = state.ROOM.w ? "" : "none";
    document.getElementById("setup-modal").classList.add("open");
}

export function closeSetupModal() {
    if (!state.ROOM.w || !state.BEACON_POS.length) return;
    document.getElementById("setup-modal").classList.remove("open");
}

export async function applyConfig() {
    captureBeaconDraftFromForm();

    const w = parseFloat(document.getElementById("room-w").value);
    const h = parseFloat(document.getElementById("room-h").value);

    if (!w || !h || w <= 0 || h <= 0) {
        alert("Please enter valid room dimensions.");
        return;
    }

    if (state.LIVE_BEACONS.length < 3) {
        alert("Need at least 3 live beacons before configuration.");
        return;
    }

    const beacons = [];

    for (const beacon of state.LIVE_BEACONS) {
        const mac = String(beacon.mac || "").toLowerCase();
        const draft = state.beaconDraft[mac];

        if (!draft) {
            alert(`Missing MAC for beacon ${mac}.`);
            return;
        }

        const label = String(draft.label || "").trim() || mac;
        const x = parseFloat(draft.x);
        const y = parseFloat(draft.y);

        if (isNaN(x) || isNaN(y)) {
            alert(`Please enter coordinates for ${label}.`);
            return;
        }

        if (x < 0 || x > w || y < 0 || y > h) {
            alert(`${label} at (${x}, ${y}) is outside the room (${w}m × ${h}m).`);
            return;
        }

        beacons.push({ mac, label, x, y });
    }

    if (beacons.length < 3) {
        alert("At least 3 configured beacons are required.");
        return;
    }

    try {
        const saved = await saveConfig({
            room: { w, h },
            beacons,
            algorithm: "trilateration"
        });

        state.ROOM = saved.room || state.ROOM;
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