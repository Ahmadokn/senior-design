require("dotenv").config();

const mqtt = require("mqtt");
const { MongoClient } = require("mongodb");

const MONGO_URI = process.env.MONGO_URI;
const MQTT_URL = process.env.MQTT_URL || "mqtt://localhost:1883";
const MQTT_TOPIC = process.env.MQTT_TOPIC || "application/+/device/+/event/up";

let mongoClient;
let mqttClient;

async function start() {
  try {
    if (!MONGO_URI) {
      throw new Error("MONGO_URI is not defined in .env file");
    }

    // Connect to MongoDB
    mongoClient = new MongoClient(MONGO_URI);
    await mongoClient.connect();
    console.log("✅ MongoDB connected");

    const db = mongoClient.db(process.env.DB_NAME || "loraDB");
    const rawCollection = db.collection(process.env.COLLECTION_NAME || "raw_uplinks");

    // Connect to MQTT
    mqttClient = mqtt.connect(MQTT_URL);

    mqttClient.on("connect", () => {
      console.log("✅ Connected to MQTT broker");
      mqttClient.subscribe(MQTT_TOPIC);
      console.log(`📡 Subscribed to topic: ${MQTT_TOPIC}`);
    });

    mqttClient.on("message", async (topic, message) => {
      try {
        const data = JSON.parse(message.toString());

        await rawCollection.insertOne({
          meta: {
            receivedAt: new Date(),
            topic: topic,
          },
          uplink: data,
          processed: false,
        });

        console.log("📦 Stored uplink in MongoDB");
      } catch (err) {
        console.error("❌ Error processing MQTT message:", err.message);
      }
    });

    mqttClient.on("error", (err) => {
      console.error("❌ MQTT Error:", err.message);
    });

  } catch (err) {
    console.error("❌ Failed to start:", err.message);
    process.exit(1);
  }
}

// Graceful shutdown (important for research stability)
process.on("SIGINT", async () => {
  console.log("\n🛑 Shutting down...");

  if (mqttClient) mqttClient.end();
  if (mongoClient) await mongoClient.close();

  console.log("✅ Clean shutdown complete");
  process.exit(0);
});

start();