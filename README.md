# Library Management Pro

Hệ thống quản lý thư viện Full-stack hiện đại: Dashboard SaaS, quản lý sách, độc giả, mượn/trả, thống kê và lịch sử hoạt động.

- **Frontend**: HTML5 + TailwindCSS CDN + Vanilla JS + Chart.js + Lucide Icons
- **Backend**: Node.js + Express + Mongoose + JWT + bcryptjs
- **Database**: MongoDB Atlas
- **Deploy**: Vercel (Serverless)

## Cấu trúc

```
library-management-pro/
├── public/          # Frontend SPA (index.html, login.html, css, js)
├── api/index.js     # Entry point Express (serverless-compatible)
├── models/          # Book, Reader, Borrowing, User
├── middleware/       # auth (JWT), errorHandler
├── routes/          # auth, books, readers, borrowings, dashboard
├── scripts/         # seed.js, create-admin.js, test-api.js
├── .env.example
├── .gitignore
├── package.json
├── vercel.json
└── README.md
```

## Cài đặt

```bash
npm install
cp .env.example .env
# Sửa DATABASE_URL và JWT_SECRET trong .env
```

Biến môi trường:

| Biến | Mô tả |
|------|-------|
| `DATABASE_URL` | Chuỗi kết nối MongoDB Atlas |
| `JWT_SECRET` | Khóa bí mật ký JWT (chuỗi dài ngẫu nhiên) |
| `JWT_EXPIRES_IN` | Thời hạn token (mặc định `7d`) |
| `PORT` | Cổng chạy local (mặc định `3000`) |
| `ADMIN_USERNAME` | Username admin khi seed |
| `ADMIN_PASSWORD` | Password admin khi seed |

## MongoDB setup

1. Tạo cluster miễn phí tại [MongoDB Atlas](https://www.mongodb.com/atlas).
2. Tạo database user và lấy connection string.
3. Whitelist IP (hoặc `0.0.0.0/0` cho demo).
4. Dán connection string vào `DATABASE_URL`.

## Seed dữ liệu

```bash
npm run seed
```

Tạo 10 sách, 5 độc giả, vài phiếu mượn + tài khoản admin (dựa trên `ADMIN_USERNAME`/`ADMIN_PASSWORD`).

Tạo admin thủ công:

```bash
node scripts/create-admin.js admin MyStrongPass ADMIN
```

## Chạy local

```bash
npm run dev
# Mở http://localhost:3000
```

## Test API

```bash
npm run test
```

## Deploy Vercel

```bash
vercel --prod --yes
```

Nhớ set `DATABASE_URL` và `JWT_SECRET` trong Vercel Project Settings → Environment Variables.

## API Documentation

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/api/health` | No | Health check |
| POST | `/api/auth/login` | No | Đăng nhập, trả JWT |
| GET | `/api/auth/me` | Yes | Thông tin user hiện tại |
| GET | `/api/books` | Yes | Danh sách sách (search/filter/sort/pagination) |
| GET | `/api/books/categories` | Yes | Danh sách thể loại |
| GET | `/api/books/:id` | Yes | Chi tiết sách |
| POST | `/api/books` | Yes | Thêm sách |
| PUT | `/api/books/:id` | Yes | Cập nhật sách |
| DELETE | `/api/books/:id` | Yes | Xóa sách |
| GET | `/api/readers` | Yes | Danh sách độc giả |
| GET | `/api/readers/:id` | Yes | Chi tiết + lịch sử mượn |
| POST | `/api/readers` | Yes | Thêm độc giả |
| PUT | `/api/readers/:id` | Yes | Cập nhật độc giả |
| DELETE | `/api/readers/:id` | Yes | Xóa độc giả (chặn nếu còn sách chưa trả) |
| GET | `/api/borrowings` | Yes | Danh sách phiếu mượn |
| POST | `/api/borrowings` | Yes | Tạo phiếu mượn |
| PUT | `/api/borrowings/:id/return` | Yes | Trả sách |
| GET | `/api/dashboard/stats` | Yes | Thống kê Dashboard (aggregation) |

Query params hỗ trợ: `?page=1&limit=10&search=...&category=...&status=...&sort=...`

## Tài khoản demo

Sau khi `npm run seed`, đăng nhập bằng `ADMIN_USERNAME` / `ADMIN_PASSWORD` trong `.env` (mặc định `admin` / `Admin@12345`).

## Bảo mật

- Password hash bằng bcryptjs
- JWT middleware cho mọi API quản trị
- `helmet`, `cors`, rate limit cho login
- Validation ở cả frontend và backend
- `.env` không commit

## License

MIT