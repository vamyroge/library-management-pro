const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const helmet = require("helmet");
const path = require("path");
require("dotenv").config();

const { errorHandler, notFound } = require("../middleware/errorHandler");
const authRoutes = require("../routes/auth");
const bookRoutes = require("../routes/books");
const readerRoutes = require("../routes/readers");
const borrowingRoutes = require("../routes/borrowings");
const dashboardRoutes = require("../routes/dashboard");

const app = express();

app.use(helmet({ contentSecurityPolicy: false, crossOriginEmbedderPolicy: false }));
app.use(cors());
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true }));

const DATABASE_URL = process.env.DATABASE_URL;

let cached = global.__mongoose;
if (!cached) cached = global.__mongoose = { conn: null, promise: null };

async function connectDB() {
  if (!DATABASE_URL) throw new Error("DATABASE_URL chưa được cấu hình");
  if (cached.conn) return cached.conn;
  if (!cached.promise) {
    cached.promise = mongoose.connect(DATABASE_URL, {
      serverSelectionTimeoutMS: 8000,
      bufferCommands: false,
    });
  }
  cached.conn = await cached.promise;
  return cached.conn;
}

app.use(async (req, res, next) => {
  try {
    await connectDB();
    next();
  } catch (err) {
    res.status(503).json({ success: false, message: "Không kết nối được cơ sở dữ liệu: " + err.message });
  }
});

app.get("/api/health", (req, res) => {
  res.json({ success: true, message: "Library API is running" });
});

app.use("/api/auth", authRoutes);
app.use("/api/books", bookRoutes);
app.use("/api/readers", readerRoutes);
app.use("/api/borrowings", borrowingRoutes);
app.use("/api/dashboard", dashboardRoutes);

const publicDir = path.join(__dirname, "..", "public");
app.use(express.static(publicDir));

app.get("/login", (req, res) => res.sendFile(path.join(publicDir, "login.html")));

app.use("/api", notFound);

app.get("*", (req, res) => res.sendFile(path.join(publicDir, "index.html")));

app.use(errorHandler);

module.exports = app;

if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  connectDB()
    .then(() => app.listen(PORT, () => console.log(`Library API chạy tại http://localhost:${PORT}`)))
    .catch((err) => console.error("Lỗi kết nối DB:", err.message));
}