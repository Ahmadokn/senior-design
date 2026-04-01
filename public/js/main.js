import { state, POLL_MS } from "./state.js";
import { getConfig, getLiveBeacons, getPositions } from "./api.js";
import { resizeCanvas, centreCamera, drawScene } from "./canvas.js";
import { initEditorInteractions, setEditorMode, clearRoomPolygon, finishRoomPolygon } from "./editor.js";
import {
    openSetupModal,
    closeSetupModal,
    applyConfig,
    buildBeaconFields,
    renderLiveBeaconList,
    updateRoomBadge,
    updateSidebar,
    updateInfoPanel,
    isSetupModalOpen,
    selectTracker,
    selectBeacon,
    captureBeaconDraftFromForm,
    initializeBeaconDraft,
    updateEditorModeUI,
    updateSelectedBeaconPanel,
    applySelectedBeaconPosition
} from "./ui.js";

window.openSetupModal = openSetupModal;
window.closeSetupModal = closeSetupModal;
window.applyConfig = applyConfig;
window.selectTracker = selectTracker;
window.selectBeacon = selectBeacon;
window.setEditorMode = setEditorMode;
window.clearRoomPolygon = clearRoomPolygon;
window.finishRoomPolygon = finishRoomPolygon;
window.applySelectedBeaconPosition = applySelectedBeaconPosition;

function getLiveBeaconSignature(beacons) {
    return beacons
        .map(b => String(b.mac || "").toLowerCase())
        .sort()
        .join("|");
}

async function loadConfigFromBackend() {
    const config = await getConfig();

    state.ROOM = {
        polygon: Array.isArray(config?.room?.polygon) ? config.room.polygon : []
    };

    state.BEACON_POS = Array.isArray(config?.beacons)
        ? config.beacons.map(b => ({
            mac: String(b.mac || "").toLowerCase(),
            label: b.label || String(b.mac || "").toLowerCase(),
            x: Number(b.x),
            y: Number(b.y)
        }))
        : [];

    if ((state.ROOM.polygon || []).length >= 3) {
        updateRoomBadge();
        centreCamera();
    }
}

async function refreshLiveBeacons() {
    try {
        const newBeacons = await getLiveBeacons();
        const newSignature = getLiveBeaconSignature(newBeacons);

        if (isSetupModalOpen()) {
            captureBeaconDraftFromForm();
        }

        const beaconListChanged = newSignature !== state.lastLiveBeaconSignature;

        state.LIVE_BEACONS = newBeacons;
        state.lastLiveBeaconSignature = newSignature;

        document.getElementById("beacon-count-label").textContent = state.LIVE_BEACONS.length;
        renderLiveBeaconList();

        if (isSetupModalOpen() && beaconListChanged) {
            initializeBeaconDraft();
            buildBeaconFields();
            updateSelectedBeaconPanel();
        }
    } catch (err) {
        console.error(err);
        state.LIVE_BEACONS = [];
        state.lastLiveBeaconSignature = "";
        document.getElementById("beacon-count-label").textContent = "0";
        renderLiveBeaconList();
        updateSelectedBeaconPanel();
    }
}

async function refreshPositions() {
    try {
        const data = await getPositions();

        document.getElementById("conn-label").textContent = "ONLINE";
        document.getElementById("conn-pulse").classList.remove("off");
        document.getElementById("doc-count").textContent = data.length;
        document.getElementById("last-update").textContent = new Date().toLocaleTimeString();

        const latest = {};
        data.forEach(d => {
            latest[d.devEui] = d;
        });

        state.positions = latest;

        updateSidebar();
        updateInfoPanel();
        drawScene();
    } catch (err) {
        console.error(err);
        document.getElementById("conn-label").textContent = "OFFLINE";
        document.getElementById("conn-pulse").classList.add("off");
    }
}

function animateBar() {
    const pct = Math.min(((Date.now() - state.pollStart) / POLL_MS) * 100, 100);
    document.getElementById("refresh-bar").style.width = pct + "%";
    requestAnimationFrame(animateBar);
}

async function init() {
    resizeCanvas();
    initEditorInteractions();

    try {
        await loadConfigFromBackend();
    } catch (err) {
        console.error("Config load failed:", err);
    }

    await refreshLiveBeacons();

    initializeBeaconDraft();
    updateRoomBadge();
    updateEditorModeUI();
    updateSelectedBeaconPanel();
    drawScene();
    await refreshPositions();
    animateBar();

    window.addEventListener("resize", () => {
        resizeCanvas();
    });

    setInterval(async () => {
        state.pollStart = Date.now();
        await refreshLiveBeacons();
        await refreshPositions();
    }, POLL_MS);
}

init();