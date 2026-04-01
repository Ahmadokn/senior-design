const { rssiToDistance, trilaterate } = require("../algorithms/trilateration");

const DEFAULT_CONFIG_ID = "default";
const DEFAULT_TX_POWER = -59;
const DEFAULT_PATH_LOSS_N = 2.5;

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

    if (lenSq === 0) return { x: a.x, y: a.y };

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

async function getLatestConfig(db) {
    const configCollection = db.collection("positioning_config");

    const cfg = await configCollection.findOne({ _id: DEFAULT_CONFIG_ID });

    if (!cfg) {
        return {
            _id: DEFAULT_CONFIG_ID,
            room: { polygon: [] },
            beacons: [],
            algorithm: "trilateration",
            calibration: {
                txPower: DEFAULT_TX_POWER,
                pathLossN: DEFAULT_PATH_LOSS_N
            }
        };
    }

    return {
        ...cfg,
        room: {
            polygon: normalizePolygon(cfg?.room?.polygon)
        }
    };
}

async function saveConfig(db, payload) {
    const configCollection = db.collection("positioning_config");

    const doc = {
        _id: DEFAULT_CONFIG_ID,
        room: {
            polygon: normalizePolygon(payload?.room?.polygon)
        },
        beacons: Array.isArray(payload.beacons) ? payload.beacons : [],
        algorithm: payload.algorithm || "trilateration",
        calibration: {
            txPower: Number(payload?.calibration?.txPower ?? DEFAULT_TX_POWER),
            pathLossN: Number(payload?.calibration?.pathLossN ?? DEFAULT_PATH_LOSS_N)
        },
        updatedAt: new Date()
    };

    await configCollection.updateOne(
        { _id: DEFAULT_CONFIG_ID },
        { $set: doc },
        { upsert: true }
    );

    return doc;
}

async function getLiveBeacons(db) {
    const decodedCollection = db.collection("decoded");

    const docs = await decodedCollection
        .find({ fPort: 2, "decoded.mac_data.0": { $exists: true } })
        .sort({ receivedAt: -1 })
        .limit(200)
        .toArray();

    const beaconMap = new Map();

    for (const doc of docs) {
        const macData = doc?.decoded?.mac_data || [];

        for (const entry of macData) {
            const mac = String(entry?.mac || "")
                .replace(/0x/g, "")
                .replace(/:/g, "")
                .toLowerCase();

            if (!mac) continue;

            if (!beaconMap.has(mac)) {
                beaconMap.set(mac, {
                    mac,
                    lastSeenAt: doc.receivedAt || null,
                    sampleRssi: entry?.rssi || null
                });
            }
        }
    }

    return Array.from(beaconMap.values());
}

function parseRssi(rssiValue) {
    if (typeof rssiValue === "number") return rssiValue;
    if (typeof rssiValue !== "string") return null;

    const cleaned = rssiValue.replace("dBm", "").trim();
    const parsed = Number(cleaned);

    return Number.isFinite(parsed) ? parsed : null;
}

async function computePositions(db) {
    const decodedCollection = db.collection("decoded");
    const config = await getLatestConfig(db);

    const configuredBeacons = Array.isArray(config.beacons) ? config.beacons : [];
    const beaconLookup = new Map();

    for (const b of configuredBeacons) {
        const mac = String(b?.mac || "")
            .replace(/0x/g, "")
            .replace(/:/g, "")
            .toLowerCase();

        if (!mac) continue;

        beaconLookup.set(mac, {
            mac,
            label: b.label || mac,
            x: Number(b.x),
            y: Number(b.y)
        });
    }

    const docs = await decodedCollection
        .find({ fPort: 2, "decoded.mac_data.0": { $exists: true } })
        .sort({ receivedAt: -1 })
        .limit(500)
        .toArray();

    const latestByTracker = new Map();
    for (const doc of docs) {
        if (!doc.devEui) continue;
        if (!latestByTracker.has(doc.devEui)) {
            latestByTracker.set(doc.devEui, doc);
        }
    }

    const output = [];

    for (const [devEui, doc] of latestByTracker.entries()) {
        const macData = doc?.decoded?.mac_data || [];
        const usable = [];

        for (const entry of macData) {
            const mac = String(entry?.mac || "")
                .replace(/0x/g, "")
                .replace(/:/g, "")
                .toLowerCase();

            const beacon = beaconLookup.get(mac);
            if (!beacon) continue;

            const rssi = parseRssi(entry?.rssi);
            if (rssi === null) continue;

            const distance = rssiToDistance(
                rssi,
                Number(config?.calibration?.txPower ?? DEFAULT_TX_POWER),
                Number(config?.calibration?.pathLossN ?? DEFAULT_PATH_LOSS_N)
            );

            usable.push({
                mac,
                label: beacon.label,
                x: beacon.x,
                y: beacon.y,
                rssi,
                distance
            });
        }

        if (usable.length < 3) continue;

        let point = null;

        if ((config.algorithm || "trilateration") === "trilateration") {
            point = trilaterate(usable);
        }

        if (!point) continue;

        point = clampToPolygon(point, config.room?.polygon || []);

        output.push({
            devEui,
            deviceName: doc.deviceName || "Unknown",
            estimatedAt: doc.receivedAt,
            x: point.x,
            y: point.y,
            beaconsUsed: usable.length,
            beacons: usable.map(b => ({
                mac: b.mac,
                label: b.label,
                x: b.x,
                y: b.y,
                rssi: `${b.rssi}dBm`,
                distance: b.distance
            }))
        });
    }

    return output;
}

module.exports = {
    getLatestConfig,
    saveConfig,
    getLiveBeacons,
    computePositions
};