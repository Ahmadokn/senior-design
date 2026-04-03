function normalizePolygon(polygon) {
    if (!Array.isArray(polygon)) return [];
    return polygon
        .map(p => ({
            x: Number(p?.x),
            y: Number(p?.y)
        }))
        .filter(p => Number.isFinite(p.x) && Number.isFinite(p.y));
}

function pointOnSegment(point, a, b, epsilon = 1e-9) {
    const cross = (point.y - a.y) * (b.x - a.x) - (point.x - a.x) * (b.y - a.y);
    if (Math.abs(cross) > epsilon) return false;

    const dot = (point.x - a.x) * (b.x - a.x) + (point.y - a.y) * (b.y - a.y);
    if (dot < -epsilon) return false;

    const lenSq = (b.x - a.x) ** 2 + (b.y - a.y) ** 2;
    if (dot - lenSq > epsilon) return false;

    return true;
}

function pointInPolygon(point, polygon) {
    const pts = normalizePolygon(polygon);
    if (pts.length < 3) return false;

    for (let i = 0; i < pts.length; i += 1) {
        const a = pts[i];
        const b = pts[(i + 1) % pts.length];
        if (pointOnSegment(point, a, b)) return true;
    }

    let inside = false;
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
        const xi = pts[i].x;
        const yi = pts[i].y;
        const xj = pts[j].x;
        const yj = pts[j].y;

        const intersects =
            ((yi > point.y) !== (yj > point.y)) &&
            (point.x < ((xj - xi) * (point.y - yi)) / ((yj - yi) || Number.EPSILON) + xi);

        if (intersects) inside = !inside;
    }

    return inside;
}

function closestPointOnSegment(point, a, b) {
    const abx = b.x - a.x;
    const aby = b.y - a.y;
    const lenSq = abx * abx + aby * aby;

    if (lenSq === 0) {
        return { x: a.x, y: a.y };
    }

    let t = ((point.x - a.x) * abx + (point.y - a.y) * aby) / lenSq;
    t = Math.max(0, Math.min(1, t));

    return {
        x: a.x + t * abx,
        y: a.y + t * aby
    };
}

function closestPointOnPolygon(point, polygon) {
    const pts = normalizePolygon(polygon);
    if (pts.length === 0) return point;

    let bestPoint = null;
    let bestDistSq = Infinity;

    for (let i = 0; i < pts.length; i += 1) {
        const a = pts[i];
        const b = pts[(i + 1) % pts.length];
        const candidate = closestPointOnSegment(point, a, b);

        const dx = point.x - candidate.x;
        const dy = point.y - candidate.y;
        const d2 = dx * dx + dy * dy;

        if (d2 < bestDistSq) {
            bestDistSq = d2;
            bestPoint = candidate;
        }
    }

    return bestPoint || point;
}

function clampToPolygon(point, polygon) {
    const pts = normalizePolygon(polygon);
    if (pts.length < 3) return point;
    if (pointInPolygon(point, pts)) return point;
    return closestPointOnPolygon(point, pts);
}

module.exports = {
    normalizePolygon,
    pointOnSegment,
    pointInPolygon,
    closestPointOnSegment,
    closestPointOnPolygon,
    clampToPolygon
};