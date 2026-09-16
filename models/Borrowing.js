const mongoose = require("mongoose");

const borrowingSchema = new mongoose.Schema(
  {
    reader: { type: mongoose.Schema.Types.ObjectId, ref: "Reader", required: true },
    book: { type: mongoose.Schema.Types.ObjectId, ref: "Book", required: true },
    borrowDate: { type: Date, required: true, default: Date.now },
    dueDate: { type: Date, required: true },
    returnDate: { type: Date, default: null },
    status: { type: String, enum: ["BORROWING", "RETURNED", "OVERDUE"], default: "BORROWING" },
  },
  { timestamps: true }
);

borrowingSchema.virtual("effectiveStatus").get(function () {
  if (this.status === "BORROWING" && this.dueDate && new Date() > this.dueDate) {
    return "OVERDUE";
  }
  return this.status;
});

borrowingSchema.set("toJSON", { virtuals: true });
borrowingSchema.set("toObject", { virtuals: true });

module.exports = mongoose.models.Borrowing || mongoose.model("Borrowing", borrowingSchema);