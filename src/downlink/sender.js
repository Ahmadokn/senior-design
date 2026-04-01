const axios = require("axios");
require("dotenv").config();

async function sendDownlink(buffer) {
    const baseUrl = process.env.CHIRPSTACK_API_URL;
    const devEui = process.env.DEVICE_EUI;
    const fPort = Number.parseInt(process.env.FPORT, 10);

    if (!Number.isInteger(fPort) || fPort < 1 || fPort > 255) {
        throw new Error(`Invalid FPORT in .env: "${process.env.FPORT}"`);
    }

    const payloadBase64 = buffer.toString("base64");
    const url = `${baseUrl}/api/devices/${devEui}/queue`;

    const body = {
        queueItem: {
            confirmed: false,
            fPort: fPort,
            data: payloadBase64
        }
    };

    const res = await axios.post(url, body, {
        headers: {
            "Content-Type": "application/json",
            "Grpc-Metadata-Authorization": `Bearer ${process.env.CHIRPSTACK_API_TOKEN}`
        }
    });

    console.log("FPORT:", process.env.FPORT);
    console.log("Parsed FPORT:", fPort);
    console.log("Downlink queued successfully");
    console.log("HEX:", buffer.toString("hex").toUpperCase());
    console.log("Base64:", payloadBase64);
    console.log("Response:", res.data);
}

module.exports = { sendDownlink };