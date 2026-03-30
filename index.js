const express   = require("express");
const path      = require("path");
const { connectDB }    = require("./services/database");
const { startMQTT }    = require("./services/mqttService");
const { decodeUplink } = require("./decoder/decoder.js");

async function start() {
    const db            = await connectDB();
    const rawCollection = db.collection("decoded");
    const posCollection = db.collection("estimated_positions");

    // ── Express API ───────────────────────────────────────────────────────────
    const app = express();

    // Serve dashboard.html from the same directory as index.js
    app.get("/", (req, res) => {
        res.sendFile(path.join(__dirname, "dashboard.html"));
    });

    // Latest 100 estimated positions, newest first
    app.get("/api/positions", async (req, res) => {
        try {
            const positions = await posCollection
                .find()
                .sort({ estimatedAt: -1 })
                .limit(100)
                .toArray();
            res.json(positions);
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    app.listen(3000, () => console.log("🌐 Dashboard → http://localhost:3000"));

    // ── MQTT → decode → store ─────────────────────────────────────────────────
    startMQTT(async (topic, message) => {
        try {
            const data  = JSON.parse(message.toString());
            const fPort = data.fPort;

            const bytes = Array.from(Buffer.from(data.data, "base64"));

            if (!bytes.length || fPort === undefined) {
                console.warn("⚠️ Skipping message — missing data or fPort");
                return;
            }

            const result  = decodeUplink({ bytes, fPort });
            const decoded = result.data;

            await rawCollection.insertOne({
                receivedAt:     new Date(),
                topic,
                deviceName:     data.deviceInfo?.deviceName   ?? null,
                devEui:         data.deviceInfo?.devEui        ?? null,
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