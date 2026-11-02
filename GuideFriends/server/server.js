import express from "express";
import bcrypt from "bcryptjs";
import cors from "cors";
import sql from "mssql";
import dotenv from "dotenv";
import crypto from "crypto";
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

function parseImages(str) {
  if (!str) return [];
  try {
    const parsed = JSON.parse(str);
    const arr = Array.isArray(parsed) ? parsed : [str];
    return arr.filter(url => url && !url.includes("example.com"));
  } catch {
    if (str.includes("example.com")) return [];
    return [str];
  }
}

// ---------- HELPER FUNCTIONS ----------
function rowToPoi(r) {
  return {
    id: r.Id,
    name: r.Name,
    shortDescriptionVi: r.ShortDescriptionVi,
    fullDescriptionVi: r.FullDescriptionVi,
    radiusMeters: r.RadiusMeters,
    imageUrl: r.ImageUrl, // Ảnh chính
    imageUrls: parseImages(r.GalleryImages), // Mảng Gallery
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

// ==========================================
// 1. POI ROUTES
// ==========================================
app.get("/api/pois", async (_req, res) => {
  try {
    await connectPool();
    const poiResult = await pool.request().query(`SELECT * FROM POIs ORDER BY Id`);
    const pois = poiResult.recordset.map(rowToPoi);

    const shopResult = await pool.request().query(`SELECT * FROM Shopkeepers WHERE Status = 'approved'`);
    const shops = shopResult.recordset;

    const finalPois = pois.map(poi => ({
      ...poi,
      shopkeepers: shops.filter(s => s.PoiId === poi.id).map(s => ({
        id: s.Id, 
        name: s.Name, 
        descriptionVi: s.DescriptionVi,
        imageUrl: s.ImageUrl, // Ảnh chính
        imageUrls: parseImages(s.GalleryImages), // Mảng Gallery
        openingHours: s.OpeningHours, 
        phone: s.Phone,
        latitude: s.Latitude, 
        longitude: s.Longitude
      }))
    }));

    res.json({ pois: finalPois });
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
      .query(`SELECT * FROM POIs WHERE Id = @id`);
    if (result.recordset.length === 0) {
      return res.status(404).json({ error: "not_found" });
    }
    res.json({ poi: rowToPoi(result.recordset[0]) });
  } catch (err) {
    res.status(500).json({ error: "db_error", message: err.message });
  }
});

app.get("/health", (_req, res) => res.json({ ok: true }));

// ==========================================
// 2. AI ROUTES
// ==========================================
app.post("/api/ai/translate", async (req, res) => {
  const { text, targetLang } = req.body ?? {};
  if (!text || !targetLang) return res.status(400).json({ error: "missing_params" });

  try {
    const translated = await translateTextGemini(text, targetLang);
    res.json({ text: translated, cached: false });
  } catch (err) {
    res.status(500).json({ error: "translate_failed", message: err.message });
  }
});

app.post("/api/ai/translate-batch", async (req, res) => {
  const { texts, targetLang } = req.body ?? {};
  if (!texts || !Array.isArray(texts) || !targetLang) return res.status(400).json({ error: "missing_params" });
  if (targetLang === "vi") return res.json({ texts });

  try {
    const promptText = `Translate the following JSON array of strings into natural spoken ${targetLang}. Return ONLY a valid JSON array of strings in the exact same order. Do not include markdown formatting or backticks.\n\n${JSON.stringify(texts)}`;
    const { GoogleGenAI } = await import("@google/genai");
    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

    const response = await ai.models.generateContent({
      model: process.env.GEMINI_MODEL ?? "gemini-1.5-flash",
      contents: promptText,
    });

    let rawText = response.text?.trim() || "[]";
    if (rawText.startsWith("```json")) rawText = rawText.replace(/```json/g, "").replace(/```/g, "").trim();

    const translatedArray = JSON.parse(rawText);
    res.json({ texts: translatedArray });
  } catch (err) {
    console.error("[POST /api/ai/translate-batch]", err);
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
      const row = (await pool.request().input("id", sql.VarChar(50), poiId).query(`SELECT FullDescriptionVi FROM POIs WHERE Id = @id`)).recordset[0];
      contextVi = row?.FullDescriptionVi ?? "";
    }
    const answer = await chatWithContext({ question, contextVi, targetLang });
    res.json({ answer });
  } catch (err) {
    res.status(500).json({ error: "chat_failed", message: err.message });
  }
});

// ==========================================
// 3. CLERK & AUTH ROUTES
// ==========================================
app.post("/api/clerk/generate-token", async (req, res) => {
  const { username } = req.body;
  try {
    await connectPool();
    const clerk = (await pool.request().input("username", sql.NVarChar(100), username).query("SELECT Id FROM Clerks WHERE Username = @username")).recordset[0];
    if (!clerk) return res.status(404).json({ error: "Clerk not found" });

    const token = generate6CharToken();
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

    await pool.request()
      .input("token", sql.VarChar(36), token)
      .input("clerkId", sql.UniqueIdentifier, clerk.Id)
      .input("expiresAt", sql.DateTime2, expiresAt)
      .query(`INSERT INTO UnlockTokens (Token, CreatedByClerkId, ExpiresAt, Source, IsUsed) VALUES (@token, @clerkId, @expiresAt, 'clerk', 0)`);

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
      .query(`SELECT Token, ExpiresAt FROM UnlockTokens WHERE Token = @token AND ExpiresAt > GETUTCDATE() AND IsUsed = 0`);

    if (result.recordset.length === 0) return res.status(401).json({ error: "Mã không hợp lệ hoặc đã hết hạn." });
    res.json({ valid: true, message: "Mở khóa thành công!" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ==========================================
// 4. ADMIN ROUTES
// ==========================================
app.post("/api/admin/login", async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: "Vui lòng nhập đủ tài khoản và mật khẩu" });

  try {
    await connectPool();
    const result = await pool.request().input("username", sql.NVarChar(100), username).query("SELECT * FROM Admins WHERE Username = @username");
    const admin = result.recordset[0];

    if (!admin) return res.status(401).json({ error: "Sai tài khoản hoặc mật khẩu" });
    const isMatch = await bcrypt.compare(password, admin.PasswordHash);
    if (!isMatch) return res.status(401).json({ error: "Sai tài khoản hoặc mật khẩu" });

    res.json({ success: true, message: "Đăng nhập thành công", adminName: admin.FullName });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/admin/stats", async (req, res) => {
  try {
    await connectPool();
    const totalTokens = (await pool.request().query("SELECT COUNT(*) as count FROM UnlockTokens")).recordset[0].count;
    const activeUsers = (await pool.request().query("SELECT COUNT(*) as count FROM UnlockTokens WHERE ExpiresAt > GETUTCDATE() AND IsUsed = 0")).recordset[0].count;
    const totalPois = (await pool.request().query("SELECT COUNT(*) as count FROM POIs")).recordset[0].count;

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
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/admin/pois", upload.array("images", 10), async (req, res) => {
  try {
    await connectPool();
    const { name, shortDescriptionVi, fullDescriptionVi, latitude, longitude, radiusMeters, mainImage, galleryImages } = req.body;
    const newId = "poi_" + Math.floor(1000 + Math.random() * 9000);

    let finalGallery = [];
    try { finalGallery = JSON.parse(galleryImages || "[]"); } catch (e) { }

    if (req.files && req.files.length > 0) {
      const newImages = req.files.map(f => `/uploads/${f.filename}`);
      finalGallery = [...finalGallery, ...newImages];
    }
    const galleryStr = JSON.stringify(finalGallery);

    let finalMainImage = mainImage;
    if (!finalMainImage && finalGallery.length > 0) finalMainImage = finalGallery[0];

    await pool.request()
      .input("id", sql.VarChar(50), newId)
      .input("name", sql.NVarChar(255), name)
      .input("shortDesc", sql.NVarChar(500), shortDescriptionVi)
      .input("fullDesc", sql.NVarChar(sql.MAX), fullDescriptionVi)
      .input("lat", sql.Decimal(9, 6), latitude)
      .input("lng", sql.Decimal(9, 6), longitude)
      .input("radius", sql.Int, radiusMeters || 20)
      .input("imageUrl", sql.VarChar(500), finalMainImage) 
      .input("gallery", sql.NVarChar(sql.MAX), galleryStr)
      .query(`
        INSERT INTO POIs (Id, Name, ShortDescriptionVi, FullDescriptionVi, Latitude, Longitude, RadiusMeters, ImageUrl, GalleryImages)
        VALUES (@id, @name, @shortDesc, @fullDesc, @lat, @lng, @radius, @imageUrl, @gallery)
      `);

    res.json({ success: true, id: newId });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put("/api/admin/pois/:id", upload.array("images", 10), async (req, res) => {
  const { id } = req.params;
  const { name, shortDescriptionVi, fullDescriptionVi, latitude, longitude, radiusMeters, mainImage, galleryImages } = req.body;

  try {
    await connectPool();
    let finalGallery = [];
    try { finalGallery = JSON.parse(galleryImages || "[]"); } catch (e) { }

    if (req.files && req.files.length > 0) {
      const newImages = req.files.map(f => `/uploads/${f.filename}`);
      finalGallery = [...finalGallery, ...newImages];
    }
    const galleryStr = JSON.stringify(finalGallery);

    let finalMainImage = mainImage;
    if (!finalMainImage && finalGallery.length > 0) finalMainImage = finalGallery[0];

    await pool.request()
      .input("id", sql.VarChar(50), id)
      .input("name", sql.NVarChar(255), name)
      .input("shortDesc", sql.NVarChar(500), shortDescriptionVi)
      .input("fullDesc", sql.NVarChar(sql.MAX), fullDescriptionVi)
      .input("lat", sql.Decimal(9, 6), latitude)
      .input("lng", sql.Decimal(9, 6), longitude)
      .input("radius", sql.Int, radiusMeters || 20)
      .input("imageUrl", sql.VarChar(500), finalMainImage)
      .input("gallery", sql.NVarChar(sql.MAX), galleryStr)
      .query(`
        UPDATE POIs 
        SET Name = @name, ShortDescriptionVi = @shortDesc, FullDescriptionVi = @fullDesc,
            Latitude = @lat, Longitude = @lng, RadiusMeters = @radius, 
            ImageUrl = @imageUrl, GalleryImages = @gallery
        WHERE Id = @id
      `);

    res.json({ success: true, id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ==========================================
// 5. SHOPKEEPER ROUTES
// ==========================================
app.get("/api/admin/shopkeepers", async (req, res) => {
  try {
    await connectPool();
    const result = await pool.request().query("SELECT * FROM Shopkeepers ORDER BY CreatedAt DESC");
    res.json({ shops: result.recordset });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/admin/shopkeeper/pending", async (req, res) => {
  try {
    await connectPool();
    const result = await pool.request().query("SELECT * FROM Shopkeepers WHERE Status IN ('pending', 'pending_vnpay') ORDER BY CreatedAt DESC");
    res.json({ shops: result.recordset });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/admin/shopkeeper/approve/:id", async (req, res) => {
  try {
    await connectPool();
    const shop = (await pool.request().input("id", sql.VarChar(50), req.params.id).query("SELECT ClaimCode FROM Shopkeepers WHERE Id = @id")).recordset[0];
    if (!shop) return res.status(404).json({ error: "Không tìm thấy quán" });

    await pool.request().input("id", sql.VarChar(50), req.params.id).query("UPDATE Shopkeepers SET Status = 'approved' WHERE Id = @id");
    res.json({ success: true, claimCode: shop.ClaimCode });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/shopkeeper/verify/:claimCode", async (req, res) => {
  try {
    await connectPool();
    const cleanClaimCode = req.params.claimCode.trim();
    const result = await pool.request().input("claimCode", sql.NVarChar(50), cleanClaimCode).query("SELECT * FROM Shopkeepers WHERE ClaimCode = @claimCode");

    if (result.recordset.length === 0) return res.status(404).json({ error: "Mã không tồn tại trong DB." });

    const shop = result.recordset[0];
    if (shop.Status !== 'approved') return res.status(403).json({ error: `Quán chưa được duyệt (Trạng thái: ${shop.Status}).` });

    res.json({ shop });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 👈 SỬA LỖI TẠI ĐÂY: Cập nhật route cập nhật của Shopkeeper
app.put("/api/shopkeeper/update/:claimCode", upload.array("images", 10), async (req, res) => {
  const { claimCode } = req.params;
  const { name, descriptionVi, openingHours, phone, poiId, mainImage, galleryImages } = req.body;

  try {
    await connectPool();

    let finalGallery = [];
    try { finalGallery = JSON.parse(galleryImages || "[]"); } catch (e) { }

    if (req.files && req.files.length > 0) {
      const newImages = req.files.map(f => `/uploads/${f.filename}`);
      finalGallery = [...finalGallery, ...newImages];
    }
    const galleryStr = JSON.stringify(finalGallery);

    let finalMainImage = mainImage;
    if (!finalMainImage && finalGallery.length > 0) finalMainImage = finalGallery[0];

    await pool.request()
      .input("claimCode", sql.NVarChar(50), claimCode)
      .input("name", sql.NVarChar(255), name)
      .input("desc", sql.NVarChar(1000), descriptionVi)
      .input("hours", sql.NVarChar(100), openingHours)
      .input("phone", sql.NVarChar(20), phone)
      .input("poiId", sql.VarChar(50), poiId)
      .input("imageUrl", sql.VarChar(500), finalMainImage)
      .input("gallery", sql.NVarChar(sql.MAX), galleryStr)
      .query(`
        UPDATE Shopkeepers 
        SET Name = @name, DescriptionVi = @desc, OpeningHours = @hours, 
            Phone = @phone, ImageUrl = @imageUrl, GalleryImages = @gallery, PoiId = @poiId, IsClaimed = 1
        WHERE ClaimCode = @claimCode
      `);

    res.json({ success: true, message: "Cập nhật thành công!" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 👈 SỬA LỖI TẠI ĐÂY: Cập nhật route đăng ký của Shopkeeper
app.post("/api/shopkeeper/register", upload.array("images", 10), async (req, res) => {
  const { poiId, name, descriptionVi, openingHours, phone, latitude, longitude, paymentMethod } = req.body;

  if (!poiId || !name || !latitude || !longitude) {
    return res.status(400).json({ error: "Vui lòng nhập đủ thông tin và chọn vị trí trên bản đồ." });
  }

  try {
    const shopId = "shop_" + Math.floor(1000 + Math.random() * 9000);
    
    let finalGallery = [];
    if (req.files && req.files.length > 0) {
      finalGallery = req.files.map(f => `/uploads/${f.filename}`);
    }
    const galleryStr = JSON.stringify(finalGallery);
    const mainImg = finalGallery.length > 0 ? finalGallery[0] : null;

    const shopData = { 
      id: shopId, poiId, name, 
      descriptionVi: descriptionVi || "", 
      openingHours: openingHours || "", 
      phone: phone || "", 
      latitude, longitude, 
      mainImg, galleryStr 
    };

    if (paymentMethod === "cash") {
      await connectPool();
      await pool.request()
        .input("id", sql.VarChar(50), shopId)
        .input("poiId", sql.VarChar(50), poiId)
        .input("name", sql.NVarChar(255), name)
        .input("desc", sql.NVarChar(1000), shopData.descriptionVi)
        .input("hours", sql.NVarChar(100), shopData.openingHours)
        .input("phone", sql.NVarChar(20), shopData.phone)
        .input("img", sql.VarChar(500), shopData.mainImg)
        .input("gallery", sql.NVarChar(sql.MAX), shopData.galleryStr)
        .input("lat", sql.Decimal(9, 6), latitude)
        .input("lng", sql.Decimal(9, 6), longitude)
        .query(`
          INSERT INTO Shopkeepers (Id, PoiId, Name, DescriptionVi, OpeningHours, Phone, ImageUrl, GalleryImages, Latitude, Longitude, Status, IsClaimed)
          VALUES (@id, @poiId, @name, @desc, @hours, @phone, @img, @gallery, @lat, @lng, 'pending', 1)
        `);
      return res.json({ success: true, message: "Chờ Admin duyệt thanh toán tiền mặt" });
    } else {
      const claimCode = "CLAIM-" + Math.random().toString(36).substring(2, 6).toUpperCase();

      await connectPool();
      await pool.request()
        .input("id", sql.VarChar(50), shopId)
        .input("poiId", sql.VarChar(50), poiId)
        .input("name", sql.NVarChar(255), name)
        .input("desc", sql.NVarChar(1000), shopData.descriptionVi)
        .input("hours", sql.NVarChar(100), shopData.openingHours)
        .input("phone", sql.NVarChar(20), shopData.phone)
        .input("img", sql.VarChar(500), shopData.mainImg)
        .input("gallery", sql.NVarChar(sql.MAX), shopData.galleryStr)
        .input("lat", sql.Decimal(9, 6), latitude)
        .input("lng", sql.Decimal(9, 6), longitude)
        .input("claimCode", sql.NVarChar(50), claimCode)
        .query(`
          INSERT INTO Shopkeepers (Id, PoiId, Name, DescriptionVi, OpeningHours, Phone, ImageUrl, GalleryImages, Latitude, Longitude, ClaimCode, Status, IsClaimed)
          VALUES (@id, @poiId, @name, @desc, @hours, @phone, @img, @gallery, @lat, @lng, @claimCode, 'pending_vnpay', 1)
        `);
      return res.json({ success: true, tempVnpayRef: claimCode });
    }
  } catch (err) {
    console.error("[POST /api/shopkeeper/register]", err);
    res.status(500).json({ error: err.message });
  }
});

// ==========================================
// 6. VNPAY ROUTES
// ==========================================
app.post("/api/payment/create-vnpay-url", async (req, res) => {
  try {
    await connectPool();
    const token = generate6CharToken();
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
    const clerk = (await pool.request().query("SELECT TOP 1 Id FROM Clerks")).recordset[0];

    await pool.request()
      .input("token", sql.VarChar(36), token)
      .input("clerkId", sql.UniqueIdentifier, clerk.Id)
      .input("expiresAt", sql.DateTime2, expiresAt)
      .query(`INSERT INTO UnlockTokens (Token, CreatedByClerkId, ExpiresAt, Source, IsUsed) VALUES (@token, @clerkId, @expiresAt, 'vnpay', 1)`);

    const paymentUrl = vnpay.buildPaymentUrl({
      vnp_Amount: 15000,
      vnp_IpAddr: '127.0.0.1',
      vnp_TxnRef: token,
      vnp_OrderInfo: `Thanh toan ve ${token}`,
      vnp_OrderType: ProductCode.Other,
      vnp_ReturnUrl: process.env.VNPAY_RETURN_URL,
      vnp_Locale: VnpLocale.VN,
    });

    res.json({ paymentUrl, token });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/payment/create-shop-vnpay", async (req, res) => {
  const { tempVnpayRef } = req.body;
  if (!tempVnpayRef) return res.status(400).json({ error: "Thiếu mã đăng ký (tempVnpayRef)" });

  try {
    const paymentUrl = vnpay.buildPaymentUrl({
      vnp_Amount: 50000,
      vnp_IpAddr: '127.0.0.1',
      vnp_TxnRef: tempVnpayRef,
      vnp_OrderInfo: `Phi dang ky cua hang ${tempVnpayRef}`,
      vnp_OrderType: ProductCode.Other,
      vnp_ReturnUrl: process.env.VNPAY_RETURN_URL,
      vnp_Locale: VnpLocale.VN,
    });

    res.json({ paymentUrl });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/payment/vnpay-ipn', async (req, res) => {
  try {
    const verify = vnpay.verifyIpnCall(req.query);

    if (!verify.isVerified) return res.json({ RspCode: '97', Message: 'Invalid signature' });
    if (!verify.isSuccess) return res.json({ RspCode: '00', Message: 'Confirm Success' });

    const txnRef = verify.vnp_TxnRef;
    await connectPool();

    if (txnRef.startsWith('CLAIM-')) {
      await pool.request()
        .input("claimCode", sql.NVarChar(50), txnRef)
        .query("UPDATE Shopkeepers SET Status = 'approved' WHERE ClaimCode = @claimCode");
    } else {
      await pool.request()
        .input("token", sql.VarChar(36), txnRef)
        .query("UPDATE UnlockTokens SET IsUsed = 0 WHERE Token = @token");
    }

    return res.json({ RspCode: '00', Message: 'Confirm Success' });
  } catch (err) {
    return res.json({ RspCode: '99', Message: 'Unknown error' });
  }
});

app.get('/api/payment/vnpay-return', async (req, res) => {
  const responseCode = req.query.vnp_ResponseCode;
  const txnRef = req.query.vnp_TxnRef;

  if (responseCode === '00' && txnRef) {
    try {
      await connectPool();
      if (txnRef.startsWith('CLAIM-')) {
        await pool.request().input("claimCode", sql.NVarChar(50), txnRef).query("UPDATE Shopkeepers SET Status = 'approved' WHERE ClaimCode = @claimCode");
      } else {
        await pool.request().input("token", sql.VarChar(36), txnRef).query("UPDATE UnlockTokens SET IsUsed = 0 WHERE Token = @token");
      }
    } catch (e) { }

    res.send(`
      <html>
        <body style="font-family: sans-serif; text-align: center; padding-top: 50px;">
          <h1 style="color: green;">Thanh toán thành công!</h1>
          <p>Mã giao dịch: ${txnRef}</p>
          <p>Bạn có thể đóng cửa sổ này và quay lại ứng dụng.</p>
        </body>
      </html>
    `);
  } else {
    res.send(`<h1 style="color: red; text-align: center; margin-top: 50px;">Thanh toán thất bại hoặc đã bị hủy!</h1>`);
  }
});

app.get("/api/payment/check-status/:token", async (req, res) => {
  try {
    await connectPool();
    const result = await pool.request().input("token", sql.VarChar(36), req.params.token).query("SELECT IsUsed FROM UnlockTokens WHERE Token = @token");
    if (result.recordset.length === 0) return res.status(404).json({ error: "Not found" });

    if (!result.recordset[0].IsUsed) {
      res.json({ status: "success" });
    } else {
      res.json({ status: "pending" });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---------- CATCH-ALL REACT ROUTER ----------
app.get('*', (req, res) => {
  res.sendFile(path.join(process.cwd(), 'public', 'index.html'));
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