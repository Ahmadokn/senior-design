import { state, camera } from "./state.js";
import { getPolygonBounds, getPolygonCentroid } from "./geometry.js";

const canvas = document.getElementById("grid");
const ctx = canvas.getContext("2d");

export function getCanvas() {
    return { canvas, ctx };
}

export function resizeCanvas() {
    canvas.width = canvas.offsetWidth;
    canvas.height = canvas.offsetHeight;
    drawScene();
}

export function centreCamera() {
    const polygon = state.ROOM.polygon || [];
    const bounds = getPolygonBounds(polygon);
    const centroid = getPolygonCentroid(polygon);

    camera.x = centroid.x;
    camera.y = centroid.y;

    const scaleX = (canvas.width * 0.7) / bounds.width;
    const scaleY = (canvas.height * 0.7) / bounds.height;

    camera.zoom = Math.min(
        Math.max(Math.min(scaleX, scaleY), camera.ZOOM_MIN),
        camera.ZOOM_MAX
    );
}

export function toScreen(wx, wy) {
    return {
        px: canvas.width / 2 + (wx - camera.x) * camera.zoom,
        py: canvas.height / 2 - (wy - camera.y) * camera.zoom
    };
}

export function toWorld(px, py) {
    return {
        wx: (px - canvas.width / 2) / camera.zoom + camera.x,
        wy: -(py - canvas.height / 2) / camera.zoom + camera.y
    };
}

function drawHex(cx, cy, r, stroke, lw) {
    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
        const a = (Math.PI / 3) * i - Math.PI / 6;
        const x = cx + r * Math.cos(a);
        const y = cy + r * Math.sin(a);
        i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.strokeStyle = stroke;
    ctx.lineWidth = lw;
    ctx.stroke();
}

function drawPolygon(points, options = {}) {
    if (!points || points.length === 0) return;

    const {
        stroke = "#ffd54f",
        fill = "rgba(255, 213, 79, 0.08)",
        lineWidth = 2,
        close = true,
        showVertices = true
    } = options;

    ctx.beginPath();
    points.forEach((p, idx) => {
        const { px, py } = toScreen(p.x, p.y);
        if (idx === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
    });
    if (close && points.length >= 3) ctx.closePath();

    if (close && points.length >= 3) {
        ctx.fillStyle = fill;
        ctx.fill();
    }

    ctx.strokeStyle = stroke;
    ctx.lineWidth = lineWidth;
    ctx.stroke();

    if (showVertices) {
        points.forEach((p, idx) => {
            const { px, py } = toScreen(p.x, p.y);
            ctx.beginPath();
            ctx.arc(px, py, idx === 0 ? 5 : 4, 0, Math.PI * 2);
            ctx.fillStyle = idx === 0 ? "#ffab40" : stroke;
            ctx.fill();
        });
    }
}

export function drawScene() {
    const W = canvas.width;
    const H = canvas.height;

    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = "#040d12";
    ctx.fillRect(0, 0, W, H);

    const wLeft = toWorld(0, H).wx;
    const wRight = toWorld(W, 0).wx;
    const wBot = toWorld(0, H).wy;
    const wTop = toWorld(0, 0).wy;
    const step = camera.zoom < 20 ? 5 : 1;

    for (let wx = Math.floor(wLeft / step) * step; wx <= wRight + step; wx += step) {
        const { px } = toScreen(wx, 0);
        ctx.beginPath();
        ctx.moveTo(px, 0);
        ctx.lineTo(px, H);
        ctx.strokeStyle = wx % 5 === 0 ? "#0d3a4a" : "#071d26";
        ctx.lineWidth = wx % 5 === 0 ? 1.5 : 0.8;
        ctx.stroke();
    }

    for (let wy = Math.floor(wBot / step) * step; wy <= wTop + step; wy += step) {
        const { py } = toScreen(0, wy);
        ctx.beginPath();
        ctx.moveTo(0, py);
        ctx.lineTo(W, py);
        ctx.strokeStyle = wy % 5 === 0 ? "#0d3a4a" : "#071d26";
        ctx.lineWidth = wy % 5 === 0 ? 1.5 : 0.8;
        ctx.stroke();
    }

    const o = toScreen(0, 0);
    ctx.strokeStyle = "#1a4a5a";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(o.px, 0);
    ctx.lineTo(o.px, H);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, o.py);
    ctx.lineTo(W, o.py);
    ctx.stroke();

    ctx.fillStyle = "#1a3a44";
    ctx.font = "10px 'Share Tech Mono'";
    ctx.textAlign = "center";

    for (let wx = Math.floor(wLeft / 5) * 5; wx <= wRight; wx += 5) {
        const { px } = toScreen(wx, 0);
        ctx.fillText(`${wx}m`, px, Math.min(H - 4, Math.max(14, o.py - 4)));
    }

    ctx.textAlign = "left";
    for (let wy = Math.floor(wBot / 5) * 5; wy <= wTop; wy += 5) {
        const { py } = toScreen(0, wy);
        ctx.fillText(`${wy}m`, Math.max(4, o.px + 4), py + 4);
    }

    ctx.fillStyle = "#1a3a44";
    ctx.font = "9px 'Share Tech Mono'";
    ctx.textAlign = "right";
    ctx.fillText(`zoom ${camera.zoom.toFixed(0)}px/m`, W - 12, H - 12);

    const savedPolygon = state.ROOM.polygon || [];
    if (savedPolygon.length >= 3) {
        drawPolygon(savedPolygon, {
            stroke: "#ffd54f",
            fill: "rgba(255, 213, 79, 0.08)",
            lineWidth: 2,
            close: true,
            showVertices: true
        });
    }

    const draftPolygon = state.editor.roomDraftPoints || [];
    if (draftPolygon.length > 0 && state.editor.mode === "drawRoom") {
        drawPolygon(draftPolygon, {
            stroke: "#ffab40",
            fill: "rgba(255, 171, 64, 0.05)",
            lineWidth: 2,
            close: false,
            showVertices: true
        });
    }

    state.BEACON_POS.forEach(b => {
        const { px, py } = toScreen(b.x, b.y);
        const selected = state.selectedBeaconMac === String(b.mac || "").toLowerCase();
        const stroke = selected ? "#ffd54f" : (state.editor.mode === "editBeacons" ? "#00e5ff" : "#00897b");
        const fill = selected ? "#ffd54f" : (state.editor.mode === "editBeacons" ? "#00e5ff" : "#00897b");

        ctx.beginPath();
        ctx.arc(px, py, selected ? 11 : 9, 0, Math.PI * 2);
        ctx.strokeStyle = stroke;
        ctx.lineWidth = selected ? 3 : 2;
        ctx.stroke();

        ctx.beginPath();
        ctx.arc(px, py, selected ? 5 : 4, 0, Math.PI * 2);
        ctx.fillStyle = fill;
        ctx.fill();

        ctx.fillStyle = stroke;
        ctx.font = "9px 'Share Tech Mono'";
        ctx.textAlign = "center";
        ctx.fillText(b.label || b.mac || "Beacon", px, py - 14);

        ctx.fillStyle = "#37474f";
        ctx.font = "8px 'Share Tech Mono'";
        ctx.fillText(`(${Number(b.x).toFixed(1)},${Number(b.y).toFixed(1)})`, px, py + 20);
    });

    Object.entries(state.positions).forEach(([eui, t]) => {
        const { px, py } = toScreen(t.x, t.y);
        const isSel = eui === state.selectedEui;
        const color = isSel ? "#00e5ff" : "#1de9b6";

        ctx.beginPath();
        ctx.arc(px, py, isSel ? 18 : 14, 0, Math.PI * 2);
        ctx.strokeStyle = color + "22";
        ctx.lineWidth = 8;
        ctx.stroke();

        ctx.beginPath();
        ctx.arc(px, py, isSel ? 12 : 9, 0, Math.PI * 2);
        ctx.strokeStyle = color + "55";
        ctx.lineWidth = 2;
        ctx.stroke();

        ctx.beginPath();
        ctx.arc(px, py, 5, 0, Math.PI * 2);
        ctx.fillStyle = color;
        ctx.shadowColor = color;
        ctx.shadowBlur = 16;
        ctx.fill();
        ctx.shadowBlur = 0;

        drawHex(px, py, isSel ? 16 : 12, color + "88", 1.5);

        ctx.fillStyle = color;
        ctx.font = `${isSel ? 11 : 9}px 'Share Tech Mono'`;
        ctx.textAlign = "center";
        ctx.fillText(t.deviceName || eui.slice(-6), px, py - 20);
    });
}