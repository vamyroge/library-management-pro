const mongoose = require("mongoose");

const bookSchema = new mongoose.Schema(
  {
    title: { type: String, required: [true, "Tên sách bắt buộc"], trim: true },
    isbn: { type: String, required: [true, "ISBN bắt buộc"], unique: true, trim: true },
    author: { type: String, required: true, trim: true },
    category: { type: String, trim: true, default: "Khác" },
    publisher: { type: String, trim: true, default: "" },
    publishYear: {
      type: Number,
      validate: {
        validator: (v) => v == null || (v >= 1000 && v <= new Date().getFullYear() + 1),
        message: "Năm xuất bản không hợp lệ",
      },
    },
    quantity: { type: Number, required: true, min: [0, "Số lượng phải >= 0"], default: 0 },
    availableQuantity: { type: Number, min: [0, "Số lượng còn lại phải >= 0"], default: 0 },
    shelf: { type: String, trim: true, default: "" },
    description: { type: String, trim: true, default: "" },
    coverUrl: { type: String, trim: true, default: "" },
  },
  { timestamps: true }
);

bookSchema.pre("validate", function (next) {
  if (this.availableQuantity == null) this.availableQuantity = this.quantity;
  if (this.availableQuantity > this.quantity) {
    return next(new Error("availableQuantity không được lớn hơn quantity"));
  }
  next();
});

module.exports = mongoose.models.Book || mongoose.model("Book", bookSchema);