import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import { PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { connectToDatabase } from "./db.js";
import { Admin } from "./models/Admin.js";
import { Upload } from "./models/Upload.js";
import { getR2Bucket, getR2Client } from "./r2.js";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

app.get("/api/health", (req, res) => {
  res.json({ status: "ok", service: "Hendrix Play API" });
});

function requireAdminApiKey(req, res, next) {
  const expected = process.env.ADMIN_API_KEY || process.env.ADMIN_SETUP_KEY;
  if (!expected)
    return res.status(500).json({ error: "Server missing ADMIN_API_KEY" });

  const provided = req.headers["x-admin-key"];
  if (!provided || provided !== expected)
    return res.status(401).json({ error: "Unauthorized" });

  return next();
}

// One-time route to create the single admin.
// Protect it with ADMIN_SETUP_KEY so random people can't create an admin.
app.post("/api/admin/setup", async (req, res) => {
  try {
    const setupKey = req.headers["x-setup-key"];
    if (
      !process.env.ADMIN_SETUP_KEY ||
      setupKey !== process.env.ADMIN_SETUP_KEY
    ) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const { email, password } = req.body ?? {};
    if (!email || !password) {
      return res.status(400).json({ error: "Missing email or password" });
    }

    const existing = await Admin.findOne({});
    if (existing) {
      return res.status(409).json({ error: "Admin already exists" });
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const admin = await Admin.create({ email, passwordHash });

    return res
      .status(201)
      .json({ ok: true, admin: { id: admin._id, email: admin.email } });
  } catch (err) {
    return res.status(500).json({ error: "Setup failed" });
  }
});

// R2: create a presigned URL to upload directly to R2.
app.post("/api/uploads/presign", requireAdminApiKey, async (req, res) => {
  try {
    const { filename, contentType, size } = req.body ?? {};
    if (!filename || !contentType || !size) {
      return res
        .status(400)
        .json({ error: "Missing filename, contentType, or size" });
    }

    // Basic safety limits (adjust later).
    if (Number(size) > 1024 * 1024 * 1024) {
      return res.status(413).json({ error: "File too large (max 1GB)" });
    }

    const safeName = String(filename)
      .replace(/[^a-zA-Z0-9._-]/g, "_")
      .slice(0, 120);
    const ext = safeName.includes(".") ? safeName.split(".").pop() : "";
    const rand = crypto.randomBytes(16).toString("hex");
    const key = `uploads/${Date.now()}-${rand}${ext ? `.${ext}` : ""}`;

    const r2 = getR2Client();
    const Bucket = getR2Bucket();
    const command = new PutObjectCommand({
      Bucket,
      Key: key,
      ContentType: String(contentType),
    });

    const uploadUrl = await getSignedUrl(r2, command, { expiresIn: 60 * 5 }); // 5 minutes

    const doc = await Upload.create({
      key,
      originalName: String(filename),
      contentType: String(contentType),
      size: Number(size),
      status: "pending",
    });

    return res.json({
      uploadId: doc._id,
      key,
      uploadUrl,
      expiresInSeconds: 300,
    });
  } catch (err) {
    return res.status(500).json({ error: "Failed to presign upload" });
  }
});

// R2: get a presigned download URL for an uploaded object.
app.get("/api/uploads/:id/url", requireAdminApiKey, async (req, res) => {
  try {
    const doc = await Upload.findById(req.params.id);
    if (!doc) return res.status(404).json({ error: "Not found" });

    const r2 = getR2Client();
    const Bucket = getR2Bucket();
    const command = new GetObjectCommand({
      Bucket,
      Key: doc.key,
      ResponseContentType: doc.contentType,
    });

    const downloadUrl = await getSignedUrl(r2, command, { expiresIn: 60 * 10 }); // 10 minutes
    return res.json({
      id: doc._id,
      key: doc.key,
      downloadUrl,
      expiresInSeconds: 600,
    });
  } catch {
    return res.status(500).json({ error: "Failed to presign download" });
  }
});

// Simple login check (returns ok true/false). No sessions/JWT yet.
app.post("/api/admin/login", async (req, res) => {
  try {
    const { email, password } = req.body ?? {};
    if (!email || !password)
      return res.status(400).json({ error: "Missing email or password" });

    const admin = await Admin.findOne({
      email: String(email).toLowerCase().trim(),
    });
    if (!admin) return res.status(401).json({ ok: false });

    const ok = await bcrypt.compare(password, admin.passwordHash);
    if (!ok) return res.status(401).json({ ok: false });

    return res.json({ ok: true, email: admin.email });
  } catch {
    return res.status(500).json({ error: "Login failed" });
  }
});

connectToDatabase()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`Hendrix Play backend running on port ${PORT}`);
    });
  })
  .catch((err) => {
    console.error("Failed to connect to MongoDB:", err?.message || err);
    process.exit(1);
  });
