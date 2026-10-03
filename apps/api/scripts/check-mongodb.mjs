import { config } from "dotenv";
import { MongoClient } from "mongodb";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";

config({ path: fileURLToPath(new URL("../.env", import.meta.url)), quiet: true });
if (!process.env.MONGODB_URI) {
  console.error("MONGODB_URI is missing from apps/api/.env.");
  process.exit(1);
}

const client = new MongoClient(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 10000 });
try {
  await client.connect();
  const db = client.db(process.env.MONGODB_DB ?? "analytiq");
  await db.command({ ping: 1 });
  // A uniquely tagged, expiring record verifies writes without creating a user.
  const collection = db.collection("verification");
  const identifier = `analytiq-connection-check-${randomUUID()}`;
  const { insertedId } = await collection.insertOne({ identifier, value: "connection-check", expiresAt: new Date(Date.now() + 60000), createdAt: new Date(), updatedAt: new Date() });
  try {
    if (!await collection.findOne({ _id: insertedId, identifier })) throw new Error("READ_CHECK_FAILED");
    console.log("MongoDB connection, authentication, write, and read checks passed.");
    console.log(`Database: ${db.databaseName}`);
  } finally {
    await collection.deleteOne({ _id: insertedId, identifier });
  }
} catch (error) {
  // Driver messages can contain connection details. Print only diagnostic codes.
  console.error(`MongoDB check failed (${error.name}; code: ${error.code ?? error.cause?.code ?? "unknown"}).`);
  process.exitCode = 1;
} finally {
  await client.close();
}
