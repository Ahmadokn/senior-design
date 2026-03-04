const mqtt = require("mqtt");

const MQTT_URL    = "mqtt://localhost:1883";
const TOPIC       = "application/5115682e-d471-4e59-89e6-32ebafe1f2db/device/e2efd4ffffe0d875/event/up";
const INTERVAL_MS = 5000;

let fCnt = 0;
const PORT_SEQUENCE = [1, 2, 3, 4];

const PAYLOADS = {
    1: "ARIwwF8DgQAAAAE=",
    2: "gxA6sl0AB+oCHAsdDAAV5DgZJiHM09jsXskigNIOttJCr3a/",
    3: "ARIwwF4EAOC7wu+7wg==",
    4: "ARIwwF4C",
};

// Simulate realistic RSSI/SNR variance each uplink
function randomRssi() { return Math.floor(Math.random() * 40) - 110; } // -110 to -70
function randomSnr()  { return Math.round((Math.random() * 20 - 5) * 10) / 10; } // -5 to 15

function buildUplink(fPort) {
    return {
        deduplicationId: crypto.randomUUID(),
        time:            new Date().toISOString(),
        deviceInfo: {
            tenantId:          "16932eac-f8fd-43a7-ad13-eb7e14e84950",
            tenantName:        "MyNetwork",
            applicationId:     "5115682e-d471-4e59-89e6-32ebafe1f2db",
            applicationName:   "Trackers",
            deviceProfileId:   "f16e4c02-721b-4900-8fac-60664894c41f",
            deviceProfileName: "Tracker",
            deviceName:        "Tracker 1",
            devEui:            "e2efd4ffffe0d875",
            deviceClassEnabled: "CLASS_A",
            tags:              {},
        },
        devAddr:   "01d54164",
        adr:       true,
        dr:        5,
        fCnt,
        fPort,
        confirmed: false,
        data:      PAYLOADS[fPort],
        rxInfo: [
            {
                gatewayId: "e43819fffe2621cc",
                uplinkId:  Math.floor(Math.random() * 65535),
                nsTime:    new Date().toISOString(),
                rssi:      randomRssi(),
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

const client = mqtt.connect(MQTT_URL);

client.on("connect", () => {
    console.log("🚀 Simulator connected");

    setInterval(() => {
        fCnt++;
        const fPort  = PORT_SEQUENCE[(fCnt - 1) % PORT_SEQUENCE.length];
        const uplink = buildUplink(fPort);
        client.publish(TOPIC, JSON.stringify(uplink));
        console.log(`📡 Stored | fPort=${fPort}  fCnt=${fCnt}`);
    }, INTERVAL_MS);
});

client.on("error", (err) => console.error("❌", err.message));