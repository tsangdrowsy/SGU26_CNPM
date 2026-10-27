-- ==========================================
-- GUIDE FRIENDS - MASTER SQL SERVER SCHEMA
-- Dành cho đồ án CNPM - Chùa Linh Ứng
-- ==========================================

USE master;
GO

-- Tạo Database mới (Nếu chưa có)
IF NOT EXISTS (SELECT name FROM sys.databases WHERE name = N'GuideFriendsDB')
BEGIN
    CREATE DATABASE GuideFriendsDB;
END
GO

USE GuideFriendsDB;
GO

-- ==========================================
-- 1. XÓA CÁC BẢNG CŨ (Đảm bảo chạy script không bị lỗi)
-- ==========================================

IF OBJECT_ID('dbo.UnlockTokens', 'U') IS NOT NULL DROP TABLE dbo.UnlockTokens;
IF OBJECT_ID('dbo.Shopkeepers', 'U') IS NOT NULL DROP TABLE dbo.Shopkeepers;
IF OBJECT_ID('dbo.POIs', 'U') IS NOT NULL DROP TABLE dbo.POIs;
IF OBJECT_ID('dbo.Clerks', 'U') IS NOT NULL DROP TABLE dbo.Clerks;
IF OBJECT_ID('dbo.Admins', 'U') IS NOT NULL DROP TABLE dbo.Admins;
GO

-- ==========================================
-- 2. TẠO BẢNG (SCHEMA)
-- ==========================================

-- 2.1. Clerks (Nhân viên quầy vé tạo token)
CREATE TABLE Clerks (
    Id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
    Username NVARCHAR(100) NOT NULL UNIQUE,
    PasswordHash NVARCHAR(255) NOT NULL, -- Trong thực tế dùng bcrypt, ở đây mock string
    FullName NVARCHAR(150),
    CreatedAt DATETIME2 DEFAULT GETUTCDATE()
);
GO

-- 2.1.1. Admins (Quản trị viên hệ thống)
CREATE TABLE Admins (
    Id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
    Username NVARCHAR(100) NOT NULL UNIQUE,
    PasswordHash NVARCHAR(255) NOT NULL, -- Chứa chuỗi Bcrypt
    FullName NVARCHAR(150),
    CreatedAt DATETIME2 DEFAULT GETUTCDATE()
);
GO

-- 2.2. POIs (Points of Interest - Điểm tham quan)
CREATE TABLE POIs (
    Id VARCHAR(50) PRIMARY KEY, -- e.g., 'poi_001'
    Name NVARCHAR(255) NOT NULL,
    ShortDescriptionVi NVARCHAR(500) NOT NULL,
    FullDescriptionVi NVARCHAR(MAX) NOT NULL, -- Dùng cho RAG Context (Flow 3)
    Latitude DECIMAL(9, 6) NOT NULL,
    Longitude DECIMAL(9, 6) NOT NULL,
    RadiusMeters INT DEFAULT 20,
    ImageUrl NVARCHAR(500),
    GalleryImages NVARCHAR(MAX),
    CreatedAt DATETIME2 DEFAULT GETUTCDATE()
);
GO

-- 2.3. Shopkeepers (Quán ăn, cửa hàng gần POI)
CREATE TABLE Shopkeepers (
    Id VARCHAR(50) PRIMARY KEY, -- e.g., 'shop_001'
    PoiId VARCHAR(50) NOT NULL,
    Name NVARCHAR(255) NOT NULL,
    DescriptionVi NVARCHAR(1000),
    ImageUrl NVARCHAR(500),
    GalleryImages NVARCHAR(MAX),
    OpeningHours NVARCHAR(100),
    Phone NVARCHAR(20),
    ClaimCode NVARCHAR(50) UNIQUE, -- Magic link / Code để chủ quán claim (Flow 4)
    IsClaimed BIT DEFAULT 0,
    CreatedAt DATETIME2 DEFAULT GETUTCDATE(),
    FOREIGN KEY (PoiId) REFERENCES POIs(Id) ON DELETE CASCADE
);
GO

-- 2.4. UnlockTokens (Thay thế Redis cho Flow 1: Token 24h)
CREATE TABLE UnlockTokens (
    Token VARCHAR(36) PRIMARY KEY, -- UUID v4
    CreatedByClerkId UNIQUEIDENTIFIER NOT NULL,
    CreatedAt DATETIME2 DEFAULT GETUTCDATE(),
    ExpiresAt DATETIME2 NOT NULL, -- Thời điểm hết hạn (VD: CreatedAt + 24h)
    IsUsed BIT DEFAULT 0,
    FOREIGN KEY (CreatedByClerkId) REFERENCES Clerks(Id)
);
GO

-- Tăng kích thước cột lên để chứa được mảng JSON dài
ALTER TABLE POIs ALTER COLUMN ImageUrl NVARCHAR(MAX);
ALTER TABLE Shopkeepers ALTER COLUMN ImageUrl NVARCHAR(MAX);
-- Thêm cột Trạng thái (pending: Chờ duyệt, approved: Đã duyệt)
ALTER TABLE Shopkeepers ADD Status VARCHAR(20) DEFAULT 'pending';
-- Thêm cột Tọa độ
ALTER TABLE Shopkeepers ADD Latitude DECIMAL(9, 6);
ALTER TABLE Shopkeepers ADD Longitude DECIMAL(9, 6);
GO
ALTER TABLE POIs ALTER COLUMN ImageUrl NVARCHAR(MAX);
ALTER TABLE Shopkeepers ALTER COLUMN ImageUrl NVARCHAR(MAX);
-- Thêm cột Source nếu chưa có (bỏ qua nếu đã thêm từ trước)
ALTER TABLE UnlockTokens ADD Source VARCHAR(20) DEFAULT 'clerk';

-- ==========================================
-- 3. TẠO INDEXES (Tối ưu tốc độ truy vấn)
-- ==========================================
CREATE INDEX IX_Shopkeepers_PoiId ON Shopkeepers(PoiId);
CREATE INDEX IX_Shopkeepers_ClaimCode ON Shopkeepers(ClaimCode);
CREATE INDEX IX_UnlockTokens_ExpiresAt ON UnlockTokens(ExpiresAt);

GO

-- ==========================================
-- 4. SEED DATA (DỮ LIỆU MẪU)
-- ==========================================

-- Insert Clerks
INSERT INTO Clerks (Username, PasswordHash, FullName)
VALUES 
('clerk01', 'hashed_password_123', 'Nguyễn Văn A'),
('admin', 'admin_hash_456', 'Trần Thị B');

-- Insert Admins
INSERT INTO Admins (Username, PasswordHash, FullName)
VALUES 
('admin', '$2a$10$1q2w3e4r5t6y7u8i9o0p1a2s3d4f5g6h7j8k9l0m1n2o3p4q5r6s7t', N'Quản Trị Viên');

-- Insert POIs
USE GuideFriendsDB;
GO

-- ==========================================
-- 0. DỌN DẸP DỮ LIỆU CŨ (Xóa để insert lại cho sạch)
-- ==========================================
DELETE FROM Shopkeepers;
DELETE FROM POIs;
GO

-- ==========================================
-- 1. THÊM DỮ LIỆU MẪU CHO POIs (Mỗi POI có 3 ảnh)
-- ==========================================
INSERT INTO POIs (Id, Name, ShortDescriptionVi, FullDescriptionVi, Latitude, Longitude, RadiusMeters, ImageUrl, GalleryImages)
VALUES
('poi_001', N'Chùa Linh Ứng (Bãi Bụt)', N'Ngôi chùa nổi tiếng với tượng Quán Thế Âm cao nhất Việt Nam.', N'Chùa Linh Ứng tọa lạc trên bán đảo Sơn Trà, được khởi công xây dựng từ năm 2004 và hoàn thành sau 10 năm. Chùa không chỉ là nơi sinh hoạt tín ngưỡng mà còn là điểm đến du lịch nổi tiếng với kiến trúc độc đáo và cảnh quan hùng vĩ.', 16.12345, 108.23456, 30, '/uploads/poi1_1.jpg', '["/uploads/poi1_1.jpg", "/uploads/poi1_2.jpg", "/uploads/poi1_3.jpg"]'),

('poi_002', N'Tượng Quán Thế Âm', N'Tượng Phật bà Quán Âm cao 67m, tương đương tòa nhà 30 tầng.', N'Tượng Quán Thế Âm tại chùa Linh Ứng được xem là cao nhất Việt Nam. Bên trong lòng tượng có 17 tầng, mỗi tầng đều có bệ thờ tượng Phật hình Phật Tổ Như Lai.', 16.12385, 108.23490, 20, '/uploads/poi2_1.jpg', '["/uploads/poi2_1.jpg", "/uploads/poi2_2.jpg", "/uploads/poi2_3.jpg"]'),

('poi_003', N'Cổng Tam Quan', N'Cổng vào chính của chùa với kiến trúc truyền thống.', N'Cổng Tam Quan là nơi đón tiếp du khách, mang đậm nét kiến trúc Phật giáo truyền thống với mái ngói cong vút và các họa tiết rồng phượng tinh xảo.', 16.12305, 108.23410, 15, '/uploads/poi3_1.jpg', '["/uploads/poi3_1.jpg", "/uploads/poi3_2.jpg", "/uploads/poi3_3.jpg"]');
GO

-- ==========================================
-- 2. THÊM DỮ LIỆU MẪU CHO SHOPKEEPERS (Mỗi Shop có 2 ảnh)
-- (Tất cả đều ở trạng thái 'approved' để hiện lên app ngay)
-- ==========================================
INSERT INTO Shopkeepers (Id, PoiId, Name, DescriptionVi, ImageUrl, GalleryImages, OpeningHours, Phone, ClaimCode, IsClaimed, Status)
VALUES
-- Quán thuộc POI 1
('shop_001', 'poi_001', N'Quán Chay Sơn Trà', N'Phục vụ các món chay thanh đạm, không gian yên tĩnh, view nhìn ra biển Đà Nẵng.', '/uploads/shop1_1.jpg', '["/uploads/shop1_1.jpg", "/uploads/shop1_2.jpg"]', '08:00 - 21:00', '0905123456', 'CLAIM-CHAY-01', 1, 'approved'),
('shop_002', 'poi_001', N'Tiệm Lưu Niệm Phật Giáo', N'Chuyên cung cấp vòng tay gỗ, tượng gỗ, nhang trầm và đồ thờ cúng.', '/uploads/shop2_1.jpg', '["/uploads/shop2_1.jpg", "/uploads/shop2_2.jpg"]', '07:00 - 18:00', '0905654321', 'CLAIM-LUU-02', 1, 'approved'),

-- Quán thuộc POI 2
('shop_003', 'poi_002', N'Quán Nước Mía Cô Ba', N'Nước mía tươi mát lạnh, giải nhiệt mùa hè, có kèm ghế đá ngồi nghỉ chân.', '/uploads/shop3_1.jpg', '["/uploads/shop3_1.jpg", "/uploads/shop3_2.jpg"]', '07:00 - 18:00', '0905123987', 'CLAIM-MIA-03', 1, 'approved'),
('shop_004', 'poi_002', N'Tiệm Trà Thảo Mộc', N'Bán các loại trà hoa cúc, trà sen, trà gừng tốt cho sức khỏe, phù hợp làm quà biếu.', '/uploads/shop4_1.jpg', '["/uploads/shop4_1.jpg", "/uploads/shop4_2.jpg"]', '08:00 - 17:00', '0905876543', 'CLAIM-TRA-04', 1, 'approved'),

-- Quán thuộc POI 3
('shop_005', 'poi_003', N'Tiệm Bánh Mì Chay Từ Tâm', N'Bánh mì chay nóng hổi, giòn rụm, nhân nấm và đậu hũ sốt nước tương đặc biệt.', '/uploads/shop5_1.jpg', '["/uploads/shop5_1.jpg", "/uploads/shop5_2.jpg"]', '06:00 - 11:00', '0905112233', 'CLAIM-BANHMI-05', 1, 'approved'),
('shop_006', 'poi_003', N'Quán Cà Phê Sân Vườn', N'Không gian rộng rãi, nhiều cây xanh, thích hợp ngồi nghỉ ngơi sau khi đi bộ tham quan.', '/uploads/shop6_1.jpg', '["/uploads/shop6_1.jpg", "/uploads/shop6_2.jpg"]', '06:30 - 22:00', '0905998877', 'CLAIM-CAFE-06', 1, 'approved');
GO

-- Insert Mock Token (Hết hạn sau 24h kể từ lúc chạy script)
INSERT INTO UnlockTokens (Token, CreatedByClerkId, ExpiresAt)
SELECT 
    'MOCK-TOKEN-1234-5678-90AB-CDEF12345678', 
    (SELECT TOP 1 Id FROM Clerks WHERE Username = 'clerk01'), 
    DATEADD(hour, 24, GETUTCDATE());
GO

-- ==========================================
-- 5. STORED PROCEDURE: Validation Token (Flow 1)
-- ==========================================
CREATE PROCEDURE sp_ValidateUnlockToken
    @InputToken VARCHAR(36)
AS
BEGIN
    SET NOCOUNT ON;
    
    -- Tự động dọn dẹp token hết hạn (Dọn rác thay cho Redis TTL)
    DELETE FROM UnlockTokens WHERE ExpiresAt < GETUTCDATE();

    -- Check token hợp lệ
    IF EXISTS (SELECT 1 FROM UnlockTokens WHERE Token = @InputToken AND ExpiresAt > GETUTCDATE() AND IsUsed = 0)
    BEGIN
        SELECT 1 AS IsValid, 'Token is valid and active.' AS Message;
    END
    ELSE
    BEGIN
        SELECT 0 AS IsValid, 'Token is invalid, expired, or already used.' AS Message;
    END
END
GO



USE GuideFriendsDB;
GO
UPDATE Admins 
SET PasswordHash = '$2b$10$0DgiUhK4vhuo49Va8YXqp.d6e3EluNtgku/bMjRJ19nU8toToTikO' -- 👈 Dán chuỗi vừa copy ở đây
WHERE Username = 'admin';
USE GuideFriendsDB;
GO


UPDATE Shopkeepers 
SET Latitude = 16.12350, Longitude = 108.23460 
WHERE Id = 'shop_001';

UPDATE Shopkeepers 
SET Latitude = 16.12380, Longitude = 108.23480 
WHERE Id = 'shop_002';