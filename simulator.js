const mqtt = require("mqtt");
// const { v4: uuidv4 } = require("uuid");

const client = mqtt.connect("mqtt://localhost:1883");

client.on("connect", () => {
    console.log("🚀 Simulator connected to MQTT");

    setInterval(() => {
        const uplink = {
            deduplicationId: Math.random().toString(36).substring(2),
            time: new Date().toISOString(),
            deviceInfo: {
                tenantId: "sim-tenant",
                applicationId: "sim-app",
                deviceProfileId: "sim-profile",
                deviceName: "Sim Tracker",
                devEui: "e2efd4ffffe0d875",
                deviceClassEnabled: "CLASS_A"
            },
            devAddr: "01d54164",
            adr: true,
            dr: 5,
            fCnt: Math.floor(Math.random() * 100),
            fPort: 4,
            confirmed: false,
            data: "ARg5wF4C",
            rxInfo: [
                {
                    gatewayId: "e43819fffe2621cc",
                    rssi: -70 - Math.random() * 20,
                    snr: 5 + Math.random() * 10,
                    channel: 7,
                    crcStatus: "CRC_OK"
                }
            ],
            txInfo: {
                frequency: 867900000,
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

        client.publish(
            "application/5115682e-d471-4e59-89e6-32ebafe1f2db/device/e2efd4ffffe0d875/event/up",
            JSON.stringify(uplink)
        );

        console.log("📡 Simulated uplink sent");
    }, 5000);
});