import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import multer from "multer";
import { connectToDatabase } from "./db.js";
import { Upload } from "./models/Upload.js";
import {
  ensureUploadDir,
  fileExists,
  generateStorageKey,
  getFilePath,
  getUploadDir,
  streamFile,
} from "./storage.js";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;
const MAX_UPLOAD_BYTES = 50 * 1024 * 1024; // 50 MB — plenty for MP3s

ensureUploadDir();

function isMp3(file) {
  const name = String(file.originalname || "").toLowerCase();
  const mime = String(file.mimetype || "").toLowerCase();
  return name.endsWith(".mp3") || mime === "audio/mpeg" || mime === "audio/mp3";
}

const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => {
      cb(null, getUploadDir());
    },
    filename: (req, file, cb) => {
      req.generatedKey = generateStorageKey(file.originalname);
      cb(null, req.generatedKey);
    },
  }),
  limits: { fileSize: MAX_UPLOAD_BYTES },
  fileFilter: (_req, file, cb) => {
    if (isMp3(file)) return cb(null, true);
    cb(new Error("Only MP3 files are allowed"));
  },
});

app.use(cors());
app.use(express.json());

app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", service: "Hendrix Play API" });
});

// List all tracks (newest first) — public, no login.
app.get("/api/tracks", async (_req, res) => {
  try {
    const tracks = await Upload.find({ status: "uploaded" })
      .sort({ createdAt: -1 })
      .select("originalName contentType size createdAt");

    return res.json({
      tracks: tracks.map((t) => ({
        id: t._id,
        title: t.originalName.replace(/\.mp3$/i, ""),
        streamUrl: `/api/tracks/${t._id}/stream`,
        size: t.size,
        uploadedAt: t.createdAt,
      })),
    });
  } catch {
    return res.status(500).json({ error: "Failed to list tracks" });
  }
});

// Upload an MP3 — public, no login.
app.post("/api/tracks", upload.single("file"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "Missing file" });
    }

    const key = req.generatedKey || req.file.filename;
    const doc = await Upload.create({
      key,
      originalName: req.file.originalname,
      contentType: "audio/mpeg",
      size: req.file.size,
      status: "uploaded",
    });

    return res.status(201).json({
      id: doc._id,
      title: doc.originalName.replace(/\.mp3$/i, ""),
      streamUrl: `/api/tracks/${doc._id}/stream`,
      size: doc.size,
      uploadedAt: doc.createdAt,
    });
  } catch {
    return res.status(500).json({ error: "Failed to upload track" });
  }
});

// Stream an MP3 with Range support for seeking.
app.get("/api/tracks/:id/stream", async (req, res) => {
  try {
    const doc = await Upload.findById(req.params.id);
    if (!doc) return res.status(404).json({ error: "Not found" });

    const filePath = getFilePath(doc.key);
    if (!fileExists(doc.key)) {
      return res.status(404).json({ error: "File missing on disk" });
    }

    streamFile(req, res, filePath, doc.contentType);
  } catch {
    return res.status(500).json({ error: "Failed to stream track" });
  }
});

app.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    if (err.code === "LIMIT_FILE_SIZE") {
      return res.status(413).json({ error: "File too large (max 50MB)" });
    }
    return res.status(400).json({ error: err.message });
  }
  if (err?.message === "Only MP3 files are allowed") {
    return res.status(400).json({ error: err.message });
  }
  return next(err);
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
