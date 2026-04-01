// const { connectDB } = require("./services/database");
// const { startMQTT } = require("./services/mqttService");
// const { decodeBase64Payload } = require("./decoders/decodeWithVendor");
// const { sendDownlink } = require("./services/downlinkService");

// async function start() {

//   const db = await connectDB();
//   const rawCollection = db.collection("raw_uplinks");

//   console.log("✅ Connected to MongoDB");
//   console.log("🚀 Listening for uplinks...\n");

//   startMQTT(async (topic, message) => {

//     try {

//       const data = JSON.parse(message.toString());

//       if (!data.data || !data.fPort) return;

//       const decoded = decodeBase64Payload(data.data, data.fPort);
//       const devEui = data.deviceInfo?.devEui;

//       // Store RAW uplink only
//       await rawCollection.insertOne({
//         receivedAt: new Date(),
//         topic,
//         raw: data,
//         decoderVersion: "vendor_debug_v1"
//       });

//       console.log("========================================");
//       console.log("📡 NEW UPLINK RECEIVED");
//       console.log("Device:", data.deviceInfo?.deviceName || "Unknown");
//       console.log("DevEUI:", devEui || "Unknown");
//       console.log("FPort:", data.fPort);
//       console.log("----------------------------------------");
//       console.log("Decoded:");
//       console.log(JSON.stringify(decoded, null, 2));
//       console.log("========================================\n");

//       // Loop prevention:
//       // only send downlink when uplink is on FPort 8
//       // if (devEui && data.fPort === 8) {
//       //   console.log("📤 FPort 8 detected → sending downlink to", devEui);
//       //   sendDownlink(devEui);
//       // }

//     } catch (err) {

//       console.error("Processing error:", err.message);

//     }

//   });

// }

// start();


const { connectDB } = require("./services/database");
const { startMQTT } = require("./services/mqttService");
const { decodeBase64Payload } = require("./decoders/decodeWithVendor");

async function start() {
  const db = await connectDB();
  const decodedCollection = db.collection("decoded");

  console.log("✅ Connected to MongoDB");
  console.log("🚀 Listening for uplinks...\n");

  startMQTT(async (topic, message) => {
    try {
      const data = JSON.parse(message.toString());

      if (!data.data || !data.fPort) return;

      // Only process and store fPort 2 uplinks
      if (data.fPort !== 2) return;

      const decoded = decodeBase64Payload(data.data, data.fPort);
      const devEui = data.deviceInfo?.devEui;
      const deviceName = data.deviceInfo?.deviceName || "Unknown";

      // Store decoded only, in the structure expected by trilateration.py
      await decodedCollection.insertOne({
        receivedAt: new Date(),
        topic,
        fPort: data.fPort,
        devEui,
        deviceName,
        decoded: decoded.data,
        decoderVersion: "vendor_debug_v1"
      });

      console.log("========================================");
      console.log("📡 NEW UPLINK RECEIVED");
      console.log("Device:", deviceName);
      console.log("DevEUI:", devEui || "Unknown");
      console.log("FPort:", data.fPort);
      console.log("----------------------------------------");
      console.log("Stored decoded document:");
      console.log(JSON.stringify({
        receivedAt: new Date(),
        topic,
        fPort: data.fPort,
        devEui,
        deviceName,
        decoded: decoded.data,
        decoderVersion: "vendor_debug_v1"
      }, null, 2));
      console.log("========================================\n");

    } catch (err) {
      console.error("Processing error:", err.message);
    }
  });
}

module.exports = start;