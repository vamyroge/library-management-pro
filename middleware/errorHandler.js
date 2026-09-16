function notFound(req, res, next) {
  res.status(404).json({ success: false, message: `Không tìm thấy route ${req.originalUrl}` });
}

function errorHandler(err, req, res, next) {
  console.error("[ERROR]", err.message);
  if (err.name === "ValidationError") {
    const messages = Object.values(err.errors).map((e) => e.message);
    return res.status(400).json({ success: false, message: messages.join(", ") });
  }
  if (err.code === 11000) {
    const field = Object.keys(err.keyValue || {})[0] || "trường";
    return res.status(400).json({ success: false, message: `${field} đã tồn tại` });
  }
  if (err.name === "CastError") {
    return res.status(400).json({ success: false, message: "ID không hợp lệ" });
  }
  const status = err.statusCode || 500;
  res.status(status).json({ success: false, message: err.message || "Lỗi máy chủ" });
}

function asyncHandler(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}

module.exports = { notFound, errorHandler, asyncHandler };