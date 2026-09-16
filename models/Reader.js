const mongoose = require("mongoose");

const readerSchema = new mongoose.Schema(
  {
    readerCode: { type: String, required: [true, "Mã độc giả bắt buộc"], unique: true, trim: true },
    fullName: { type: String, required: [true, "Họ tên bắt buộc"], trim: true },
    email: {
      type: String,
      required: [true, "Email bắt buộc"],
      trim: true,
      lowercase: true,
      match: [/^[^\s@]+@[^\s@]+\.[^\s@]+$/, "Email không hợp lệ"],
    },
    phone: { type: String, trim: true, default: "" },
    className: { type: String, trim: true, default: "" },
    address: { type: String, trim: true, default: "" },
    status: { type: String, enum: ["ACTIVE", "INACTIVE"], default: "ACTIVE" },
  },
  { timestamps: true }
);

module.exports = mongoose.models.Reader || mongoose.model("Reader", readerSchema);