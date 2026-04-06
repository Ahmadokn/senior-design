export const POLL_MS = 5000;
export const GRID_SNAP = 0.5;

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