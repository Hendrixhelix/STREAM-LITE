import crypto from "crypto";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export function getUploadDir() {
  const configured = process.env.UPLOAD_DIR;
  if (configured) {
    return path.isAbsolute(configured)
      ? configured
      : path.resolve(process.cwd(), configured);
  }
  return path.join(__dirname, "uploads");
}

export function ensureUploadDir() {
  const dir = getUploadDir();
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

export function generateStorageKey(filename) {
  const safeName = String(filename)
    .replace(/[^a-zA-Z0-9._-]/g, "_")
    .slice(0, 120);
  const ext = safeName.includes(".") ? safeName.split(".").pop() : "";
  const rand = crypto.randomBytes(16).toString("hex");
  return `${Date.now()}-${rand}${ext ? `.${ext}` : ""}`;
}

export function getFilePath(key) {
  return path.join(getUploadDir(), path.basename(key));
}

export function fileExists(key) {
  return fs.existsSync(getFilePath(key));
}

export function streamFile(req, res, filePath, contentType) {
  const stat = fs.statSync(filePath);
  const fileSize = stat.size;
  const range = req.headers.range;

  if (range) {
    const parts = range.replace(/bytes=/, "").split("-");
    const start = parseInt(parts[0], 10);
    const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;

    if (start >= fileSize || end >= fileSize) {
      res.status(416).set("Content-Range", `bytes */${fileSize}`).end();
      return;
    }

    const chunkSize = end - start + 1;
    res.writeHead(206, {
      "Content-Range": `bytes ${start}-${end}/${fileSize}`,
      "Accept-Ranges": "bytes",
      "Content-Length": chunkSize,
      "Content-Type": contentType,
    });
    fs.createReadStream(filePath, { start, end }).pipe(res);
    return;
  }

  res.writeHead(200, {
    "Content-Length": fileSize,
    "Content-Type": contentType,
    "Accept-Ranges": "bytes",
  });
  fs.createReadStream(filePath).pipe(res);
}
