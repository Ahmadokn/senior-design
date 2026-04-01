export function normalizePolygon(polygon) {
    if (!Array.isArray(polygon)) return [];
    return polygon
        .map(p => ({
            x: Number(p?.x),
            y: Number(p?.y)
        }))
        .filter(p => Number.isFinite(p.x) && Number.isFinite(p.y));
}

export function pointOnSegment(point, a, b, epsilon = 1e-9) {
    const cross = (point.y - a.y) * (b.x - a.x) - (point.x - a.x) * (b.y - a.y);
    if (Math.abs(cross) > epsilon) return false;

    const dot = (point.x - a.x) * (b.x - a.x) + (point.y - a.y) * (b.y - a.y);
    if (dot < -epsilon) return false;

    const lenSq = (b.x - a.x) ** 2 + (b.y - a.y) ** 2;
    if (dot - lenSq > epsilon) return false;

    return true;
}

export function pointInPolygon(point, polygon) {
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

export function closestPointOnSegment(point, a, b) {
    const abx = b.x - a.x;
    const aby = b.y - a.y;
    const lenSq = abx * abx + aby * aby;

    if (lenSq === 0) return { x: a.x, y: a.y };

    let t = ((point.x - a.x) * abx + (point.y - a.y) * aby) / lenSq;
    t = Math.max(0, Math.min(1, t));

    return {
        x: a.x + t * abx,
        y: a.y + t * aby
    };
}

export function closestPointOnPolygon(point, polygon) {
    const pts = normalizePolygon(polygon);
    if (pts.length === 0) return { x: point.x, y: point.y };

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

    return bestPoint || { x: point.x, y: point.y };
}

export function clampPointToPolygon(point, polygon) {
    const pts = normalizePolygon(polygon);
    if (pts.length < 3) return point;

    if (pointInPolygon(point, pts)) return point;
    return closestPointOnPolygon(point, pts);
}

export function getPolygonBounds(polygon) {
    const pts = normalizePolygon(polygon);
    if (pts.length === 0) {
        return { minX: 0, minY: 0, maxX: 10, maxY: 10, width: 10, height: 10 };
    }

    let minX = pts[0].x;
    let maxX = pts[0].x;
    let minY = pts[0].y;
    let maxY = pts[0].y;

    for (const p of pts) {
        if (p.x < minX) minX = p.x;
        if (p.x > maxX) maxX = p.x;
        if (p.y < minY) minY = p.y;
        if (p.y > maxY) maxY = p.y;
    }

    return {
        minX,
        minY,
        maxX,
        maxY,
        width: maxX - minX || 1,
        height: maxY - minY || 1
    };
}

export function getPolygonCentroid(polygon) {
    const pts = normalizePolygon(polygon);
    if (pts.length === 0) return { x: 5, y: 5 };

    let x = 0;
    let y = 0;
    for (const p of pts) {
        x += p.x;
        y += p.y;
    }

    return {
        x: x / pts.length,
        y: y / pts.length
    };
}