require("dotenv").config();

module.exports = {
    MONGO_URI: process.env.MONGO_URI,
    MQTT_URL: process.env.MQTT_URL || "mqtt://localhost:1883"
};