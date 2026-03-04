const { connectDB } = require("./services/database");
const { startMQTT } = require("./services/mqttService");
const { decodeUplink } = require("./decoder/decoder.js");

async function start() {
    const db = await connectDB();
    const rawCollection = db.collection("decoded");

    startMQTT(async (topic, message) => {
        try {
            const data  = JSON.parse(message.toString());
            const fPort = data.fPort;

            // Company decoder expects a plain byte array, not a Buffer
            const bytes = Array.from(Buffer.from(data.data, "base64"));

            if (!bytes.length || fPort === undefined) {
                console.warn("⚠️ Skipping message — missing data or fPort");
                return;
            }

            // Company decoder interface: { bytes, fPort } → { data: {...} }
            const result  = decodeUplink({ bytes, fPort });
            const decoded = result.data;

            await rawCollection.insertOne({
                receivedAt:     new Date(),
                topic,
                deviceName: data.deviceInfo?.deviceName ?? null,                
                devEui:         data.deviceInfo?.devEui     ?? null,
                applicationId:  data.deviceInfo?.applicationId ?? null,
                fPort,
                raw:            data,
                decoded,
                decoderVersion: "mokosmart_company",
            });

            console.log(`📦 Stored | devEui=${data.deviceInfo?.devEui} fPort=${fPort} type=${decoded.payload_type}`);
        } catch (err) {
            console.error("❌ Processing error:", err);
        }
    });
}

start();