const { connectDB } = require("./services/database");
const { startMQTT } = require("./services/mqttService");
const { decodeByFport } = require("./decoders/lw001Decoder_v2");

async function start() {
    const db = await connectDB();
    const rawCollection = db.collection("raw_uplinks");

    startMQTT(async (topic, message) => {
        try {
            const data   = JSON.parse(message.toString());
            const buffer = Buffer.from(data.data, "base64");
            const decoded = decodeByFport(data.fPort, buffer);

            await rawCollection.insertOne({
                receivedAt:     new Date(),
                topic,
                raw:            data,
                decoded,
                decoderVersion: "lw001_v2",
            });

            console.log(`📦 Stored | fPort=${data.fPort} type=${decoded.type}`);
        } catch (err) {
            console.error("Processing error:", err);
        }
    });
}

start();
