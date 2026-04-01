const startMQTTApp = require("./index");   // your MQTT listener
const startServer = require("./server");   // your express server

async function startApp() {
    try {
        console.log("🚀 Starting full system...\n");

        // Start both services
        await Promise.all([
            startMQTTApp(),
            startServer()
        ]);

        console.log("✅ System fully started\n");

    } catch (err) {
        console.error("❌ Failed to start system:", err.message);
    }
}

startApp();