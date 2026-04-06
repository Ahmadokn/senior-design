import { state, camera, GRID_SNAP } from "./state.js";
import { getCanvas, toWorld, drawScene } from "./canvas.js";
import {
    syncBeaconDraftPosition,
    updateEditorModeUI,
    updateSegmentEditorPanel,
    autofillBeaconPositionsFromPolygon
} from "./ui.js";
import { clampPointToPolygon } from "./geometry.js";

function snap(value) {
    return Math.round(value / GRID_SNAP) * GRID_SNAP;
}

function getMousePos(evt, canvas) {
    const rect = canvas.getBoundingClientRect();
    return {
        x: evt.clientX - rect.left,
        y: evt.clientY - rect.top
    };
}

function getSnappedWorld(evt, canvas) {
    const mouse = getMousePos(evt, canvas);
    const world = toWorld(mouse.x, mouse.y);

    return {
        x: Number(snap(world.wx).toFixed(2)),
        y: Number(snap(world.wy).toFixed(2))
    };
}

function distance2(a, b) {
    const dx = a.x - b.x;
    const dy = a.y - b.y;
    return dx * dx + dy * dy;
}

function isTypingTarget(target) {
    if (!target) return false;
    const tag = target.tagName?.toLowerCase();
    return tag === "input" || tag === "textarea" || target.isContentEditable;
}

function findBeaconUnderPointer(evt, canvas) {
    const mouse = getMousePos(evt, canvas);
    const thresholdPx = 14;

    let found = null;
    let best = Infinity;

    state.BEACON_POS.forEach(beacon => {
        const px = canvas.width / 2 + (beacon.x - camera.x) * camera.zoom;
        const py = canvas.height / 2 - (beacon.y - camera.y) * camera.zoom;

        const dx = mouse.x - px;
        const dy = mouse.y - py;
        const d2 = dx * dx + dy * dy;

        if (d2 < thresholdPx * thresholdPx && d2 < best) {
            best = d2;
            found = beacon;
        }
    });

    return found;
}

function undoLastDraftPoint() {
    if (state.editor.roomDraftPoints.length > 0) {
        state.editor.roomDraftPoints.pop();
        state.editor.selectedDraftSegmentIndex =
            state.editor.roomDraftPoints.length >= 2 ? state.editor.roomDraftPoints.length - 2 : null;
        state.editor.hoverWorldPoint = null;
        updateSegmentEditorPanel();
        drawScene();
    }
}

export function setEditorMode(mode) {
    state.editor.mode = mode;

    if (mode !== "drawRoom") {
        state.editor.roomDraftPoints = [];
        state.editor.selectedDraftSegmentIndex = null;
        state.editor.hoverWorldPoint = null;
    }

    state.editor.draggingBeaconMac = null;
    updateEditorModeUI();
    updateSegmentEditorPanel();
    drawScene();
}

export function clearRoomPolygon() {
    state.ROOM.polygon = [];
    state.editor.roomDraftPoints = [];
    state.editor.selectedDraftSegmentIndex = null;
    state.editor.hoverWorldPoint = null;
    updateSegmentEditorPanel();
    drawScene();
}

export function finishRoomPolygon() {
    const pts = state.editor.roomDraftPoints || [];
    if (pts.length < 3) return;

    state.ROOM.polygon = [...pts];
    state.editor.roomDraftPoints = [];
    state.editor.selectedDraftSegmentIndex = null;
    state.editor.hoverWorldPoint = null;
    state.editor.mode = "view";

    autofillBeaconPositionsFromPolygon();

    updateEditorModeUI();
    updateSegmentEditorPanel();
    drawScene();
}

export function initEditorInteractions() {
    const { canvas } = getCanvas();

    canvas.addEventListener("contextmenu", evt => {
        if (state.editor.mode === "drawRoom") {
            evt.preventDefault();
            undoLastDraftPoint();
        }
    });

    canvas.addEventListener("dblclick", evt => {
        if (state.editor.mode === "drawRoom") {
            evt.preventDefault();
            if ((state.editor.roomDraftPoints || []).length >= 3) {
                finishRoomPolygon();
            }
        }
    });

    canvas.addEventListener("mousedown", evt => {
        if (state.editor.mode === "editBeacons") {
            const existingBeacon = findBeaconUnderPointer(evt, canvas);

            if (existingBeacon) {
                state.selectedBeaconMac = existingBeacon.mac;
                state.editor.draggingBeaconMac = existingBeacon.mac;
                return;
            }

            if (state.selectedBeaconMac) {
                state.editor.draggingBeaconMac = state.selectedBeaconMac;
                let point = getSnappedWorld(evt, canvas);
                if ((state.ROOM.polygon || []).length >= 3) {
                    point = clampPointToPolygon(point, state.ROOM.polygon);
                }
                syncBeaconDraftPosition(state.selectedBeaconMac, point.x, point.y);
                drawScene();
                return;
            }
        }

        state.editor.isPanning = true;
        state.editor.panMoved = false;
        camera.dragStart = { x: evt.clientX, y: evt.clientY };
        camera.camAtDrag = { x: camera.x, y: camera.y };
        canvas.style.cursor = "grabbing";
    });

    window.addEventListener("mousemove", evt => {
        if (state.editor.draggingBeaconMac) {
            let point = getSnappedWorld(evt, canvas);
            if ((state.ROOM.polygon || []).length >= 3) {
                point = clampPointToPolygon(point, state.ROOM.polygon);
            }
            syncBeaconDraftPosition(state.editor.draggingBeaconMac, point.x, point.y);
            drawScene();
            return;
        }

        if (state.editor.mode === "drawRoom" && !state.editor.isPanning) {
            const pts = state.editor.roomDraftPoints || [];
            if (pts.length >= 1) {
                state.editor.hoverWorldPoint = getSnappedWorld(evt, canvas);
                updateSegmentEditorPanel();
                drawScene();
            }
        }

        if (!state.editor.isPanning) return;

        const dx = evt.clientX - camera.dragStart.x;
        const dy = evt.clientY - camera.dragStart.y;

        if (Math.abs(dx) > 2 || Math.abs(dy) > 2) {
            state.editor.panMoved = true;
        }

        camera.x = camera.camAtDrag.x - dx / camera.zoom;
        camera.y = camera.camAtDrag.y + dy / camera.zoom;
        drawScene();
    });

    window.addEventListener("mouseup", () => {
        state.editor.draggingBeaconMac = null;
        state.editor.isPanning = false;
        canvas.style.cursor = state.editor.mode === "editBeacons" ? "crosshair" : "grab";
    });

    window.addEventListener("keydown", evt => {
        if (isTypingTarget(document.activeElement)) return;
        if (state.editor.mode !== "drawRoom") return;

        if (evt.key === "Backspace" || evt.key === "Delete") {
            evt.preventDefault();
            undoLastDraftPoint();
        }

        if (evt.key === "Escape") {
            evt.preventDefault();
            state.editor.roomDraftPoints = [];
            state.editor.selectedDraftSegmentIndex = null;
            state.editor.hoverWorldPoint = null;
            updateSegmentEditorPanel();
            drawScene();
        }
    });

    canvas.addEventListener("click", evt => {
        if (state.editor.mode !== "drawRoom") return;
        if (state.editor.panMoved) return;

        const point = state.editor.hoverWorldPoint || getSnappedWorld(evt, canvas);
        const pts = state.editor.roomDraftPoints;

        if (pts.length >= 3 && distance2(point, pts[0]) <= 0.35 * 0.35) {
            finishRoomPolygon();
            return;
        }

        pts.push(point);
        state.editor.selectedDraftSegmentIndex = pts.length >= 2 ? pts.length - 2 : null;
        state.editor.hoverWorldPoint = null;

        updateSegmentEditorPanel();
        drawScene();
    });

    canvas.addEventListener("wheel", evt => {
        evt.preventDefault();

        const mouse = getMousePos(evt, canvas);
        const before = toWorld(mouse.x, mouse.y);

        camera.zoom = Math.min(
            camera.ZOOM_MAX,
            Math.max(camera.ZOOM_MIN, camera.zoom * (evt.deltaY < 0 ? 1.12 : 0.89))
        );

        const after = toWorld(mouse.x, mouse.y);
        camera.x += before.wx - after.wx;
        camera.y += before.wy - after.wy;

        drawScene();
    }, { passive: false });

    canvas.style.cursor = "grab";
}