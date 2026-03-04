const { connectDB } = require("./services/database");
const { startMQTT } = require("./services/mqttService");
const { decodeBase64Payload } = require("./decoders/decodeWithVendor");
const { sendDownlink } = require("./services/downlinkService");

async function start() {

  const db = await connectDB();
  const rawCollection = db.collection("raw_uplinks");

  console.log("✅ Connected to MongoDB");
  console.log("🚀 Listening for uplinks...\n");

  startMQTT(async (topic, message) => {

    try {

      const data = JSON.parse(message.toString());

      if (!data.data || !data.fPort) return;

      const decoded = decodeBase64Payload(data.data, data.fPort);
      const devEui = data.deviceInfo?.devEui;

      // Store RAW uplink only
      await rawCollection.insertOne({
        receivedAt: new Date(),
        topic,
        raw: data,
        decoderVersion: "vendor_debug_v1"
      });

      console.log("========================================");
      console.log("📡 NEW UPLINK RECEIVED");
      console.log("Device:", data.deviceInfo?.deviceName || "Unknown");
      console.log("DevEUI:", devEui || "Unknown");
      console.log("FPort:", data.fPort);
      console.log("----------------------------------------");
      console.log("Decoded:");
      console.log(JSON.stringify(decoded, null, 2));
      console.log("========================================\n");

      // Loop prevention:
      // only send downlink when uplink is on FPort 8
      if (devEui && data.fPort === 8) {
        console.log("📤 FPort 8 detected → sending downlink to", devEui);
        sendDownlink(devEui);
      }

    } catch (err) {

      console.error("Processing error:", err.message);

    }

  });

}

start();