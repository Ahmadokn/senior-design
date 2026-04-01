import { state, camera } from "./state.js";

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
    if (!state.ROOM.w || !state.ROOM.h) return;

    camera.x = state.ROOM.w / 2;
    camera.y = state.ROOM.h / 2;

    const scaleX = (canvas.width * 0.78) / state.ROOM.w;
    const scaleY = (canvas.height * 0.78) / state.ROOM.h;

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

export function initCanvasInteractions(onDraw) {
    canvas.addEventListener("mousedown", e => {
        camera.isDragging = true;
        camera.dragStart = { x: e.clientX, y: e.clientY };
        camera.camAtDrag = { x: camera.x, y: camera.y };
        canvas.style.cursor = "grabbing";
    });

    window.addEventListener("mouseup", () => {
        camera.isDragging = false;
        canvas.style.cursor = "grab";
    });

    window.addEventListener("mousemove", e => {
        if (!camera.isDragging) return;
        camera.x = camera.camAtDrag.x - (e.clientX - camera.dragStart.x) / camera.zoom;
        camera.y = camera.camAtDrag.y + (e.clientY - camera.dragStart.y) / camera.zoom;
        onDraw();
    });

    canvas.addEventListener("wheel", e => {
        e.preventDefault();
        const rect = canvas.getBoundingClientRect();
        const mx = e.clientX - rect.left;
        const my = e.clientY - rect.top;
        const before = toWorld(mx, my);

        camera.zoom = Math.min(
            camera.ZOOM_MAX,
            Math.max(camera.ZOOM_MIN, camera.zoom * (e.deltaY < 0 ? 1.12 : 0.89))
        );

        const after = toWorld(mx, my);
        camera.x += before.wx - after.wx;
        camera.y += before.wy - after.wy;
        onDraw();
    }, { passive: false });

    canvas.style.cursor = "grab";
}

function drawHex(ctx, cx, cy, r, stroke, lw) {
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

    if (state.ROOM.w && state.ROOM.h) {
        const bl = toScreen(0, 0);
        const tr = toScreen(state.ROOM.w, state.ROOM.h);
        const rw = tr.px - bl.px;
        const rh = bl.py - tr.py;

        ctx.fillStyle = "rgba(0,229,255,0.03)";
        ctx.fillRect(bl.px, tr.py, rw, rh);

        ctx.strokeStyle = "#00897b";
        ctx.lineWidth = 2;
        ctx.setLineDash([6, 4]);
        ctx.strokeRect(bl.px, tr.py, rw, rh);
        ctx.setLineDash([]);

        ctx.fillStyle = "#00897b99";
        ctx.font = "9px 'Share Tech Mono'";
        ctx.textAlign = "left";
        ctx.fillText("(0,0)", bl.px + 4, bl.py - 4);
        ctx.textAlign = "right";
        ctx.fillText(`(${state.ROOM.w},${state.ROOM.h})`, tr.px - 4, tr.py + 12);

        const midX = (bl.px + tr.px) / 2;
        const midY = (bl.py + tr.py) / 2;
        ctx.fillStyle = "#00897b";
        ctx.textAlign = "center";
        ctx.fillText(`${state.ROOM.w}m`, midX, bl.py + 14);
        ctx.save();
        ctx.translate(bl.px - 14, midY);
        ctx.rotate(-Math.PI / 2);
        ctx.fillText(`${state.ROOM.h}m`, 0, 0);
        ctx.restore();
    }

    state.BEACON_POS.forEach(b => {
        const { px, py } = toScreen(b.x, b.y);

        ctx.beginPath();
        ctx.arc(px, py, 8, 0, Math.PI * 2);
        ctx.strokeStyle = "#00897b";
        ctx.lineWidth = 1.5;
        ctx.stroke();

        ctx.beginPath();
        ctx.arc(px, py, 3, 0, Math.PI * 2);
        ctx.fillStyle = "#00897b";
        ctx.fill();

        ctx.fillStyle = "#00897b";
        ctx.font = "9px 'Share Tech Mono'";
        ctx.textAlign = "center";
        ctx.fillText(b.label || b.mac || "Beacon", px, py - 13);

        ctx.fillStyle = "#37474f";
        ctx.font = "8px 'Share Tech Mono'";
        ctx.fillText(`(${b.x},${b.y})`, px, py + 20);
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

        drawHex(ctx, px, py, isSel ? 16 : 12, color + "88", 1.5);

        ctx.fillStyle = color;
        ctx.font = `${isSel ? 11 : 9}px 'Share Tech Mono'`;
        ctx.textAlign = "center";
        ctx.fillText(t.deviceName || eui.slice(-6), px, py - 20);
    });
}