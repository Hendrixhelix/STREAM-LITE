import mongoose from "mongoose";

export async function connectToDatabase() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    throw new Error("Missing MONGODB_URI in environment");
  }

  // Avoid creating extra connections in dev restarts.
  if (mongoose.connection.readyState === 1) return mongoose.connection;

  await mongoose.connect(uri, {
    // These options are defaults in modern mongoose; leaving empty is fine.
  });

  return mongoose.connection;
}

