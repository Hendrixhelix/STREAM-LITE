import mongoose from "mongoose";

const UploadSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, unique: true }, // R2 object key
    originalName: { type: String, required: true },
    contentType: { type: String, required: true },
    size: { type: Number, required: true },
    status: { type: String, enum: ["pending", "uploaded"], default: "pending" },
  },
  { timestamps: true }
);

export const Upload = mongoose.models.Upload || mongoose.model("Upload", UploadSchema);

