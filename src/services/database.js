// const { MongoClient } = require("mongodb");
// const { MONGO_URI } = require("../config");

// let client;

// async function connectDB() {
//     if (!client) {
//         client = new MongoClient(MONGO_URI);
//         await client.connect();
//         console.log("✅ MongoDB connected");
//     }
//     return client.db("loraDB");
// }

// module.exports = { connectDB };

const { MongoClient } = require("mongodb");
const { MONGO_URI } = require("../config");

let client = null;
let db = null;
let connectionPromise = null;

async function connectDB() {
    if (db) {
        return db;
    }

    if (connectionPromise) {
        return connectionPromise;
    }

    connectionPromise = (async () => {
        client = new MongoClient(MONGO_URI);
        await client.connect();
        db = client.db("loraDB");
        console.log("✅ MongoDB connected");
        return db;
    })();

    try {
        return await connectionPromise;
    } catch (err) {
        client = null;
        db = null;
        connectionPromise = null;
        throw err;
    }
}

module.exports = { connectDB };