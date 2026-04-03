const mqtt = require("mqtt");

const client = mqtt.connect("mqtt://localhost:1883");

const TOPIC =
    "application/5115682e-d471-4e59-89e6-32ebafe1f2db/device/e2efd4ffffe0d875/event/up";

const DEV_EUI = "e2efd4ffffe0d875";

// Beacon MACs from your real data
const BEACONS = [
    { mac: "eb8474d6160d", baseRssi: -46 },
    { mac: "edf17c4662d0", baseRssi: -55 },
    { mac: "def779e5366b", baseRssi: -60 }
];

let frameCounter = 0;

function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
}

function hexToBytes(hex) {
    return Buffer.from(hex, "hex");
}

function encodeSignedByte(value) {
    return (256 + value) & 0xff;
}

function randomRssi(base) {
    return clamp(base + Math.floor(Math.random() * 7) - 3, -100, -20);
}

function buildFport2Payload() {
    const now = new Date();

    const year = now.getUTCFullYear();
    const month = now.getUTCMonth() + 1;
    const day = now.getUTCDate();
    const hour = now.getUTCHours();
    const minute = now.getUTCMinutes();
    const second = now.getUTCSeconds();

    const payload = [];

    // Byte 0: flags
    // operation_mode = Periodic mode -> bits 0..1 = 01
    // battery_level normal -> bit 2 = 0
    // tamper not triggered -> bit 3 = 0
    // man down not idle -> bit 4 = 0
    // motion since last payload no -> bit 5 = 0
    // positioning_type normal -> bit 6 = 0
    // charging no -> bit 7 = 0
    payload.push(0x01);

    // Byte 1: temperature = 18°C
    payload.push(18);

    // Byte 2: humidity = 61%
    payload.push(61);

    // Byte 3: high nibble battery voltage, low nibble ack
    // 3.9V => (28 + nibble)/10 = 3.9 => nibble = 11 => 0xB
    // ack = 0
    payload.push(0xb0);

    // Byte 4: battery percent = 92%
    payload.push(92);

    // Byte 5: position success type = 1 => Bluetooth positioning success
    payload.push(0x01);

    // Bytes 6-7: year
    payload.push((year >> 8) & 0xff);
    payload.push(year & 0xff);

    // Bytes 8-13: month, day, hour, minute, second, timezone
    payload.push(month);
    payload.push(day);
    payload.push(hour);
    payload.push(minute);
    payload.push(second);

    // timezone = 0
    payload.push(0x00);

    // Byte 14: data length = 3 beacons * 7 bytes each = 21
    payload.push(BEACONS.length * 7);

    // Beacon MAC + RSSI
    for (const beacon of BEACONS) {
        const macBytes = hexToBytes(beacon.mac);
        for (const b of macBytes) {
            payload.push(b);
        }

        const rssi = randomRssi(beacon.baseRssi);
        payload.push(encodeSignedByte(rssi));
    }

    return Buffer.from(payload);
}

client.on("connect", () => {
    console.log("🚀 Simulator connected to MQTT");

    setInterval(() => {
        frameCounter += 1;

        const payloadBuffer = buildFport2Payload();
        const payloadBase64 = payloadBuffer.toString("base64");

        const uplink = {
            deduplicationId: Math.random().toString(36).substring(2),
            time: new Date().toISOString(),
            isSimulated: true,
            deviceInfo: {
                tenantId: "sim-tenant",
                tenantName: "MyNetwork",
                applicationId: "5115682e-d471-4e59-89e6-32ebafe1f2db",
                applicationName: "Trackers",
                deviceProfileId: "sim-profile",
                deviceProfileName: "Tracker",
                deviceName: "Sim Tracker",
                devEui: DEV_EUI,
                deviceClassEnabled: "CLASS_A",
                tags: {}
            },
            devAddr: "0110c985",
            adr: true,
            dr: 5,
            fCnt: frameCounter,
            fPort: 2,
            confirmed: false,
            data: payloadBase64,
            rxInfo: [
                {
                    gatewayId: "e43819fffe2621cc",
                    uplinkId: Math.floor(Math.random() * 100000),
                    nsTime: new Date().toISOString(),
                    rssi: -40 - Math.floor(Math.random() * 20),
                    snr: Number((8 + Math.random() * 6).toFixed(1)),
                    channel: 6,
                    location: {},
                    context: "simctx==",
                    crcStatus: "CRC_OK"
                }
            ],
            txInfo: {
                frequency: 867700000,
                modulation: {
                    lora: {
                        bandwidth: 125000,
                        spreadingFactor: 7,
                        codeRate: "CR_4_5"
                    }
                }
            },
            regionConfigId: "eu868"
        };

        client.publish(TOPIC, JSON.stringify(uplink));

        console.log("📡 Simulated uplink sent");
        console.log("Base64:", payloadBase64);
        console.log("Hex:", payloadBuffer.toString("hex"));
    }, 5000);
});