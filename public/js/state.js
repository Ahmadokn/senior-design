export const POLL_MS = 5000;

// Minor snap step: 5 cm
export const GRID_SNAP = 0.05;

// Visual grid settings
export const GRID_MAJOR_STEP = 1.0;   // 1 meter
export const GRID_MINOR_STEP = 0.05;  // 5 cm

export const state = {
    ROOM: { polygon: [] },
    BEACON_POS: [],
    LIVE_BEACONS: [],
    positions: {},
    selectedEui: null,
    selectedBeaconMac: null,
    pollStart: Date.now(),
    beaconDraft: {},
    lastLiveBeaconSignature: "",

    editor: {
        mode: "view",
        roomDraftPoints: [],
        isPanning: false,
        panMoved: false,
        draggingBeaconMac: null,
        selectedDraftSegmentIndex: null,
        hoverWorldPoint: null
    }
};

export const camera = {
    x: 5,
    y: 4,
    zoom: 38,
    ZOOM_MIN: 4,
    ZOOM_MAX: 160,
    dragStart: null,
    camAtDrag: null
};