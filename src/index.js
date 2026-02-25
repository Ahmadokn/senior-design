const { connectDB } = require("./services/database");
const { startMQTT } = require("./services/mqttService");
const { decodeCommonHeader } = require("./decoders/lw001Decoder_v1");

async function start() {
  const db = await connectDB();
  const rawCollection = db.collection("raw_uplinks");

  startMQTT(async (topic, message) => {
    try {
      const data = JSON.parse(message.toString());
      const buffer = Buffer.from(data.data, "base64");

      const decodedHeader = decodeCommonHeader(buffer);

      await rawCollection.insertOne({
        receivedAt: new Date(),
        topic,
        raw: data,
        decodedHeader,
        decoderVersion: "lw001_v1"
      });

      console.log("📦 Stored uplink with decoded header");
    } catch (err) {
      console.error("Processing error:", err);
    }
  });
}

start();