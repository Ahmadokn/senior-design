const express = require("express");
const path = require("path");
const { connectDB } = require("./services/database");
const {
    getLatestConfig,
    saveConfig,
    getLiveBeacons,
    computePositions
} = require("./services/positioningService");

async function startServer() {
    const app = express();
    const db = await connectDB();

    app.use(express.json());
    app.use(express.static(path.join(__dirname, "..", "public")));

    app.get("/api/health", (req, res) => {
        res.json({ ok: true, message: "Server is running" });
    });

    app.get("/api/live-beacons", async (req, res) => {
        try {
            const beacons = await getLiveBeacons(db);
            res.json(beacons);
        } catch (err) {
            console.error("Error fetching live beacons:", err.message);
            res.status(500).json({ error: "Failed to fetch live beacons" });
        }
    });

    app.get("/api/config", async (req, res) => {
        try {
            const config = await getLatestConfig(db);
            res.json(config);
        } catch (err) {
            console.error("Error fetching config:", err.message);
            res.status(500).json({ error: "Failed to fetch config" });
        }
    });

    app.post("/api/config", async (req, res) => {
        try {
            const body = req.body || {};

            if (!body.room || !Array.isArray(body.room.polygon) || body.room.polygon.length < 3) {
                return res.status(400).json({ error: "room.polygon with at least 3 points is required" });
            }

            if (!Array.isArray(body.beacons) || body.beacons.length < 3) {
                return res.status(400).json({ error: "At least 3 beacons are required" });
            }

            for (const beacon of body.beacons) {
                if (
                    typeof beacon.mac !== "string" ||
                    typeof beacon.x !== "number" ||
                    typeof beacon.y !== "number"
                ) {
                    return res.status(400).json({ error: "Each beacon must include mac, x, and y" });
                }
            }

            const saved = await saveConfig(db, body);
            res.json(saved);
        } catch (err) {
            console.error("Error saving config:", err.message);
            res.status(500).json({ error: "Failed to save config" });
        }
    });

    app.get("/api/positions", async (req, res) => {
        try {
            const positions = await computePositions(db);
            res.json(positions);
        } catch (err) {
            console.error("Error computing positions:", err.message);
            res.status(500).json({ error: "Failed to compute positions" });
        }
    });

    const PORT = process.env.PORT || 3000;
    app.listen(PORT, () => {
        console.log(`✅ Web server running on http://localhost:${PORT}`);
    });
}

module.exports = startServer;