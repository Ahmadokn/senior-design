const mqtt   = require("mqtt");
const crypto = require("crypto");

const MQTT_URL    = "mqtt://localhost:1883";
const TOPIC       = "application/5115682e-d471-4e59-89e6-32ebafe1f2db/device/e2efd4ffffe0d875/event/up";
const INTERVAL_MS = 30000; // Real device transmits every 30 seconds

let fCnt = 0;

// ── Real BLE Beacon MACs (from live device data) ──────────────────────────────
// Replace x/y coordinates in trilateration.py once you measure your floor plan.
const BEACONS = [
    { name: "Beacon 1", mac: [0xeb, 0x84, 0x74, 0xd6, 0x16, 0x0d] },
    { name: "Beacon 2", mac: [0xed, 0xf1, 0x7c, 0x46, 0x62, 0xd0] },
    { name: "Beacon 3", mac: [0xde, 0xf7, 0x79, 0xe5, 0x36, 0x6b] },
];

// ── RSSI ranges observed from real data (dBm) ─────────────────────────────────
// Beacon 1: strongest, typically -41 to -52
// Beacon 2: middle,   typically -52 to -61
// Beacon 3: weakest,  typically -54 to -61
const BEACON_RSSI_RANGES = [
    { min: -52, max: -41 }, // Beacon 1
    { min: -61, max: -52 }, // Beacon 2
    { min: -61, max: -54 }, // Beacon 3
];

function randomRssiInRange(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

// Decoder expects: rssi byte = rssi + 256 (to encode signed as unsigned)
function rssiToByte(dBm) { return (dBm + 256) & 0xff; }

function randomSnr() { return Math.round((Math.random() * 20 - 5) * 10) / 10; }

// ── Build fPort 2 BLE payload matching real device format ────────────────────
// Real payload layout (from decoded live data):
//   [0]      status byte  (0x15 = periodic mode, normal battery, no tamper)
//   [1]      temperature  (0x12 = 18°C)
//   [2]      humidity     (0x3d = 61%)
//   [3]      ack + battery voltage nibbles (0xb0 → 3.9V)
//   [4]      battery percent (0x5c = 92%)
//   [5]      positionTypeCode (0x01 = Bluetooth positioning success)
//   [6..7]   year big-endian
//   [8]      month
//   [9]      day
//   [10]     hour
//   [11]     minute
//   [12]     second
//   [13]     timezone (0x00 = UTC+0)
//   [14]     datalen (3 beacons × 7 bytes = 21)
//   [15..]   beacon records: 6-byte MAC + 1-byte RSSI, repeated
function buildBlePayload() {
    const now = new Date();

    // Shuffle beacon order randomly (real device doesn't always send in same order)
    const beaconOrder = [0, 1, 2].sort(() => Math.random() - 0.5);

    const beaconBytes = [];
    for (const i of beaconOrder) {
        const rssi = randomRssiInRange(BEACON_RSSI_RANGES[i].min, BEACON_RSSI_RANGES[i].max);
        beaconBytes.push(...BEACONS[i].mac, rssiToByte(rssi));
    }

    const datalen = beaconBytes.length; // 3 × 7 = 21

    const bytes = [
        0x15,                               // [0]  status: periodic, normal battery, no tamper
        0x12,                               // [1]  temperature: 18°C
        0x3d,                               // [2]  humidity: 61%
        0xb0,                               // [3]  battery voltage → 3.9V
        0x5c,                               // [4]  battery: 92%
        0x01,                               // [5]  positionTypeCode = 1 (BLE success)
        (now.getFullYear() >> 8) & 0xff,    // [6]  year high byte
        now.getFullYear() & 0xff,           // [7]  year low byte
        now.getMonth() + 1,                 // [8]  month
        now.getDate(),                      // [9]  day
        now.getHours(),                     // [10] hour
        now.getMinutes(),                   // [11] minute
        now.getSeconds(),                   // [12] second
        0x00,                               // [13] timezone UTC+0
        datalen,                            // [14] datalen
        ...beaconBytes,                     // [15..] beacon records
    ];

    return Buffer.from(bytes).toString("base64");
}

// ── Build full uplink envelope matching real device structure ─────────────────
function buildUplink() {
    return {
        deduplicationId: crypto.randomUUID(),
        time:            new Date().toISOString(),
        deviceInfo: {
            tenantId:           "16932eac-f8fd-43a7-ad13-eb7e14e84950",
            tenantName:         "MyNetwork",
            applicationId:      "5115682e-d471-4e59-89e6-32ebafe1f2db",
            applicationName:    "Trackers",
            deviceProfileId:    "f16e4c02-721b-4900-8fac-60664894c41f",
            deviceProfileName:  "Tracker",
            deviceName:         "Tracker 1",
            devEui:             "e2efd4ffffe0d875",
            deviceClassEnabled: "CLASS_A",
            tags:               {},
        },
        devAddr:   "01d54164",
        adr:       true,
        dr:        5,
        fCnt,
        fPort:     2,           // Always fPort 2 — real device only sends BLE positioning
        confirmed: false,
        data:      buildBlePayload(),
        rxInfo: [
            {
                gatewayId: "e43819fffe2621cc",
                uplinkId:  Math.floor(Math.random() * 65535),
                nsTime:    new Date().toISOString(),
                rssi:      randomRssiInRange(-80, -60),
                snr:       randomSnr(),
                channel:   Math.floor(Math.random() * 8),
                rfChain:   1,
                location:  {},
                context:   "RSrnIA==",
                crcStatus: "CRC_OK",
            },
        ],
        txInfo: {
            frequency: 868300000,
            modulation: {
                lora: {
                    bandwidth:       125000,
                    spreadingFactor: 7,
                    codeRate:        "CR_4_5",
                },
            },
        },
        regionConfigId: "eu868",
    };
}

// ── MQTT ──────────────────────────────────────────────────────────────────────
const client = mqtt.connect(MQTT_URL);

client.on("connect", () => {
    console.log("🚀 Simulator connected — using real beacon MACs");
    console.log("📍 Beacons:");
    BEACONS.forEach((b, i) => {
        const macStr = b.mac.map(x => x.toString(16).padStart(2, "0")).join("");
        console.log(`   ${b.name}: ${macStr}  RSSI range: ${BEACON_RSSI_RANGES[i].min} to ${BEACON_RSSI_RANGES[i].max} dBm`);
    });

    // Publish first packet immediately, then every 30s (matching real device)
    const publish = () => {
        fCnt++;
        const uplink = buildUplink();
        client.publish(TOPIC, JSON.stringify(uplink));
        console.log(`📡 Published | fPort=2  fCnt=${fCnt}  time=${new Date().toISOString()}`);
    };

    publish();
    setInterval(publish, INTERVAL_MS);
});

client.on("error", (err) => console.error("❌", err.message));
