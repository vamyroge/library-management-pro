const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const helmet = require("helmet");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const rateLimit = require("express-rate-limit");
require("dotenv").config();

const app = express();
app.use(helmet({ contentSecurityPolicy: false, crossOriginEmbedderPolicy: false }));
app.use(cors());
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true }));

const DATABASE_URL = (process.env.DATABASE_URL || "").replace(/^\uFEFF/, "").trim();
const JWT_SECRET = (process.env.JWT_SECRET || "dev_secret_change_me").replace(/^\uFEFF/, "").trim();

let cached = global.__mongoose;
if (!cached) cached = global.__mongoose = { conn: null, promise: null };
async function connectDB() {
  if (!DATABASE_URL) throw new Error("DATABASE_URL chưa được cấu hình");
  if (cached.conn) return cached.conn;
  if (!cached.promise) {
    cached.promise = mongoose.connect(DATABASE_URL, { serverSelectionTimeoutMS: 8000, bufferCommands: false });
  }
  cached.conn = await cached.promise;
  return cached.conn;
}

const bookSchema = new mongoose.Schema(
  {
    title: { type: String, required: [true, "Tên sách bắt buộc"], trim: true },
    isbn: { type: String, required: [true, "ISBN bắt buộc"], unique: true, trim: true },
    author: { type: String, required: true, trim: true },
    category: { type: String, trim: true, default: "Khác" },
    publisher: { type: String, trim: true, default: "" },
    publishYear: { type: Number, validate: { validator: (v) => v == null || (v >= 1000 && v <= new Date().getFullYear() + 1), message: "Năm xuất bản không hợp lệ" } },
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
  if (this.availableQuantity > this.quantity) return next(new Error("availableQuantity không được lớn hơn quantity"));
  next();
});
const Book = mongoose.models.Book || mongoose.model("Book", bookSchema);

const readerSchema = new mongoose.Schema(
  {
    readerCode: { type: String, required: [true, "Mã độc giả bắt buộc"], unique: true, trim: true },
    fullName: { type: String, required: [true, "Họ tên bắt buộc"], trim: true },
    email: { type: String, required: [true, "Email bắt buộc"], trim: true, lowercase: true, match: [/^[^\s@]+@[^\s@]+\.[^\s@]+$/, "Email không hợp lệ"] },
    phone: { type: String, trim: true, default: "" },
    className: { type: String, trim: true, default: "" },
    address: { type: String, trim: true, default: "" },
    status: { type: String, enum: ["ACTIVE", "INACTIVE"], default: "ACTIVE" },
  },
  { timestamps: true }
);
const Reader = mongoose.models.Reader || mongoose.model("Reader", readerSchema);

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
borrowingSchema.set("toJSON", { virtuals: true });
borrowingSchema.set("toObject", { virtuals: true });
const Borrowing = mongoose.models.Borrowing || mongoose.model("Borrowing", borrowingSchema);

const userSchema = new mongoose.Schema(
  { username: { type: String, required: true, unique: true, trim: true, lowercase: true }, passwordHash: { type: String, required: true }, role: { type: String, enum: ["ADMIN", "LIBRARIAN"], default: "LIBRARIAN" } },
  { timestamps: true }
);
const User = mongoose.models.User || mongoose.model("User", userSchema);

class ApiError extends Error {
  constructor(statusCode, message) { super(message); this.statusCode = statusCode; }
}
const asyncHandler = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

function requireAuth(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7).trim() : null;
  if (!token) return res.status(401).json({ success: false, message: "Chưa đăng nhập (thiếu token)" });
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ success: false, message: "Token không hợp lệ hoặc đã hết hạn" });
  }
}

function withOverdue(doc) {
  const obj = doc.toObject ? doc.toObject() : doc;
  if (obj.status === "BORROWING" && obj.dueDate && new Date() > new Date(obj.dueDate)) {
    obj.status = "OVERDUE";
    obj.daysOverdue = Math.ceil((Date.now() - new Date(obj.dueDate).getTime()) / 86400000);
  }
  return obj;
}

app.get("/api/health", (req, res) => {
  const dbg = process.env.DATABASE_URL || "";
  res.json({
    success: true,
    message: "Library API is running",
    _dbg: {
      hasUrl: !!dbg,
      len: dbg.length,
      prefix: dbg.slice(0, 15),
      hasScheme: dbg.startsWith("mongodb"),
      jwt: !!process.env.JWT_SECRET,
    },
  });
});

app.use(asyncHandler(async (req, res, next) => { await connectDB(); next(); }));

const loginLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 30, standardHeaders: true, legacyHeaders: false });

app.post("/api/auth/login", loginLimiter, asyncHandler(async (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) throw new ApiError(400, "Vui lòng nhập username và password");
  const user = await User.findOne({ username: String(username).toLowerCase().trim() });
  if (!user || !(await bcrypt.compare(password, user.passwordHash))) throw new ApiError(401, "Sai username hoặc password");
  const token = jwt.sign({ id: user._id, username: user.username, role: user.role }, JWT_SECRET, { expiresIn: process.env.JWT_EXPIRES_IN || "7d" });
  res.json({ success: true, data: { token, user: { id: user._id, username: user.username, role: user.role } } });
}));

app.get("/api/auth/me", requireAuth, (req, res) => res.json({ success: true, data: { id: req.user.id, username: req.user.username, role: req.user.role } }));

app.get("/api/books", requireAuth, asyncHandler(async (req, res) => {
  const page = Math.max(1, parseInt(req.query.page) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 10));
  const { search, category, author, status, sort } = req.query;
  const filter = {};
  if (search) { const re = new RegExp(String(search).trim(), "i"); filter.$or = [{ title: re }, { isbn: re }]; }
  if (category) filter.category = category;
  if (author) filter.author = new RegExp(String(author).trim(), "i");
  if (status === "OUT") filter.availableQuantity = 0;
  if (status === "AVAILABLE") filter.availableQuantity = { $gt: 0 };
  let sortOption = { createdAt: -1 };
  if (sort === "title") sortOption = { title: 1 };
  else if (sort === "-title") sortOption = { title: -1 };
  else if (sort === "quantity") sortOption = { quantity: -1 };
  else if (sort === "createdAt") sortOption = { createdAt: 1 };
  const [data, total] = await Promise.all([
    Book.find(filter).sort(sortOption).skip((page - 1) * limit).limit(limit),
    Book.countDocuments(filter),
  ]);
  res.json({ success: true, data, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) || 1 } });
}));

app.get("/api/books/categories", requireAuth, asyncHandler(async (req, res) => {
  const categories = await Book.distinct("category");
  res.json({ success: true, data: categories.filter(Boolean).sort() });
}));

app.get("/api/books/:id", requireAuth, asyncHandler(async (req, res) => {
  const book = await Book.findById(req.params.id);
  if (!book) throw new ApiError(404, "Không tìm thấy sách");
  res.json({ success: true, data: book });
}));

app.post("/api/books", requireAuth, asyncHandler(async (req, res) => {
  const payload = { ...req.body };
  if (payload.availableQuantity == null) payload.availableQuantity = payload.quantity;
  const book = await Book.create(payload);
  res.status(201).json({ success: true, data: book });
}));

app.put("/api/books/:id", requireAuth, asyncHandler(async (req, res) => {
  const book = await Book.findById(req.params.id);
  if (!book) throw new ApiError(404, "Không tìm thấy sách");
  const payload = { ...req.body };
  delete payload._id;
  Object.assign(book, payload);
  if (book.availableQuantity > book.quantity) throw new ApiError(400, "availableQuantity không được lớn hơn quantity");
  await book.save();
  res.json({ success: true, data: book });
}));

app.delete("/api/books/:id", requireAuth, asyncHandler(async (req, res) => {
  const active = await Borrowing.countDocuments({ book: req.params.id, status: "BORROWING" });
  if (active > 0) throw new ApiError(400, "Không thể xóa sách đang có phiếu mượn chưa trả");
  const book = await Book.findByIdAndDelete(req.params.id);
  if (!book) throw new ApiError(404, "Không tìm thấy sách");
  res.json({ success: true, message: "Đã xóa sách" });
}));

app.get("/api/readers", requireAuth, asyncHandler(async (req, res) => {
  const page = Math.max(1, parseInt(req.query.page) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 10));
  const { search, status, sort } = req.query;
  const filter = {};
  if (search) { const re = new RegExp(String(search).trim(), "i"); filter.$or = [{ fullName: re }, { readerCode: re }, { email: re }]; }
  if (status) filter.status = status;
  let sortOption = { createdAt: -1 };
  if (sort === "name") sortOption = { fullName: 1 };
  else if (sort === "-name") sortOption = { fullName: -1 };
  const [data, total] = await Promise.all([
    Reader.find(filter).sort(sortOption).skip((page - 1) * limit).limit(limit),
    Reader.countDocuments(filter),
  ]);
  res.json({ success: true, data, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) || 1 } });
}));

app.get("/api/readers/:id", requireAuth, asyncHandler(async (req, res) => {
  const reader = await Reader.findById(req.params.id);
  if (!reader) throw new ApiError(404, "Không tìm thấy độc giả");
  const borrowings = await Borrowing.find({ reader: reader._id }).populate("book", "title isbn author").sort({ createdAt: -1 });
  res.json({ success: true, data: { ...reader.toObject(), borrowings } });
}));

app.post("/api/readers", requireAuth, asyncHandler(async (req, res) => {
  const reader = await Reader.create(req.body);
  res.status(201).json({ success: true, data: reader });
}));

app.put("/api/readers/:id", requireAuth, asyncHandler(async (req, res) => {
  const reader = await Reader.findById(req.params.id);
  if (!reader) throw new ApiError(404, "Không tìm thấy độc giả");
  const payload = { ...req.body };
  delete payload._id;
  Object.assign(reader, payload);
  await reader.save();
  res.json({ success: true, data: reader });
}));

app.delete("/api/readers/:id", requireAuth, asyncHandler(async (req, res) => {
  const active = await Borrowing.countDocuments({ reader: req.params.id, status: "BORROWING" });
  if (active > 0) throw new ApiError(400, "Không thể xóa độc giả đang có sách chưa trả");
  const reader = await Reader.findByIdAndDelete(req.params.id);
  if (!reader) throw new ApiError(404, "Không tìm thấy độc giả");
  res.json({ success: true, message: "Đã xóa độc giả" });
}));

app.get("/api/borrowings", requireAuth, asyncHandler(async (req, res) => {
  const page = Math.max(1, parseInt(req.query.page) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 10));
  const { status, reader, book, search } = req.query;
  const filter = {};
  if (status === "OVERDUE") { filter.status = "BORROWING"; filter.dueDate = { $lt: new Date() }; }
  else if (status) filter.status = status;
  if (reader && mongoose.isValidObjectId(reader)) filter.reader = reader;
  if (book && mongoose.isValidObjectId(book)) filter.book = book;
  const [rows, total] = await Promise.all([
    Borrowing.find(filter).populate("reader", "fullName readerCode email").populate("book", "title isbn author").sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit),
    Borrowing.countDocuments(filter),
  ]);
  let data = rows.map(withOverdue);
  if (search) {
    const re = new RegExp(String(search).trim(), "i");
    data = data.filter((r) => (r.reader && (re.test(r.reader.fullName) || re.test(r.reader.readerCode))) || (r.book && (re.test(r.book.title) || re.test(r.book.isbn))));
  }
  res.json({ success: true, data, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) || 1 } });
}));

app.post("/api/borrowings", requireAuth, asyncHandler(async (req, res) => {
  const { reader, book, borrowDate, dueDate } = req.body || {};
  if (!reader || !book) throw new ApiError(400, "Vui lòng chọn độc giả và sách");
  if (!mongoose.isValidObjectId(reader) || !mongoose.isValidObjectId(book)) throw new ApiError(400, "ID độc giả hoặc sách không hợp lệ");
  const readerDoc = await Reader.findById(reader);
  if (!readerDoc) throw new ApiError(404, "Độc giả không tồn tại");
  if (readerDoc.status !== "ACTIVE") throw new ApiError(400, "Độc giả đang bị khóa");
  const bookDoc = await Book.findById(book);
  if (!bookDoc) throw new ApiError(404, "Sách không tồn tại");
  if (bookDoc.availableQuantity <= 0) throw new ApiError(400, "Sách đã hết, không thể mượn");
  const borrow = borrowDate ? new Date(borrowDate) : new Date();
  const due = dueDate ? new Date(dueDate) : new Date(borrow.getTime() + 14 * 86400000);
  if (due <= borrow) throw new ApiError(400, "Hạn trả phải sau ngày mượn");
  bookDoc.availableQuantity -= 1;
  await bookDoc.save();
  try {
    const created = await Borrowing.create({ reader, book, borrowDate: borrow, dueDate: due, status: "BORROWING" });
    const populated = await Borrowing.findById(created._id).populate("reader", "fullName readerCode email").populate("book", "title isbn author");
    res.status(201).json({ success: true, data: withOverdue(populated) });
  } catch (err) {
    bookDoc.availableQuantity += 1;
    await bookDoc.save();
    throw err;
  }
}));

app.put("/api/borrowings/:id/return", requireAuth, asyncHandler(async (req, res) => {
  const borrowing = await Borrowing.findById(req.params.id);
  if (!borrowing) throw new ApiError(404, "Không tìm thấy phiếu mượn");
  if (borrowing.status === "RETURNED" || borrowing.returnDate) throw new ApiError(400, "Phiếu này đã được trả trước đó");
  borrowing.returnDate = new Date();
  borrowing.status = "RETURNED";
  await borrowing.save();
  await Book.updateOne({ _id: borrowing.book }, { $inc: { availableQuantity: 1 } });
  const populated = await Borrowing.findById(borrowing._id).populate("reader", "fullName readerCode email").populate("book", "title isbn author");
  res.json({ success: true, data: populated });
}));

app.get("/api/dashboard/stats", requireAuth, asyncHandler(async (req, res) => {
  const now = new Date();
  const start7 = new Date(now.getTime() - 6 * 86400000);
  start7.setHours(0, 0, 0, 0);
  const [totalBooksAgg, totalReaders, activeBorrowings, overdueCount, returnedCount, totalBorrowings, booksByCategory, borrowLast7, statusAgg, recentBorrowings, overdueList] = await Promise.all([
    Book.aggregate([{ $group: { _id: null, total: { $sum: "$quantity" }, available: { $sum: "$availableQuantity" } } }]),
    Reader.countDocuments(),
    Borrowing.countDocuments({ status: "BORROWING" }),
    Borrowing.countDocuments({ status: "BORROWING", dueDate: { $lt: now } }),
    Borrowing.countDocuments({ status: "RETURNED" }),
    Borrowing.countDocuments(),
    Book.aggregate([{ $group: { _id: "$category", count: { $sum: 1 }, quantity: { $sum: "$quantity" } } }, { $sort: { count: -1 } }]),
    Borrowing.aggregate([{ $match: { borrowDate: { $gte: start7 } } }, { $group: { _id: { $dateToString: { format: "%Y-%m-%d", date: "$borrowDate" } }, count: { $sum: 1 } } }, { $sort: { _id: 1 } }]),
    Borrowing.aggregate([{ $group: { _id: "$status", count: { $sum: 1 } } }]),
    Borrowing.find().populate("reader", "fullName readerCode").populate("book", "title isbn").sort({ createdAt: -1 }).limit(8),
    Borrowing.find({ status: "BORROWING", dueDate: { $lt: now } }).populate("reader", "fullName readerCode email").populate("book", "title isbn").sort({ dueDate: 1 }).limit(10),
  ]);
  const totalBooks = totalBooksAgg[0]?.total || 0;
  const availableBooks = totalBooksAgg[0]?.available || 0;
  const days = [];
  for (let i = 6; i >= 0; i--) days.push(new Date(now.getTime() - i * 86400000).toISOString().slice(0, 10));
  const borrowMap = Object.fromEntries(borrowLast7.map((b) => [b._id, b.count]));
  const borrowSeries = days.map((d) => ({ date: d, count: borrowMap[d] || 0 }));
  const statusMap = Object.fromEntries(statusAgg.map((s) => [s._id, s.count]));
  res.json({
    success: true,
    data: {
      cards: { totalBooks, totalReaders, activeBorrowings, overdue: overdueCount, availableBooks, totalBorrowings, totalReturns: returnedCount },
      booksByCategory: booksByCategory.map((c) => ({ category: c._id || "Khác", count: c.count, quantity: c.quantity })),
      borrowSeries,
      statusSeries: { BORROWING: statusMap.BORROWING || 0, RETURNED: statusMap.RETURNED || 0, OVERDUE: overdueCount },
      recentActivities: recentBorrowings.map((b) => ({
        id: b._id,
        reader: b.reader?.fullName || "N/A",
        readerCode: b.reader?.readerCode || "",
        book: b.book?.title || "N/A",
        isbn: b.book?.isbn || "",
        action: b.status === "RETURNED" ? "RETURNED" : "BORROWED",
        at: b.returnDate || b.borrowDate || b.createdAt,
        status: b.status,
      })),
      overdueList: overdueList.map((b) => ({
        id: b._id,
        reader: b.reader?.fullName || "N/A",
        readerCode: b.reader?.readerCode || "",
        email: b.reader?.email || "",
        book: b.book?.title || "N/A",
        isbn: b.book?.isbn || "",
        dueDate: b.dueDate,
        daysOverdue: Math.ceil((now - new Date(b.dueDate)) / 86400000),
      })),
    },
  });
}));

app.use("/api", (req, res) => res.status(404).json({ success: false, message: `Không tìm thấy route ${req.originalUrl}` }));

app.use((err, req, res, next) => {
  console.error("[ERROR]", err.message);
  if (err.name === "ValidationError") {
    return res.status(400).json({ success: false, message: Object.values(err.errors).map((e) => e.message).join(", ") });
  }
  if (err.code === 11000) {
    const field = Object.keys(err.keyValue || {})[0] || "trường";
    return res.status(400).json({ success: false, message: `${field} đã tồn tại` });
  }
  if (err.name === "CastError") return res.status(400).json({ success: false, message: "ID không hợp lệ" });
  res.status(err.statusCode || 500).json({ success: false, message: err.message || "Lỗi máy chủ" });
});

module.exports = app;

if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  connectDB()
    .then(() => app.listen(PORT, () => console.log(`Library API chạy tại http://localhost:${PORT}`)))
    .catch((err) => console.error("Lỗi kết nối DB:", err.message));
}