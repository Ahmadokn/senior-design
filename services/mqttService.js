const mqtt = require("mqtt");
const { MQTT_URL } = require("../config");

function startMQTT(onMessageCallback) {
    const client = mqtt.connect(MQTT_URL);

    client.on("connect", () => {
        console.log("✅ Connected to MQTT");
        client.subscribe("application/+/device/+/event/up");
    });

    client.on("message", (topic, message) => {
        onMessageCallback(topic, message);
    });

    return client;
}

module.exports = { startMQTT };