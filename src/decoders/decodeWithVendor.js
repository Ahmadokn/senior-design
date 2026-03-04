const { decodeUplink } = require("./vendorTrackerDecoder");

function decodeBase64Payload(base64Payload, fPort) {
    const bytes = Buffer.from(base64Payload, "base64");
    const input = {
        bytes: Array.from(bytes),
        fPort
    };

    return decodeUplink(input);
}

module.exports = { decodeBase64Payload };