const grpc = require("@grpc/grpc-js");
const device_grpc = require("@chirpstack/chirpstack-api/api/device_grpc_pb");
const device_pb = require("@chirpstack/chirpstack-api/api/device_pb");

const CHIRPSTACK_SERVER = "localhost:8080";
const API_TOKEN = process.env.CHIRPSTACK_API_TOKEN;

// Create ChirpStack DeviceService client
const deviceService = new device_grpc.DeviceServiceClient(
    CHIRPSTACK_SERVER,
    grpc.credentials.createInsecure()
);

// Create metadata with API token
const metadata = new grpc.Metadata();
metadata.set("authorization", "Bearer " + API_TOKEN);

function sendDownlink(devEui) {

    try {

        const payloadHex = "0001";
        const payloadBuffer = Buffer.from(payloadHex, "hex");

        // Create queue item
        const item = new device_pb.DeviceQueueItem();
        item.setDevEui(devEui);
        item.setFPort(10);
        item.setConfirmed(false);
        item.setData(payloadBuffer);

        // Create enqueue request
        const enqueueReq = new device_pb.EnqueueDeviceQueueItemRequest();
        enqueueReq.setQueueItem(item);

        deviceService.enqueue(enqueueReq, metadata, (err, resp) => {

            if (err) {
                console.error("❌ Downlink error:", err.message);
                return;
            }

            console.log("📤 Downlink queued");
            console.log("Queue ID:", resp.getId());

        });

    } catch (err) {

        console.error("❌ Downlink preparation error:", err.message);

    }

}

module.exports = { sendDownlink };