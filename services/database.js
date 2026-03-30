const { MongoClient } = require("mongodb");
const { MONGO_URI } = require("../config");

let client;

async function connectDB() {
    if (!client) {
        client = new MongoClient(MONGO_URI);
        await client.connect();
        console.log("✅ MongoDB connected");
    }
    return client.db("loraDB");
}

module.exports = { connectDB };