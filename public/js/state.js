export const POLL_MS = 5000;

export const state = {
    ROOM: { w: 0, h: 0 },
    BEACON_POS: [],
    LIVE_BEACONS: [],
    positions: {},
    selectedEui: null,
    pollStart: Date.now(),

    // Keeps unsaved modal values so refreshes do not wipe the form
    beaconDraft: {},
    lastLiveBeaconSignature: ""
};

export const camera = {
    x: 5,
    y: 4,
    zoom: 38,
    ZOOM_MIN: 4,
    ZOOM_MAX: 160,
    isDragging: false,
    dragStart: null,
    camAtDrag: null
};