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


// 👈 Bộ nhớ tạm lưu các quán đang chờ thanh toán (Không lưu vào DB)
const pendingShops = new Map();
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
app.use(express.static(path.join(process.cwd(), "public")));

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


// server/server.js
app.post("/api/ai/translate", async (req, res) => {
  const { text, targetLang } = req.body ?? {};

  if (!text || !targetLang) {
    return res.status(400).json({ error: "missing_params" });
  }

  try {
    const translated = await translateTextGemini(text, targetLang);
    res.json({ text: translated, cached: false });
  } catch (err) {
    console.error("[POST /api/ai/translate]", err);
    res.status(500).json({ error: "translate_failed", message: err.message });
  }
});

// server/server.js
app.post("/api/ai/translate-batch", async (req, res) => {
  const { texts, targetLang } = req.body ?? {};

  if (!texts || !Array.isArray(texts) || !targetLang) {
    return res.status(400).json({ error: "missing_params" });
  }
  if (targetLang === "vi") return res.json({ texts });

  try {
    // Gộp cả mảng text thành 1 chuỗi JSON
    const promptText = `Translate the following JSON array of strings into natural spoken ${targetLang}. Return ONLY a valid JSON array of strings in the exact same order. Do not include markdown formatting or backticks.\n\n${JSON.stringify(texts)}`;

    // Import thư viện Gemini trực tiếp ở đây (hoặc từ aiService)
    const { GoogleGenAI } = await import("@google/genai");
    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

    // 👈 CHỈ GỌI API 1 LẦN DUY NHẤT
    const response = await ai.models.generateContent({
      model: process.env.GEMINI_MODEL ?? "gemini-3.5-flash-lite",
      contents: promptText,
    });

    let rawText = response.text?.trim() || "[]";
    if (rawText.startsWith("```json")) {
      rawText = rawText.replace(/```json/g, "").replace(/```/g, "").trim();
    }

    const translatedArray = JSON.parse(rawText);
    res.json({ texts: translatedArray });
  } catch (err) {
    console.error("[POST /api/ai/translate-batch]", err);
    // Nếu AI lỗi (429), trả về nguyên bản tiếng Việt để app không bị crash
    res.json({ texts });
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
    // Kiểm tra xem mã có tồn tại, chưa hết hạn và chưa dùng không
    const result = await pool.request()
      .input("token", sql.VarChar(36), token)
      .query(`SELECT Token, ExpiresAt FROM UnlockTokens 
              WHERE Token = @token AND ExpiresAt > GETUTCDATE() AND IsUsed = 0`);

    if (result.recordset.length === 0) {
      return res.status(401).json({ error: "Mã không hợp lệ hoặc đã hết hạn." });
    }


    // await pool.request()
    //   .input("token", sql.VarChar(36), token)
    //   .query(`UPDATE UnlockTokens SET IsUsed = 1 WHERE Token = @token`);

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

    // 👇 Thêm dòng này để đếm số người dùng đang hoạt động
    const activeUsers = (await pool.request().query("SELECT COUNT(*) as count FROM UnlockTokens WHERE ExpiresAt > GETUTCDATE() AND IsUsed = 0")).recordset[0].count;

    const totalPois = (await pool.request().query("SELECT COUNT(*) as count FROM POIs")).recordset[0].count;

    // Trả về thêm activeUsers
    res.json({ totalTokens, activeUsers, totalPois });
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
app.post("/api/admin/shopkeeper/approve/:id", async (req, res) => {
  try {
    await connectPool();
    
    // 👈 Lấy ClaimCode hiện có của quán
    const shop = (await pool.request()
      .input("id", sql.VarChar(50), req.params.id)
      .query("SELECT ClaimCode FROM Shopkeepers WHERE Id = @id")).recordset[0];

    if (!shop) return res.status(404).json({ error: "Không tìm thấy quán" });

    // Chỉ cập nhật trạng thái
    await pool.request()
      .input("id", sql.VarChar(50), req.params.id)
      .query("UPDATE Shopkeepers SET Status = 'approved' WHERE Id = @id");

    res.json({ success: true, claimCode: shop.ClaimCode });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/admin/shopkeeper/pending", async (req, res) => {
  try {
    await connectPool();
    // Chỉ lấy các quán chờ duyệt, không có mã claim code (tức là đăng ký tiền mặt)
    const result = await pool.request().query("SELECT * FROM Shopkeepers WHERE Status = 'pending' AND ClaimCode IS NULL");
    res.json({ shops: result.recordset });
  } catch (err) {
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
  console.log("🔥 [VNPAY IPN] Có tín hiệu gọi về từ VNPAY!", req.query);

  try {
    // 1. KIỂM TRA CHỮ KÝ (Không được xóa)
    const verify = vnpay.verifyIpnCall(req.query);

    if (!verify.isVerified) {
      console.log("❌ [VNPAY IPN] Sai chữ ký (Invalid signature)");
      return res.json({ RspCode: '97', Message: 'Invalid signature' });
    }

    // 2. KIỂM TRA TRẠNG THÁI (Không được xóa)
    if (!verify.isSuccess) {
      console.log("⚠️ [VNPAY IPN] Giao dịch thất bại hoặc bị hủy");
      return res.json({ RspCode: '00', Message: 'Confirm Success' });
    }

    const txnRef = verify.vnp_TxnRef;

    // 3. PHÂN LUỒNG XỬ LÝ
    if (txnRef.startsWith('CLAIM-')) {
      // --- LUỒNG SHOPKEEPER THANH TOÁN ---
      // Lấy thông tin quán từ RAM (đã lưu tạm lúc bấm nút Đăng ký)
      const shopData = pendingShops.get(txnRef);

      if (shopData) {
        await connectPool();
        
        // Vì chưa có trong DB nên ta dùng lệnh INSERT
        await pool.request()
          .input("id", sql.VarChar(50), shopData.id)
          .input("poiId", sql.VarChar(50), shopData.poiId)
          .input("name", sql.NVarChar(255), shopData.name)
          .input("desc", sql.NVarChar(1000), shopData.descriptionVi)
          .input("hours", sql.NVarChar(100), shopData.openingHours)
          .input("phone", sql.NVarChar(20), shopData.phone)
          .input("img", sql.NVarChar(500), shopData.imageUrl)
          .input("lat", sql.Decimal(9, 6), shopData.latitude)
          .input("lng", sql.Decimal(9, 6), shopData.longitude)
          .input("claimCode", sql.NVarChar(50), shopData.claimCode)
          .query(`
            INSERT INTO Shopkeepers (Id, PoiId, Name, DescriptionVi, OpeningHours, Phone, ImageUrl, Latitude, Longitude, ClaimCode, Status, IsClaimed)
            VALUES (@id, @poiId, @name, @desc, @hours, @phone, @img, @lat, @lng, @claimCode, 'approved', 1)
          `);
          
        // Lưu thành công thì xóa khỏi RAM để giải phóng bộ nhớ
        pendingShops.delete(txnRef); 
        console.log(`✅ [VNPAY IPN] Shop ${txnRef} đã lưu vào DB thành công!`);
      } else {
        console.log(`⚠️ [VNPAY IPN] Không tìm thấy dữ liệu Shop ${txnRef} trong RAM (Có thể server đã restart).`);
      }
      
      return res.json({ RspCode: '00', Message: 'Confirm Success' });
      
    } else {
      // --- LUỒNG KHÁCH HÀNG MUA VÉ ---
      await connectPool();
      await pool.request()
        .input("token", sql.VarChar(36), txnRef)
        .query("UPDATE UnlockTokens SET IsUsed = 0 WHERE Token = @token");

      console.log(`✅ [VNPAY IPN] Đã kích hoạt Token ${txnRef} cho khách hàng!`);
      return res.json({ RspCode: '00', Message: 'Confirm Success' });
    }

  } catch (err) {
    console.error("❌ [VNPAY IPN] Lỗi:", err);
    return res.json({ RspCode: '99', Message: 'Unknown error' });
  }
});

// 3. Return URL (Trình duyệt redirect về)
// 3. Return URL (Trình duyệt redirect về)
app.get('/api/payment/vnpay-return', async (req, res) => {
  const responseCode = String(req.query.vnp_ResponseCode || "");
  const token = req.query.vnp_TxnRef;

  //  Log ra để xem VNPAY thực sự gửi cái gì về
  console.log(" [VNPAY Return] Tham số nhận được:", req.query);

  if (responseCode === '00' && token) {
    // 1. Gửi HTML về cho trình duyệt ngay lập tức (để App không bị treo chờ)
    res.send(`
      <html>
        <body style="font-family: sans-serif; text-align: center; padding-top: 50px;">
          <h1 style="color: green;">Thanh toán thành công!</h1>
          <p>Mã giao dịch: ${token}</p>
          <p>Bạn có thể đóng cửa sổ này và quay lại ứng dụng.</p>
        </body>
      </html>
    `);

    // 2. Chạy ngầm cập nhật Database
    try {
      await connectPool();
      await pool.request()
        .input("token", sql.VarChar(36), token)
        .query("UPDATE UnlockTokens SET IsUsed = 0 WHERE Token = @token");
      console.log(` [VNPAY Return] Đã cập nhật Token ${token} (IsUsed = 0)`);
    } catch (err) {
      console.error("[VNPAY Return] Lỗi cập nhật DB:", err);
    }
    return;
  }

  // Trường hợp thanh toán thất bại hoặc hủy
  res.send(`
    <html>
      <body style="font-family: sans-serif; text-align: center; padding-top: 50px;">
        <h1 style="color: red;">Thanh toán thất bại hoặc đã bị hủy!</h1>
        <p>Mã lỗi: ${responseCode}</p>
        <p>Vui lòng thử lại.</p>
      </body>
    </html>
  `);
});

app.get("/api/payment/check-status/:token", async (req, res) => {
  try {
    await connectPool();
    const result = await pool.request()
      .input("token", sql.VarChar(36), req.params.token)
      .query("SELECT IsUsed FROM UnlockTokens WHERE Token = @token");

    if (result.recordset.length === 0) return res.status(404).json({ error: "Not found" });

    // Nếu IsUsed = 0 (hoặc false), trả về success
    if (!result.recordset[0].IsUsed) {
      res.json({ status: "success" });
    } else {
      res.json({ status: "pending" });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
//host web
app.get('*', (req, res) => {
  res.sendFile(path.join(process.cwd(), 'public', 'index.html'));
});
app.get("/api/pois", async (_req, res) => {
  try {
    await connectPool();
    const poiResult = await pool.request().query(`SELECT * FROM POIs ORDER BY Id`);
    const pois = poiResult.recordset.map(rowToPoi);

    // 👈 Chỉ lấy những quán có Status = 'approved'
    const shopResult = await pool.request().query(`SELECT * FROM Shopkeepers WHERE Status = 'approved'`);
    const shops = shopResult.recordset;

    const finalPois = pois.map(poi => ({
      ...poi,
      shopkeepers: shops.filter(s => s.PoiId === poi.id).map(s => ({
        id: s.Id, name: s.Name, descriptionVi: s.DescriptionVi,
        imageUrl: s.ImageUrl, openingHours: s.OpeningHours, phone: s.Phone
      }))
    }));

    res.json({ pois: finalPois });
  } catch (err) {
    res.status(500).json({ error: "db_error", message: err.message });
  }
});
app.get("/api/shopkeeper/verify/:claimCode", async (req, res) => {
  try {
    await connectPool();
    const result = await pool.request()
      .input("claimCode", sql.NVarChar(50), req.params.claimCode)
      .query("SELECT * FROM Shopkeepers WHERE ClaimCode = @claimCode");

    if (result.recordset.length === 0) {
      return res.status(404).json({ error: "Mã không hợp lệ hoặc không tồn tại." });
    }
    res.json({ shop: result.recordset[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
app.put("/api/shopkeeper/update/:claimCode", upload.single("image"), async (req, res) => {
  const { claimCode } = req.params;
  const { name, descriptionVi, openingHours, phone } = req.body;

  try {
    await connectPool();
    
    // Lấy thông tin cũ để giữ lại ảnh nếu không upload ảnh mới
    const oldShop = (await pool.request()
      .input("claimCode", sql.NVarChar(50), claimCode)
      .query("SELECT ImageUrl FROM Shopkeepers WHERE ClaimCode = @claimCode")).recordset[0];

    if (!oldShop) return res.status(404).json({ error: "Mã không hợp lệ" });

    const imageUrl = req.file ? `/uploads/${req.file.filename}` : oldShop.ImageUrl;

    await pool.request()
      .input("claimCode", sql.NVarChar(50), claimCode)
      .input("name", sql.NVarChar(255), name)
      .input("desc", sql.NVarChar(1000), descriptionVi)
      .input("hours", sql.NVarChar(100), openingHours)
      .input("phone", sql.NVarChar(20), phone)
      .input("img", sql.NVarChar(500), imageUrl)
      .query(`
        UPDATE Shopkeepers 
        SET Name = @name, DescriptionVi = @desc, OpeningHours = @hours, 
            Phone = @phone, ImageUrl = @img, IsClaimed = 1
        WHERE ClaimCode = @claimCode
      `);

    res.json({ success: true, message: "Cập nhật thành công!" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
// ---------- API: Đăng ký quán mới ----------
app.post("/api/shopkeeper/register", upload.single("image"), async (req, res) => {
  const { poiId, name, descriptionVi, openingHours, phone, latitude, longitude, paymentMethod } = req.body;
  if (!poiId || !name || !latitude || !longitude) {
    return res.status(400).json({ error: "Vui lòng nhập đủ thông tin và chọn vị trí trên bản đồ." });
  }

  try {
    const shopId = "shop_" + Math.floor(1000 + Math.random() * 9000);
    const imageUrl = req.file ? `/uploads/${req.file.filename}` : null;
    const claimCode = "CLAIM-" + Math.random().toString(36).substring(2, 6).toUpperCase();

    // 👈 LƯU VÀO RAM (Không lưu vào DB lúc này)
    pendingShops.set(claimCode, {
      id: shopId, poiId, name, 
      descriptionVi: descriptionVi || "", 
      openingHours: openingHours || "", 
      phone: phone || "", 
      imageUrl, latitude, longitude, 
      claimCode, paymentMethod
    });

    res.json({ success: true, shopId, claimCode });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
app.post("/api/payment/create-shop-vnpay", async (req, res) => {
  const { claimCode } = req.body; // Frontend gửi claimCode lên
  try {
    if (!pendingShops.has(claimCode)) {
       return res.status(404).json({ error: "Không tìm thấy thông tin đăng ký" });
    }

    const paymentUrl = vnpay.buildPaymentUrl({
      vnp_Amount: 50000, 
      vnp_IpAddr: '127.0.0.1',
      vnp_TxnRef: claimCode, // 👈 Dùng luôn ClaimCode làm mã giao dịch
      vnp_OrderInfo: `Phi dang ky cua hang ${claimCode}`,
      vnp_OrderType: ProductCode.Other,
      vnp_ReturnUrl: process.env.VNPAY_RETURN_URL,
      vnp_Locale: VnpLocale.VN,
    });
    res.json({ paymentUrl });
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