const { getAlgorithm } = require("../algorithms");
const { rssiToDistance } = require("../algorithms/common/rssi");
const {
    normalizePolygon,
    clampToPolygon
} = require("../utils/geometry");

const DEFAULT_CONFIG_ID = "default";
const DEFAULT_TX_POWER = -59;
const DEFAULT_PATH_LOSS_N = 2.5;

function normalizeMac(value) {
    return String(value || "")
        .replace(/0x/g, "")
        .replace(/:/g, "")
        .toLowerCase();
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
        },
        beacons: Array.isArray(cfg?.beacons) ? cfg.beacons : [],
        calibration: {
            txPower: Number(cfg?.calibration?.txPower ?? DEFAULT_TX_POWER),
            pathLossN: Number(cfg?.calibration?.pathLossN ?? DEFAULT_PATH_LOSS_N)
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
        beacons: Array.isArray(payload?.beacons) ? payload.beacons.map(b => ({
            mac: normalizeMac(b.mac),
            label: b.label || normalizeMac(b.mac),
            x: Number(b.x),
            y: Number(b.y)
        })) : [],
        algorithm: payload?.algorithm || "trilateration",
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
    const config = await getLatestConfig(db);

    const configuredBeaconMap = new Map();
    for (const beacon of config.beacons || []) {
        const mac = normalizeMac(beacon.mac);
        configuredBeaconMap.set(mac, beacon);
    }

    const docs = await decodedCollection
        .find({ fPort: 2, "decoded.mac_data.0": { $exists: true } })
        .sort({ receivedAt: -1 })
        .limit(200)
        .toArray();

    const beaconMap = new Map();

    for (const doc of docs) {
        const macData = doc?.decoded?.mac_data || [];

        for (const entry of macData) {
            const mac = normalizeMac(entry?.mac);
            if (!mac) continue;

            if (!beaconMap.has(mac)) {
                const saved = configuredBeaconMap.get(mac);
                beaconMap.set(mac, {
                    mac,
                    label: saved?.label || null,
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

function buildConfiguredBeaconLookup(configuredBeacons) {
    const beaconLookup = new Map();

    for (const b of configuredBeacons) {
        const mac = normalizeMac(b?.mac);
        if (!mac) continue;

        beaconLookup.set(mac, {
            mac,
            label: b.label || mac,
            x: Number(b.x),
            y: Number(b.y)
        });
    }

    return beaconLookup;
}

function buildUsableBeaconInputs(macData, beaconLookup, calibration) {
    const usable = [];

    for (const entry of macData) {
        const mac = normalizeMac(entry?.mac);
        const beacon = beaconLookup.get(mac);
        if (!beacon) continue;

        const rssi = parseRssi(entry?.rssi);
        if (rssi === null) continue;

        const distance = rssiToDistance(
            rssi,
            Number(calibration?.txPower ?? DEFAULT_TX_POWER),
            Number(calibration?.pathLossN ?? DEFAULT_PATH_LOSS_N)
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

    return usable;
}

function buildAlgorithmInput({ devEui, usableBeacons, config }) {
    return {
        trackerId: devEui,
        beacons: usableBeacons,
        room: {
            polygon: normalizePolygon(config?.room?.polygon)
        },
        calibration: {
            txPower: Number(config?.calibration?.txPower ?? DEFAULT_TX_POWER),
            pathLossN: Number(config?.calibration?.pathLossN ?? DEFAULT_PATH_LOSS_N)
        }
    };
}

async function computePositions(db) {
    const decodedCollection = db.collection("decoded");
    const config = await getLatestConfig(db);

    const configuredBeacons = Array.isArray(config.beacons) ? config.beacons : [];
    const beaconLookup = buildConfiguredBeaconLookup(configuredBeacons);

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
    const algorithmName = config.algorithm || "trilateration";
    const algorithm = getAlgorithm(algorithmName);

    for (const [devEui, doc] of latestByTracker.entries()) {
        const macData = doc?.decoded?.mac_data || [];
        const usable = buildUsableBeaconInputs(macData, beaconLookup, config.calibration);

        if (usable.length < 3) continue;

        const algorithmInput = buildAlgorithmInput({
            devEui,
            usableBeacons: usable,
            config
        });

        let point = algorithm(algorithmInput);
        if (!point) continue;

        point = clampToPolygon(point, config.room?.polygon || []);

        output.push({
            devEui,
            deviceName: doc.deviceName || "Unknown",
            estimatedAt: doc.receivedAt,
            x: point.x,
            y: point.y,
            beaconsUsed: usable.length,
            algorithm: point?.meta?.algorithm || algorithmName,
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