-- ==========================================
-- GUIDE FRIENDS - MASTER SQL SERVER SCHEMA (CLEAN SLATE)
-- ==========================================
USE master;
GO

-- Xóa Database cũ nếu đang tồn tại (Để tránh lỗi kẹt)
IF EXISTS (SELECT name FROM sys.databases WHERE name = N'GuideFriendsDB')
BEGIN
    ALTER DATABASE GuideFriendsDB SET SINGLE_USER WITH ROLLBACK IMMEDIATE;
    DROP DATABASE GuideFriendsDB;
END
GO

-- Tạo Database mới tinh
CREATE DATABASE GuideFriendsDB;
GO

USE GuideFriendsDB;
GO

-- ==========================================
-- 1. TẠO BẢNG (SCHEMA)
-- ==========================================

CREATE TABLE Clerks (
    Id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
    Username NVARCHAR(100) NOT NULL UNIQUE,
    PasswordHash NVARCHAR(255) NOT NULL,
    FullName NVARCHAR(150),
    CreatedAt DATETIME2 DEFAULT GETUTCDATE()
);
GO

CREATE TABLE Admins (
    Id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
    Username NVARCHAR(100) NOT NULL UNIQUE,
    PasswordHash NVARCHAR(255) NOT NULL, 
    FullName NVARCHAR(150),
    CreatedAt DATETIME2 DEFAULT GETUTCDATE()
);
GO

CREATE TABLE POIs (
    Id VARCHAR(50) PRIMARY KEY,
    Name NVARCHAR(255) NOT NULL,
    ShortDescriptionVi NVARCHAR(500) NOT NULL,
    FullDescriptionVi NVARCHAR(MAX) NOT NULL,
    Latitude DECIMAL(9, 6) NOT NULL CHECK (Latitude >= -90 AND Latitude <= 90),
    Longitude DECIMAL(9, 6) NOT NULL CHECK (Longitude >= -180 AND Longitude <= 180),
    RadiusMeters INT DEFAULT 20 CHECK (RadiusMeters > 0),
    ImageUrl NVARCHAR(MAX),
    GalleryImages NVARCHAR(MAX) CHECK (GalleryImages IS NULL OR ISJSON(GalleryImages) = 1),
    CreatedAt DATETIME2 DEFAULT GETUTCDATE()
);
GO

CREATE TABLE Shopkeepers (
    Id VARCHAR(50) PRIMARY KEY,
    PoiId VARCHAR(50) NOT NULL,
    Name NVARCHAR(255) NOT NULL,
    DescriptionVi NVARCHAR(1000),
    ImageUrl NVARCHAR(MAX),
    GalleryImages NVARCHAR(MAX) CHECK (GalleryImages IS NULL OR ISJSON(GalleryImages) = 1),
    OpeningHours NVARCHAR(100),
    Phone NVARCHAR(20),
    ClaimCode NVARCHAR(50) UNIQUE,
    IsClaimed BIT DEFAULT 0,
    Status VARCHAR(20) DEFAULT 'pending' CHECK (Status IN ('pending', 'approved', 'pending_vnpay')),
    Latitude DECIMAL(9, 6) CHECK (Latitude >= -90 AND Latitude <= 90),
    Longitude DECIMAL(9, 6) CHECK (Longitude >= -180 AND Longitude <= 180),
    CreatedAt DATETIME2 DEFAULT GETUTCDATE(),
    FOREIGN KEY (PoiId) REFERENCES POIs(Id) ON DELETE CASCADE
);
GO

-- 👈 ĐÃ SỬA LỖI: CHECK (ExpiresAt > CreatedAt) được đưa xuống cuối bảng
CREATE TABLE UnlockTokens (
    Token VARCHAR(36) PRIMARY KEY,
    CreatedByClerkId UNIQUEIDENTIFIER NOT NULL,
    CreatedAt DATETIME2 DEFAULT GETUTCDATE(),
    ExpiresAt DATETIME2 NOT NULL,
    IsUsed BIT DEFAULT 0,
    Source VARCHAR(20) DEFAULT 'clerk' CHECK (Source IN ('clerk', 'vnpay')),
    FOREIGN KEY (CreatedByClerkId) REFERENCES Clerks(Id),
    CONSTRAINT CK_UnlockTokens_ExpiresAt CHECK (ExpiresAt > CreatedAt)
);
GO

-- ==========================================
-- 2. TẠO INDEXES
-- ==========================================
CREATE INDEX IX_Shopkeepers_PoiId ON Shopkeepers(PoiId);
CREATE INDEX IX_Shopkeepers_ClaimCode ON Shopkeepers(ClaimCode);
CREATE INDEX IX_UnlockTokens_ExpiresAt ON UnlockTokens(ExpiresAt);
GO

-- ==========================================
-- 3. SEED DATA (DỮ LIỆU MẪU)
-- ==========================================

-- Insert Clerks & Admins (Đã dùng hash chuẩn cho admin)
INSERT INTO Clerks (Username, PasswordHash, FullName)
VALUES 
('clerk01', 'hashed_password_123', 'Nguyễn Văn A'),
('admin', 'admin_hash_456', 'Trần Thị B');

INSERT INTO Admins (Username, PasswordHash, FullName)
VALUES 
('admin', '$2b$10$0DgiUhK4vhuo49Va8YXqp.d6e3EluNtgku/bMjRJ19nU8toToTikO', N'Quản Trị Viên');
GO

-- Insert POIs
INSERT INTO POIs (Id, Name, ShortDescriptionVi, FullDescriptionVi, Latitude, Longitude, RadiusMeters, ImageUrl, GalleryImages)
VALUES
('poi_001', N'Chùa Linh Ứng (Bãi Bụt)', N'Ngôi chùa nổi tiếng với tượng Quán Thế Âm cao nhất Việt Nam.', N'Chùa Linh Ứng tọa lạc trên bán đảo Sơn Trà, được khởi công xây dựng từ năm 2004...', 16.12345, 108.23456, 30, '/uploads/poi1_1.jpg', '["/uploads/poi1_1.jpg", "/uploads/poi1_2.jpg", "/uploads/poi1_3.jpg"]'),
('poi_002', N'Tượng Quán Thế Âm', N'Tượng Phật bà Quán Âm cao 67m, tương đương tòa nhà 30 tầng.', N'Tượng Quán Thế Âm tại chùa Linh Ứng được xem là cao nhất Việt Nam...', 16.12385, 108.23490, 20, '/uploads/poi2_1.jpg', '["/uploads/poi2_1.jpg", "/uploads/poi2_2.jpg", "/uploads/poi2_3.jpg"]'),
('poi_003', N'Cổng Tam Quan', N'Cổng vào chính của chùa với kiến trúc truyền thống.', N'Cổng Tam Quan là nơi đón tiếp du khách...', 16.12305, 108.23410, 15, '/uploads/poi3_1.jpg', '["/uploads/poi3_1.jpg", "/uploads/poi3_2.jpg", "/uploads/poi3_3.jpg"]');
GO

-- Insert Shopkeepers (Tọa độ đã được tính toán để cách POI 20-30 mét)
INSERT INTO Shopkeepers (Id, PoiId, Name, DescriptionVi, ImageUrl, GalleryImages, OpeningHours, Phone, ClaimCode, IsClaimed, Status, Latitude, Longitude)
VALUES
-- Quán thuộc POI 1 (Cách ~24m)
('shop_001', 'poi_001', N'Quán Chay Sơn Trà', N'Phục vụ các món chay thanh đạm...', '/uploads/shop1_1.jpg', '["/uploads/shop1_1.jpg", "/uploads/shop1_2.jpg"]', '08:00 - 21:00', '0905123456', 'CLAIM-CHAY-01', 1, 'approved', 16.12365, 108.23466),
('shop_002', 'poi_001', N'Tiệm Lưu Niệm Phật Giáo', N'Chuyên cung cấp vòng tay gỗ...', '/uploads/shop2_1.jpg', '["/uploads/shop2_1.jpg", "/uploads/shop2_2.jpg"]', '07:00 - 18:00', '0905654321', 'CLAIM-LUU-02', 1, 'approved', 16.12330, 108.23471),

-- Quán thuộc POI 2 (Cách ~24m)
('shop_003', 'poi_002', N'Quán Nước Mía Cô Ba', N'Nước mía tươi mát lạnh...', '/uploads/shop3_1.jpg', '["/uploads/shop3_1.jpg", "/uploads/shop3_2.jpg"]', '07:00 - 18:00', '0905123987', 'CLAIM-MIA-03', 1, 'approved', 16.12395, 108.23470),
('shop_004', 'poi_002', N'Tiệm Trà Thảo Mộc', N'Bán các loại trà hoa cúc...', '/uploads/shop4_1.jpg', '["/uploads/shop4_1.jpg", "/uploads/shop4_2.jpg"]', '08:00 - 17:00', '0905876543', 'CLAIM-TRA-04', 1, 'approved', 16.12375, 108.23470),

-- Quán thuộc POI 3 (Cách ~24m)
('shop_005', 'poi_003', N'Tiệm Bánh Mì Chay Từ Tâm', N'Bánh mì chay nóng hổi...', '/uploads/shop5_1.jpg', '["/uploads/shop5_1.jpg", "/uploads/shop5_2.jpg"]', '06:00 - 11:00', '0905112233', 'CLAIM-BANHMI-05', 1, 'approved', 16.12325, 108.23420),
('shop_006', 'poi_003', N'Quán Cà Phê Sân Vườn', N'Không gian rộng rãi, nhiều cây xanh...', '/uploads/shop6_1.jpg', '["/uploads/shop6_1.jpg", "/uploads/shop6_2.jpg"]', '06:30 - 22:00', '0905998877', 'CLAIM-CAFE-06', 1, 'approved', 16.12290, 108.23395);
GO

-- Insert Mock Token
INSERT INTO UnlockTokens (Token, CreatedByClerkId, ExpiresAt, Source, IsUsed)
SELECT 
    'MOCK-TOKEN-1234-5678-90AB-CDEF12345678', 
    (SELECT TOP 1 Id FROM Clerks WHERE Username = 'clerk01'), 
    DATEADD(hour, 24, GETUTCDATE()),
    'clerk',
    0;
GO

-- ==========================================
-- 4. STORED PROCEDURE
-- ==========================================
CREATE PROCEDURE sp_ValidateUnlockToken
    @InputToken VARCHAR(36)
AS
BEGIN
    SET NOCOUNT ON;
    
    DELETE FROM UnlockTokens WHERE ExpiresAt < GETUTCDATE();

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

PRINT N'✅ Tạo Database GuideFriendsDB thành công!';
GO