const { rssiToDistance, trilaterate } = require("../algorithms/trilateration");

const DEFAULT_CONFIG_ID = "default";
const DEFAULT_TX_POWER = -59;
const DEFAULT_PATH_LOSS_N = 2.5;

async function getLatestConfig(db) {
    const configCollection = db.collection("positioning_config");

    const cfg = await configCollection.findOne({ _id: DEFAULT_CONFIG_ID });

    if (!cfg) {
        return {
            _id: DEFAULT_CONFIG_ID,
            room: { w: 0, h: 0 },
            beacons: [],
            algorithm: "trilateration",
            calibration: {
                txPower: DEFAULT_TX_POWER,
                pathLossN: DEFAULT_PATH_LOSS_N
            }
        };
    }

    return cfg;
}

async function saveConfig(db, payload) {
    const configCollection = db.collection("positioning_config");

    const doc = {
        _id: DEFAULT_CONFIG_ID,
        room: payload.room || { w: 0, h: 0 },
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

function clampToRoom(point, room) {
    if (!point) return null;

    const w = Number(room?.w || 0);
    const h = Number(room?.h || 0);

    return {
        x: Math.min(Math.max(point.x, 0), w > 0 ? w : point.x),
        y: Math.min(Math.max(point.y, 0), h > 0 ? h : point.y)
    };
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

    // keep latest doc per tracker
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

        if (usable.length < 3) {
            continue;
        }

        let point = null;

        if ((config.algorithm || "trilateration") === "trilateration") {
            point = trilaterate(usable);
        }

        if (!point) continue;

        point = clampToRoom(point, config.room);

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