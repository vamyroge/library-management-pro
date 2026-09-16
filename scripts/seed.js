require("dotenv").config();
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const Book = require("../models/Book");
const Reader = require("../models/Reader");
const Borrowing = require("../models/Borrowing");
const User = require("../models/User");

const DATABASE_URL = process.env.DATABASE_URL;
const ADMIN_USERNAME = (process.env.ADMIN_USERNAME || "admin").toLowerCase();
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;

const books = [
  { title: "Lập trình JavaScript cơ bản", isbn: "9786040000001", author: "Nguyễn Văn A", category: "Công nghệ", publisher: "NXB Trẻ", publishYear: 2021, quantity: 5, shelf: "A1" },
  { title: "Cấu trúc dữ liệu và giải thuật", isbn: "9786040000002", author: "Trần Thị B", category: "Công nghệ", publisher: "NXB Giáo Dục", publishYear: 2020, quantity: 4, shelf: "A2" },
  { title: "Harry Potter và Hòn đá Phù thủy", isbn: "9786040000003", author: "J.K. Rowling", category: "Tiểu thuyết", publisher: "NXB Hội Nhà Văn", publishYear: 2019, quantity: 6, shelf: "B1" },
  { title: "Nhà giả kim", isbn: "9786040000004", author: "Paulo Coelho", category: "Tiểu thuyết", publisher: "NXB Văn Học", publishYear: 2018, quantity: 3, shelf: "B2" },
  { title: "Sapiens: Lược sử loài người", isbn: "9786040000005", author: "Yuval Noah Harari", category: "Lịch sử", publisher: "NXB Thế Giới", publishYear: 2022, quantity: 4, shelf: "C1" },
  { title: "Toán rời rạc", isbn: "9786040000006", author: "Lê Văn C", category: "Giáo trình", publisher: "NXB ĐHQG", publishYear: 2021, quantity: 5, shelf: "A3" },
  { title: "Kỹ năng mềm cho sinh viên", isbn: "9786040000007", author: "Phạm Thị D", category: "Kỹ năng", publisher: "NXB Lao Động", publishYear: 2023, quantity: 3, shelf: "D1" },
  { title: "Vật lý đại cương", isbn: "9786040000008", author: "Hoàng Văn E", category: "Giáo trình", publisher: "NXB Giáo Dục", publishYear: 2019, quantity: 4, shelf: "A4" },
  { title: "Đắc nhân tâm", isbn: "9786040000009", author: "Dale Carnegie", category: "Kỹ năng", publisher: "NXB Tổng Hợp", publishYear: 2017, quantity: 2, shelf: "D2" },
  { title: "Tư duy nhanh và chậm", isbn: "9786040000010", author: "Daniel Kahneman", category: "Tâm lý", publisher: "NXB Thế Giới", publishYear: 2020, quantity: 3, shelf: "E1" },
];

const readers = [
  { readerCode: "DG001", fullName: "Nguyễn Văn An", email: "an@example.com", phone: "0901111111", className: "CNTT01", address: "Hà Nội", status: "ACTIVE" },
  { readerCode: "DG002", fullName: "Trần Thị Bình", email: "binh@example.com", phone: "0902222222", className: "CNTT02", address: "Đà Nẵng", status: "ACTIVE" },
  { readerCode: "DG003", fullName: "Lê Văn Cường", email: "cuong@example.com", phone: "0903333333", className: "KT01", address: "TP.HCM", status: "ACTIVE" },
  { readerCode: "DG004", fullName: "Phạm Thị Dung", email: "dung@example.com", phone: "0904444444", className: "CNTT01", address: "Huế", status: "ACTIVE" },
  { readerCode: "DG005", fullName: "Hoàng Văn Em", email: "em@example.com", phone: "0905555555", className: "KT02", address: "Cần Thơ", status: "INACTIVE" },
];

async function seed() {
  if (!DATABASE_URL) {
    console.error("Thiếu DATABASE_URL trong .env");
    process.exit(1);
  }
  await mongoose.connect(DATABASE_URL);
  console.log("Đã kết nối MongoDB");

  await Promise.all([Book.deleteMany({}), Reader.deleteMany({}), Borrowing.deleteMany({})]);

  const createdBooks = await Book.insertMany(books.map((b) => ({ ...b, availableQuantity: b.quantity })));
  const createdReaders = await Reader.insertMany(readers);

  const now = Date.now();
  const records = [
    { reader: createdReaders[0]._id, book: createdBooks[2]._id, borrowDate: new Date(now - 20 * 86400000), dueDate: new Date(now - 6 * 86400000), status: "BORROWING" },
    { reader: createdReaders[1]._id, book: createdBooks[3]._id, borrowDate: new Date(now - 10 * 86400000), dueDate: new Date(now + 4 * 86400000), status: "BORROWING" },
    { reader: createdReaders[2]._id, book: createdBooks[0]._id, borrowDate: new Date(now - 15 * 86400000), dueDate: new Date(now - 1 * 86400000), returnDate: new Date(now - 2 * 86400000), status: "RETURNED" },
    { reader: createdReaders[3]._id, book: createdBooks[4]._id, borrowDate: new Date(now - 3 * 86400000), dueDate: new Date(now + 11 * 86400000), status: "BORROWING" },
  ];
  await Borrowing.insertMany(records);

  for (const rec of records) {
    if (rec.status === "BORROWING") {
      await Book.updateOne({ _id: rec.book }, { $inc: { availableQuantity: -1 } });
    }
  }

  const existingAdmin = await User.findOne({ username: ADMIN_USERNAME });
  if (!existingAdmin) {
    if (!ADMIN_PASSWORD) {
      console.warn("ADMIN_PASSWORD chưa đặt — bỏ qua tạo admin");
    } else {
      const passwordHash = await bcrypt.hash(ADMIN_PASSWORD, 10);
      await User.create({ username: ADMIN_USERNAME, passwordHash, role: "ADMIN" });
      console.log(`Đã tạo admin: ${ADMIN_USERNAME}`);
    }
  } else {
    console.log("Admin đã tồn tại, bỏ qua");
  }

  console.log(`Seed xong: ${createdBooks.length} sách, ${createdReaders.length} độc giả, ${records.length} phiếu mượn`);
  await mongoose.disconnect();
  process.exit(0);
}

seed().catch((err) => {
  console.error("Seed lỗi:", err.message);
  process.exit(1);
});