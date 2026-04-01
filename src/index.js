const { connectDB } = require("./services/database");
const { startMQTT } = require("./services/mqttService");
const { decodeBase64Payload } = require("./decoders/decodeWithVendor");

async function startMQTTApp() {
  const db = await connectDB();
  const decodedCollection = db.collection("decoded");

  console.log("✅ Connected to MongoDB");
  console.log("🚀 Listening for uplinks...\n");

  startMQTT(async (topic, message) => {
    try {
      const data = JSON.parse(message.toString());

      if (!data.data || !data.fPort) return;

      const devEui = data.deviceInfo?.devEui;
      const deviceName = data.deviceInfo?.deviceName || "Unknown";

      let decoded = null;

      try {
        decoded = decodeBase64Payload(data.data, data.fPort);
      } catch (decodeErr) {
        console.error(`Decode error on fPort ${data.fPort}:`, decodeErr.message);
      }

      console.log("========================================");
      console.log("📡 NEW UPLINK RECEIVED");
      console.log("Device:", deviceName);
      console.log("DevEUI:", devEui || "Unknown");
      console.log("FPort:", data.fPort);
      console.log("----------------------------------------");

      if (decoded) {
        console.log("Decoded:");
        console.log(JSON.stringify(decoded, null, 2));
      } else {
        console.log("Decoded:");
        console.log("No decoded output available");
      }

      // Only store fPort 2 uplinks in MongoDB
      if (data.fPort === 2) {
        const docToStore = {
          receivedAt: new Date(),
          topic,
          fPort: data.fPort,
          devEui,
          deviceName,
          decoded: decoded?.data ?? null,
          decoderVersion: "vendor_debug_v1"
        };

        await decodedCollection.insertOne(docToStore);

        console.log("----------------------------------------");
        console.log("Stored decoded document:");
        console.log(JSON.stringify(docToStore, null, 2));
      } else {
        console.log("----------------------------------------");
        console.log(`Not stored in DB because fPort is ${data.fPort}, not 2`);
      }

      console.log("========================================\n");
    } catch (err) {
      console.error("Processing error:", err.message);
    }
  });
}

module.exports = startMQTTApp;