/**
 * Uplink Simulator — LW001-BG PRO
 *
 * Rotates through all 4 ports every INTERVAL_MS:
 *   Port 1 → Heartbeat
 *   Port 2 → Location Fixed   (Bluetooth BLE)
 *   Port 3 → Location Failure (Bluetooth BLE, reason: strategies_timeout)
 *   Port 4 → Shutdown         (LoRaWAN command)
 *
 * All payloads include the 2-byte reserved field (bytes 3–4 after the
 * common header), hardcoded to the values observed in real captures:
 *   Port 1       → 0xC0 0x5F
 *   Port 2, 3, 4 → 0xC0 0x5E  (port 2 unconfirmed, assumed same as 3 & 4)
 */

const mqtt = require("mqtt");

const MQTT_URL    = "mqtt://localhost:1883";
const TOPIC       = "application/5115682e-d471-4e59-89e6-32ebafe1f2db/device/e2efd4ffffe0d875/event/up";
const INTERVAL_MS = 5000;
const DEV_EUI     = "e2efd4ffffe0d875";
const DEV_ADDR    = "01d54164";
const GATEWAY_ID  = "e43819fffe2621cc";

// ── State ─────────────────────────────────────────────────────────────────────
let fCnt      = 0;
let ackCnt    = 0;  // wraps 0–15 per spec
let portIndex = 0;
const PORT_SEQUENCE = [1, 2, 3, 4];

// Reserved bytes (bytes 3–4 after common header).
// Purpose unknown — not documented in the spec. Hardcoded to the exact
// values seen in real device captures. 0xC0 is constant across all ports;
// the second byte differs only for port 1 (0x5F vs 0x5E everywhere else).
const RESERVED = {
    1: Buffer.from([0xC0, 0x5F]),  // observed: port 1, fCnt=2
    2: Buffer.from([0xC0, 0x5E]),  // assumed:  no real port 2 capture yet
    3: Buffer.from([0xC0, 0x5E]),  // observed: port 3, fCnt=3
    4: Buffer.from([0xC0, 0x5E]),  // observed: port 4, fCnt=1
};

// Simulated BLE beacon pool
const BLE_BEACONS = [
    { mac: [0xAA, 0xBB, 0xCC, 0xDD, 0xEE, 0x01], baseRssi: -61 },
    { mac: [0xAA, 0xBB, 0xCC, 0xDD, 0xEE, 0x02], baseRssi: -68 },
    { mac: [0xAA, 0xBB, 0xCC, 0xDD, 0xEE, 0x03], baseRssi: -75 },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function randInt(min, max) {
    return min + Math.floor(Math.random() * (max - min + 1));
}

/**
 * Build the 3-byte common header.
 * @param {number} tempC      temperature °C (signed)
 * @param {number} battNibble 0–15  → voltage = 2.2V + 0.1 × nibble
 * @param {number} opMode     0=standby 1=periodic 2=timing 3=motion
 */
function buildHeader(tempC, battNibble, opMode = 0x01) {
    const byte0 = opMode & 0x03;
    const byte1 = tempC >= 0 ? tempC : tempC + 256;  // signed → unsigned byte
    const byte2 = ((battNibble & 0x0f) << 4) | (ackCnt & 0x0f);
    return Buffer.from([byte0, byte1, byte2]);
}

/** Encode a JS Date into the 7-byte BE timestamp used by Port 2. */
function encodeTimestamp(date) {
    const y = date.getUTCFullYear();
    return Buffer.from([
        (y >> 8) & 0xff, y & 0xff,
        date.getUTCMonth() + 1,
        date.getUTCDate(),
        date.getUTCHours(),
        date.getUTCMinutes(),
        date.getUTCSeconds(),
    ]);
}

/**
 * Build BLE location data: N × [MAC(6) + RSSI(1)]
 * RSSI raw = dBm + 256  (e.g. −61 dBm → 0xC3 = 195), per spec.
 */
function buildBleData(beacons) {
    return Buffer.concat(beacons.map(({ mac, baseRssi }) => {
        const rssiDbm = Math.max(-110, Math.min(-30, baseRssi + randInt(-5, 5)));
        return Buffer.from([...mac, rssiDbm + 256]);
    }));
}

// ── Payload builders ──────────────────────────────────────────────────────────

/**
 * Port 1 — Heartbeat  (11 bytes)
 * [header(3)] [reserved(2)=C05F] [rebootReason(1)] [fwVersion(1)] [activeStateCount(4 BE)]
 */
function buildPort1() {
    const header   = buildHeader(randInt(18, 26), 3);
    const reserved = RESERVED[1];

    // Reboot reason 0x03 = power on after normal power off (matches real capture)
    const rebootReason = 0x03;

    // FW version V2.0.1 → bits: major(10) sub(00) patch(0001) → 0x81 (matches real capture)
    const fwVersion = (0x02 << 6) | (0x00 << 4) | 0x01; // 0x81

    const count = Buffer.alloc(4);
    count.writeUInt32BE(fCnt, 0);

    return Buffer.concat([header, reserved, Buffer.from([rebootReason, fwVersion]), count]);
}

/**
 * Port 2 — Location Fixed, Bluetooth  (29 bytes for 2 beacons)
 * [header(3)] [reserved(2)=C05E] [successType=0x01(1)] [timestamp(7)] [timezone(1)] [dataLen(1)] [bleData(N×7)]
 */
function buildPort2() {
    const header      = buildHeader(randInt(18, 26), 3);
    const reserved    = RESERVED[2];
    const successType = Buffer.from([0x01]); // Bluetooth success
    const timestamp   = encodeTimestamp(new Date());
    const timezone    = Buffer.from([0x00]); // UTC+0
    const bleData     = buildBleData(BLE_BEACONS.slice(0, 2));
    const dataLen     = Buffer.from([bleData.length]);

    return Buffer.concat([header, reserved, successType, timestamp, timezone, dataLen, bleData]);
}

/**
 * Port 3 — Location Failure, Bluetooth  (21 bytes for 2 beacons)
 * [header(3)] [reserved(2)=C05E] [failureReason(1)] [dataLen(1)] [bleData(N×7)]
 *
 * Failure reason 0x04 = bluetooth_strategies_timeout
 */
function buildPort3() {
    const header        = buildHeader(randInt(18, 26), 3);
    const reserved      = RESERVED[3];
    const failureReason = Buffer.from([0x04]); // bluetooth_strategies_timeout
    const bleData       = buildBleData(BLE_BEACONS.slice(0, 2));
    const dataLen       = Buffer.from([bleData.length]);

    return Buffer.concat([header, reserved, failureReason, dataLen, bleData]);
}

/**
 * Port 4 — Shutdown  (6 bytes)
 * [header(3)] [reserved(2)=C05E] [shutdownType(1)]
 *
 * Shutdown type 0x02 = magnetic (matches real capture)
 */
function buildPort4() {
    const header      = buildHeader(randInt(18, 26), 3);
    const reserved    = RESERVED[4];
    const shutdownType = Buffer.from([0x02]); // magnetic
    return Buffer.concat([header, reserved, shutdownType]);
}

const PAYLOAD_BUILDERS = { 1: buildPort1, 2: buildPort2, 3: buildPort3, 4: buildPort4 };

// ── MQTT uplink wrapper ───────────────────────────────────────────────────────

function buildUplink(fPort) {
    const payload = PAYLOAD_BUILDERS[fPort]();
    return {
        deduplicationId: Math.random().toString(36).substring(2),
        time:            new Date().toISOString(),
        deviceInfo: {
            tenantId:           "sim-tenant",
            tenantName:         "SimNetwork",
            applicationId:      "5115682e-d471-4e59-89e6-32ebafe1f2db",
            applicationName:    "Trackers",
            deviceProfileId:    "sim-profile",
            deviceProfileName:  "Tracker",
            deviceName:         "Sim Tracker",
            devEui:             DEV_EUI,
            deviceClassEnabled: "CLASS_A",
            tags:               {},
        },
        devAddr:   DEV_ADDR,
        adr:       true,
        dr:        5,
        fCnt,
        fPort,
        confirmed: false,
        data:      payload.toString("base64"),
        rxInfo: [{
            gatewayId: GATEWAY_ID,
            uplinkId:  randInt(0, 65535),
            rssi:      randInt(-90, -60),
            snr:       parseFloat((randInt(50, 140) / 10).toFixed(1)),
            channel:   randInt(0, 7),
            crcStatus: "CRC_OK",
        }],
        txInfo: {
            frequency: 867900000,
            modulation: { lora: { bandwidth: 125000, spreadingFactor: 7, codeRate: "CR_4_5" } },
        },
        regionConfigId: "eu868",
    };
}

// ── Main ──────────────────────────────────────────────────────────────────────

const client = mqtt.connect(MQTT_URL);

client.on("connect", () => {
    console.log("🚀 Simulator connected to MQTT broker");
    console.log(`📋 Port rotation: ${PORT_SEQUENCE.join(" → ")}  (every ${INTERVAL_MS / 1000}s)\n`);

    setInterval(() => {
        fCnt     += 1;
        ackCnt    = ackCnt >= 15 ? 0 : ackCnt + 1;

        const fPort = PORT_SEQUENCE[portIndex % PORT_SEQUENCE.length];
        portIndex  += 1;

        const uplink = buildUplink(fPort);
        const bytes  = Buffer.from(uplink.data, "base64");

        client.publish(TOPIC, JSON.stringify(uplink));
        console.log(`📡 [fCnt=${String(fCnt).padStart(3)}] fPort=${fPort}  ${uplink.data}  (${bytes.length}B)`);
    }, INTERVAL_MS);
});

client.on("error", (err) => console.error("❌ MQTT error:", err.message));
