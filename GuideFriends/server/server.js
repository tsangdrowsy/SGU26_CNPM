import express from "express";
import bcrypt from "bcryptjs";
import cors from "cors";
import sql from "mssql";
import dotenv from "dotenv";
import crypto from "crypto"; // Đưa lên đầu file
import multer from "multer";
import path from "path";
import fs from "fs";
import { translateTextGemini, chatWithContext } from "./aiService.js";
import { VNPay, ignoreLogger, ProductCode, VnpLocale } from 'vnpay';

dotenv.config();

// ---------- CẤU HÌNH VNPAY ----------
const vnpay = new VNPay({
  tmnCode: process.env.VNPAY_TMN_CODE,
  secureSecret: process.env.VNPAY_HASH_SECRET,
  vnpayHost: 'https://sandbox.vnpayment.vn',
  testMode: true,
  enableLog: true,
  logger: ignoreLogger,
});

// ---------- CẤU HÌNH UPLOAD ẢNH ----------
const uploadDir = "./uploads";
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir);

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  },
});
const upload = multer({ storage });

// ---------- KHỞI TẠO APP & MIDDLEWARE ----------
const app = express();
app.use(cors());
app.use(express.json());
app.use("/uploads", express.static("uploads"));

// ---------- CẤU HÌNH DATABASE ----------
const pool = new sql.ConnectionPool({
  server: process.env.DB_SERVER,
  port: Number(process.env.DB_PORT),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  options: {
    encrypt: false,
    trustServerCertificate: true,
  },
});

let poolConnected = false;
async function connectPool() {
  if (poolConnected) return;
  await pool.connect();
  poolConnected = true;
  console.log("[db] connected to", process.env.DB_NAME);
}

// ---------- HELPER FUNCTIONS ----------
function rowToPoi(r) {
  return {
    id: r.Id,
    name: r.Name,
    shortDescriptionVi: r.ShortDescriptionVi,
    fullDescriptionVi: r.FullDescriptionVi,
    radiusMeters: r.RadiusMeters,
    imageUrl: r.ImageUrl,
    location: {
      latitude: Number(r.Latitude),
      longitude: Number(r.Longitude),
    },
  };
}

function generate6CharToken() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let result = '';
  for (let i = 0; i < 6; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

// ---------- POI ROUTES ----------
app.get("/api/pois", async (_req, res) => {
  try {
    await connectPool();
    const result = await pool.request().query(`
      SELECT Id, Name, ShortDescriptionVi, FullDescriptionVi,
             Latitude, Longitude, RadiusMeters, ImageUrl
      FROM POIs ORDER BY Id;
    `);
    res.json({ pois: result.recordset.map(rowToPoi) });
  } catch (err) {
    console.error("[GET /api/pois]", err);
    res.status(500).json({ error: "db_error", message: err.message });
  }
});

app.get("/api/pois/:id", async (req, res) => {
  try {
    await connectPool();
    const result = await pool
      .request()
      .input("id", sql.VarChar(50), req.params.id)
      .query(`
        SELECT Id, Name, ShortDescriptionVi, FullDescriptionVi,
               Latitude, Longitude, RadiusMeters, ImageUrl
        FROM POIs WHERE Id = @id;
      `);
    if (result.recordset.length === 0) {
      return res.status(404).json({ error: "not_found" });
    }
    res.json({ poi: rowToPoi(result.recordset[0]) });
  } catch (err) {
    console.error("[GET /api/pois/:id]", err);
    res.status(500).json({ error: "db_error", message: err.message });
  }
});

app.get("/health", (_req, res) => res.json({ ok: true }));

// ---------- AI ROUTES ----------
app.post("/api/ai/translate", async (req, res) => {
  const { poiId, targetLang } = req.body ?? {};
  if (!poiId || !targetLang) {
    return res.status(400).json({ error: "missing_params" });
  }

  try {
    await connectPool();
    const row = (
      await pool.request()
        .input("id", sql.VarChar(50), poiId)
        .query(`SELECT ShortDescriptionVi FROM POIs WHERE Id = @id`)
    ).recordset[0];

    if (!row) return res.status(404).json({ error: "poi_not_found" });

    const translated = await translateTextGemini(row.ShortDescriptionVi, targetLang);
    res.json({ text: translated, cached: false });
  } catch (err) {
    console.error("[POST /api/ai/translate]", err);
    res.status(500).json({ error: "translate_failed", message: err.message });
  }
});

app.post("/api/ai/chat", async (req, res) => {
  const { poiId, question, targetLang = "en" } = req.body ?? {};
  if (!question) return res.status(400).json({ error: "missing_question" });

  try {
    await connectPool();
    let contextVi = "";
    if (poiId) {
      const row = (
        await pool.request()
          .input("id", sql.VarChar(50), poiId)
          .query(`SELECT FullDescriptionVi FROM POIs WHERE Id = @id`)
      ).recordset[0];
      contextVi = row?.FullDescriptionVi ?? "";
    }

    const answer = await chatWithContext({ question, contextVi, targetLang });
    res.json({ answer });
  } catch (err) {
    console.error("[POST /api/ai/chat]", err);
    res.status(500).json({ error: "chat_failed", message: err.message });
  }
});

// ---------- CLERK & AUTH ROUTES ----------
app.post("/api/clerk/generate-token", async (req, res) => {
  const { username } = req.body;

  try {
    await connectPool();
    const clerk = (await pool.request()
      .input("username", sql.NVarChar(100), username)
      .query("SELECT Id FROM Clerks WHERE Username = @username")).recordset[0];

    if (!clerk) return res.status(404).json({ error: "Clerk not found" });

    const token = generate6CharToken();
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

    await pool.request()
      .input("token", sql.VarChar(36), token)
      .input("clerkId", sql.UniqueIdentifier, clerk.Id)
      .input("expiresAt", sql.DateTime2, expiresAt)
      .query(`INSERT INTO UnlockTokens (Token, CreatedByClerkId, ExpiresAt, Source) VALUES (@token, @clerkId, @expiresAt, 'clerk')`);

    res.json({ token, expiresAt });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/auth/validate-token", async (req, res) => {
  const { token } = req.body;
  if (!token) return res.status(400).json({ error: "Missing token" });

  try {
    await connectPool();
    const result = await pool.request()
      .input("token", sql.VarChar(36), token)
      .query(`SELECT Token, ExpiresAt FROM UnlockTokens 
              WHERE Token = @token AND ExpiresAt > GETUTCDATE() AND IsUsed = 0`);

    if (result.recordset.length === 0) {
      return res.status(401).json({ error: "Mã không hợp lệ hoặc đã hết hạn." });
    }

    res.json({ valid: true, message: "Mở khóa thành công!" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---------- ADMIN ROUTES ----------

app.post("/api/admin/login", async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: "Vui lòng nhập đủ tài khoản và mật khẩu" });

  try {
    await connectPool();
    const result = await pool.request()
      .input("username", sql.NVarChar(100), username)
      .query("SELECT * FROM Admins WHERE Username = @username");

    const admin = result.recordset[0];
    if (!admin) return res.status(401).json({ error: "Sai tài khoản hoặc mật khẩu" });

    // So sánh mật khẩu người dùng nhập với hash trong DB
    const isMatch = await bcrypt.compare(password, admin.PasswordHash);
    if (!isMatch) return res.status(401).json({ error: "Sai tài khoản hoặc mật khẩu" });

    // Trả về thành công (Ở dự án thực tế sẽ trả về JWT)
    res.json({ success: true, message: "Đăng nhập thành công", adminName: admin.FullName });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
app.get("/api/admin/stats", async (req, res) => {
  try {
    await connectPool();
    const totalTokens = (await pool.request().query("SELECT COUNT(*) as count FROM UnlockTokens")).recordset[0].count;
    const activeTokens = (await pool.request().query("SELECT COUNT(*) as count FROM UnlockTokens WHERE ExpiresAt > GETUTCDATE() AND IsUsed = 0")).recordset[0].count;
    const totalPois = (await pool.request().query("SELECT COUNT(*) as count FROM POIs")).recordset[0].count;

    res.json({ totalTokens, activeTokens, totalPois });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/admin/tokens", async (req, res) => {
  try {
    await connectPool();
    const result = await pool.request().query(`
      SELECT t.Token, t.ExpiresAt, t.IsUsed, t.Source, c.FullName AS ClerkName 
      FROM UnlockTokens t
      LEFT JOIN Clerks c ON t.CreatedByClerkId = c.Id
      WHERE t.ExpiresAt > GETUTCDATE()
      ORDER BY t.CreatedAt DESC
    `);
    res.json({ tokens: result.recordset });
  } catch (err) {
    console.error("[GET /api/admin/tokens]", err);
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/admin/pois", upload.single("image"), async (req, res) => {
  try {
    await connectPool();
    const { name, shortDescriptionVi, fullDescriptionVi, latitude, longitude, radiusMeters } = req.body;
    const newId = "poi_" + Math.floor(1000 + Math.random() * 9000);
    const imageUrl = req.file ? `/uploads/${req.file.filename}` : null;

    await pool.request()
      .input("id", sql.VarChar(50), newId)
      .input("name", sql.NVarChar(255), name)
      .input("shortDesc", sql.NVarChar(500), shortDescriptionVi)
      .input("fullDesc", sql.NVarChar(sql.MAX), fullDescriptionVi)
      .input("lat", sql.Decimal(9, 6), latitude)
      .input("lng", sql.Decimal(9, 6), longitude)
      .input("radius", sql.Int, radiusMeters || 20)
      .input("imageUrl", sql.NVarChar(500), imageUrl)
      .query(`
        INSERT INTO POIs (Id, Name, ShortDescriptionVi, FullDescriptionVi, Latitude, Longitude, RadiusMeters, ImageUrl)
        VALUES (@id, @name, @shortDesc, @fullDesc, @lat, @lng, @radius, @imageUrl)
      `);

    res.json({ success: true, id: newId });
  } catch (err) {
    console.error("[POST /api/admin/pois]", err);
    res.status(500).json({ error: err.message });
  }
});

app.put("/api/admin/pois/:id", upload.single("image"), async (req, res) => {
  const { id } = req.params;
  const { name, shortDescriptionVi, fullDescriptionVi, latitude, longitude, radiusMeters } = req.body;

  try {
    await connectPool();
    let imageUrl = null;
    if (req.file) {
      imageUrl = `/uploads/${req.file.filename}`;
    }

    let query = `
      UPDATE POIs 
      SET Name = @name, ShortDescriptionVi = @shortDesc, FullDescriptionVi = @fullDesc,
          Latitude = @lat, Longitude = @lng, RadiusMeters = @radius
    `;
    if (imageUrl) query += `, ImageUrl = @imageUrl`;
    query += ` WHERE Id = @id`;

    const request = pool.request()
      .input("id", sql.VarChar(50), id)
      .input("name", sql.NVarChar(255), name)
      .input("shortDesc", sql.NVarChar(500), shortDescriptionVi)
      .input("fullDesc", sql.NVarChar(sql.MAX), fullDescriptionVi)
      .input("lat", sql.Decimal(9, 6), latitude)
      .input("lng", sql.Decimal(9, 6), longitude)
      .input("radius", sql.Int, radiusMeters || 20);

    if (imageUrl) {
      request.input("imageUrl", sql.NVarChar(500), imageUrl);
    }

    await request.query(query);
    res.json({ success: true, id });
  } catch (err) {
    console.error("[PUT /api/admin/pois]", err);
    res.status(500).json({ error: err.message });
  }
});

// ---------- VNPAY ROUTES ----------
// 1. Tạo URL thanh toán
app.post("/api/payment/create-vnpay-url", async (req, res) => {
  try {
    await connectPool();
    const token = generate6CharToken();
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
    const clerk = (await pool.request().query("SELECT TOP 1 Id FROM Clerks")).recordset[0];

    // Lưu token với trạng thái chưa thanh toán (IsUsed = 1)
    await pool.request()
      .input("token", sql.VarChar(36), token)
      .input("clerkId", sql.UniqueIdentifier, clerk.Id)
      .input("expiresAt", sql.DateTime2, expiresAt)
      .query(`INSERT INTO UnlockTokens (Token, CreatedByClerkId, ExpiresAt, Source, IsUsed) VALUES (@token, @clerkId, @expiresAt, 'vnpay', 1)`);

    const paymentUrl = vnpay.buildPaymentUrl({
      vnp_Amount: 15000, 
      vnp_IpAddr: '127.0.0.1', // 👈 Bắt buộc dùng IPv4 khi chạy qua Ngrok
      vnp_TxnRef: token, 
      vnp_OrderInfo: `Thanh toan ve ${token}`,
      vnp_OrderType: ProductCode.Other,
      vnp_ReturnUrl: process.env.VNPAY_RETURN_URL,
      vnp_Locale: VnpLocale.VN,
    });

    res.json({ paymentUrl, token });
  } catch (err) {
    console.error("[VNPAY] Create URL error:", err);
    res.status(500).json({ error: err.message });
  }
});

// 2. IPN URL (Webhook Server-to-Server)
app.get('/api/payment/vnpay-ipn', async (req, res) => {
  console.log("🔥 [VNPAY IPN] Có tín hiệu gọi về từ VNPAY!", req.query); // 👈 Log để debug
  
  try {
    const verify = vnpay.verifyIpnCall(req.query);

    if (!verify.isVerified) {
      console.log("❌ [VNPAY IPN] Sai chữ ký (Invalid signature)");
      return res.json({ RspCode: '97', Message: 'Invalid signature' });
    }
    
    if (!verify.isSuccess) {
      console.log("⚠️ [VNPAY IPN] Giao dịch thất bại hoặc bị hủy");
      return res.json({ RspCode: '00', Message: 'Confirm Success' }); 
    }

    // Cập nhật IsUsed = 0 (false) nghĩa là thanh toán thành công
    await pool.request()
      .input("token", sql.VarChar(36), verify.vnp_TxnRef)
      .query("UPDATE UnlockTokens SET IsUsed = 0 WHERE Token = @token");

    console.log(` [VNPAY IPN] Đã cập nhật Token ${verify.vnp_TxnRef} thành công!`);
    return res.json({ RspCode: '00', Message: 'Confirm Success' });
  } catch (err) {
    console.error(" [VNPAY IPN] Lỗi:", err);
    return res.json({ RspCode: '99', Message: 'Unknown error' });
  }
});

// 3. Return URL (Trình duyệt redirect về)
app.get('/api/payment/vnpay-return', (req, res) => {
  const responseCode = req.query.vnp_ResponseCode;
  
  if (responseCode === '00') {
    res.send(`
      <html>
        <body style="font-family: sans-serif; text-align: center; padding-top: 50px;">
          <h1 style="color: green;">Thanh toán thành công!</h1>
          <p>Mã giao dịch: ${req.query.vnp_TxnRef}</p>
          <p>Bạn có thể đóng cửa sổ này và quay lại ứng dụng.</p>
        </body>
      </html>
    `);
  } else {
    res.send(`
      <html>
        <body style="font-family: sans-serif; text-align: center; padding-top: 50px;">
          <h1 style="color: red;">Thanh toán thất bại hoặc đã bị hủy!</h1>
          <p>Mã lỗi: ${responseCode}</p>
          <p>Vui lòng thử lại.</p>
        </body>
      </html>
    `);
  }
});

// 4. Check Status (Mobile App polling)
app.get("/api/payment/check-status/:token", async (req, res) => {
  try {
    await connectPool();
    const result = await pool.request()
      .input("token", sql.VarChar(36), req.params.token)
      .query("SELECT IsUsed FROM UnlockTokens WHERE Token = @token");

    if (result.recordset.length === 0) return res.status(404).json({ error: "Not found" });

    // Kiểm tra boolean (false hoặc 0)
    if (!result.recordset[0].IsUsed) {
      res.json({ status: "success" });
    } else {
      res.json({ status: "pending" });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---------- START SERVER ----------
app.listen(process.env.PORT ?? 3000, async () => {
  console.log(`[api] listening on http://0.0.0.0:${process.env.PORT ?? 3000}`);
  try {
    await connectPool();
    console.log("[db] connection verified on startup");
  } catch (e) {
    console.error("[db] FAILED on startup:", e.message);
  }
});