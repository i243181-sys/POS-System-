SET NOCOUNT ON;

IF OBJECT_ID('Roles', 'U') IS NULL
BEGIN
    CREATE TABLE Roles (
        RoleID INT IDENTITY(1,1) PRIMARY KEY,
        RoleName NVARCHAR(50) NOT NULL UNIQUE
    );
END

IF OBJECT_ID('Users', 'U') IS NULL
BEGIN
    CREATE TABLE Users (
        UserID INT IDENTITY(1,1) PRIMARY KEY,
        Username NVARCHAR(50) COLLATE Latin1_General_CI_AS NOT NULL UNIQUE,
        PasswordHash NVARCHAR(256) NOT NULL,
        FullName NVARCHAR(100) NOT NULL,
        RoleID INT NOT NULL,
        Status INT NOT NULL DEFAULT(1),
        FailedLoginAttempts INT NOT NULL DEFAULT(0),
        LastLoginAt DATETIME2 NULL,
        LockedUntil DATETIME2 NULL,
        CreatedAt DATETIME2 NOT NULL DEFAULT(GETUTCDATE()),
        UpdatedAt DATETIME2 NOT NULL DEFAULT(GETUTCDATE()),
        CONSTRAINT FK_Users_Roles FOREIGN KEY(RoleID) REFERENCES Roles(RoleID)
    );
    CREATE INDEX IX_Users_RoleID ON Users(RoleID);
END

IF OBJECT_ID('Categories', 'U') IS NULL
BEGIN
    CREATE TABLE Categories (
        CategoryID INT IDENTITY(1,1) PRIMARY KEY,
        CategoryName NVARCHAR(100) NOT NULL UNIQUE,
        Description NVARCHAR(250) NULL,
        IsActive BIT NOT NULL DEFAULT(1),
        CreatedAt DATETIME2 NOT NULL DEFAULT(GETUTCDATE())
    );
END

IF OBJECT_ID('Products', 'U') IS NULL
BEGIN
    CREATE TABLE Products (
        ProductID INT IDENTITY(1,1) PRIMARY KEY,
        ProductName NVARCHAR(200) NOT NULL,
        Barcode NVARCHAR(100) NULL UNIQUE,
        CategoryID INT NOT NULL,
        Brand NVARCHAR(100) NULL,
        PurchasePrice DECIMAL(18,2) NOT NULL DEFAULT(0),
        SellingPrice DECIMAL(18,2) NOT NULL DEFAULT(0),
        StockQuantity INT NOT NULL DEFAULT(0),
        ReorderLevel INT NOT NULL DEFAULT(10),
        IsActive BIT NOT NULL DEFAULT(1),
        CreatedAt DATETIME2 NOT NULL DEFAULT(GETUTCDATE()),
        UpdatedAt DATETIME2 NOT NULL DEFAULT(GETUTCDATE()),
        CONSTRAINT FK_Products_Categories FOREIGN KEY(CategoryID) REFERENCES Categories(CategoryID),
        CONSTRAINT CK_Products_PurchasePrice_NonNegative CHECK (PurchasePrice >= 0),
        CONSTRAINT CK_Products_SellingPrice_Positive CHECK (SellingPrice > 0),
        CONSTRAINT CK_Products_StockQuantity_NonNegative CHECK (StockQuantity >= 0),
        CONSTRAINT CK_Products_ReorderLevel_NonNegative CHECK (ReorderLevel >= 0)
    );
    CREATE INDEX IX_Products_ProductName ON Products(ProductName);
    CREATE INDEX IX_Products_Barcode ON Products(Barcode);
    CREATE INDEX IX_Products_CategoryID ON Products(CategoryID);
    CREATE INDEX IX_Products_IsActive ON Products(IsActive);
END

IF OBJECT_ID('Customers', 'U') IS NULL
BEGIN
    CREATE TABLE Customers (
        CustomerID INT IDENTITY(1,1) PRIMARY KEY,
        AccountNumber NVARCHAR(30) NULL,
        FullName NVARCHAR(100) NOT NULL,
        FatherName NVARCHAR(100) NULL,
        Phone NVARCHAR(20) NULL,
        Email NVARCHAR(100) NULL,
        Address NVARCHAR(250) NULL,
        LoyaltyPoints DECIMAL(18,2) NOT NULL DEFAULT(0),
        IsActive BIT NOT NULL DEFAULT(1),
        CreatedAt DATETIME2 NOT NULL DEFAULT(GETUTCDATE())
    );
END
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_Customers_AccountNumber' AND object_id = OBJECT_ID('Customers'))
BEGIN
    CREATE UNIQUE INDEX IX_Customers_AccountNumber
        ON Customers(AccountNumber)
        WHERE AccountNumber IS NOT NULL;
END

IF OBJECT_ID('Sales', 'U') IS NULL
BEGIN
    CREATE TABLE Sales (
        SaleID INT IDENTITY(1,1) PRIMARY KEY,
        InvoiceNumber NVARCHAR(30) NOT NULL UNIQUE,
        UserID INT NOT NULL,
        CustomerID INT NULL,
        SaleDate DATETIME2 NOT NULL DEFAULT(GETUTCDATE()),
        SubTotal DECIMAL(18,2) NOT NULL,
        DiscountAmount DECIMAL(18,2) NOT NULL,
        DiscountPercent DECIMAL(5,2) NOT NULL,
        TaxAmount DECIMAL(18,2) NOT NULL,
        NetTotal DECIMAL(18,2) NOT NULL,
        PaidAmount DECIMAL(18,2) NOT NULL,
        ChangeAmount DECIMAL(18,2) NOT NULL,
        PaymentStatus INT NOT NULL,
        Notes NVARCHAR(500) NULL,
        IsVoided BIT NOT NULL DEFAULT(0),
        CreatedAt DATETIME2 NOT NULL DEFAULT(GETUTCDATE()),
        CONSTRAINT FK_Sales_Users FOREIGN KEY(UserID) REFERENCES Users(UserID),
        CONSTRAINT FK_Sales_Customers FOREIGN KEY(CustomerID) REFERENCES Customers(CustomerID),
        CONSTRAINT CK_Sales_SubTotal_NonNegative CHECK (SubTotal >= 0),
        CONSTRAINT CK_Sales_DiscountAmount_NonNegative CHECK (DiscountAmount >= 0),
        CONSTRAINT CK_Sales_NetTotal_NonNegative CHECK (NetTotal >= 0),
        CONSTRAINT CK_Sales_PaidAmount_NonNegative CHECK (PaidAmount >= 0),
        CONSTRAINT CK_Sales_ChangeAmount_NonNegative CHECK (ChangeAmount >= 0),
        CONSTRAINT CK_Sales_ChangeAmount_NotAbovePaid CHECK (ChangeAmount <= PaidAmount),
        CONSTRAINT CK_Sales_DiscountPercent_Range CHECK (DiscountPercent >= 0 AND DiscountPercent <= 100),
        CONSTRAINT CK_Sales_TaxAmount_NonNegative CHECK (TaxAmount >= 0)
    );
    CREATE INDEX IX_Sales_SaleDate ON Sales(SaleDate);
    CREATE INDEX IX_Sales_UserID ON Sales(UserID);
END

IF OBJECT_ID('SaleItems', 'U') IS NULL
BEGIN
    CREATE TABLE SaleItems (
        SaleItemID INT IDENTITY(1,1) PRIMARY KEY,
        SaleID INT NOT NULL,
        ProductID INT NOT NULL,
        ProductName NVARCHAR(200) NOT NULL,
        Quantity INT NOT NULL,
        UnitPrice DECIMAL(18,2) NOT NULL,
        UnitCost DECIMAL(18,2) NOT NULL DEFAULT(0),
        LineDiscount DECIMAL(18,2) NOT NULL DEFAULT(0),
        LineTotal DECIMAL(18,2) NOT NULL,
        CONSTRAINT FK_SaleItems_Sales FOREIGN KEY(SaleID) REFERENCES Sales(SaleID),
        CONSTRAINT FK_SaleItems_Products FOREIGN KEY(ProductID) REFERENCES Products(ProductID),
        CONSTRAINT CK_SaleItems_Quantity_Positive CHECK (Quantity > 0),
        CONSTRAINT CK_SaleItems_UnitPrice_Positive CHECK (UnitPrice > 0),
        CONSTRAINT CK_SaleItems_UnitCost_NonNegative CHECK (UnitCost >= 0),
        CONSTRAINT CK_SaleItems_LineTotal_NonNegative CHECK (LineTotal >= 0)
    );
    CREATE INDEX IX_SaleItems_SaleID ON SaleItems(SaleID);
END

IF OBJECT_ID('ProductBackups', 'U') IS NULL
BEGIN
    CREATE TABLE ProductBackups (
        ProductBackupID INT IDENTITY(1,1) PRIMARY KEY,
        ProductID INT NULL,
        Action NVARCHAR(50) NOT NULL,
        DataPath NVARCHAR(500) NOT NULL,
        ChecksumSha256 NVARCHAR(64) NULL,
        CreatedByUserID INT NULL,
        CreatedAt DATETIME2 NOT NULL DEFAULT(GETUTCDATE()),
        CONSTRAINT FK_ProductBackups_Products FOREIGN KEY(ProductID) REFERENCES Products(ProductID) ON DELETE SET NULL,
        CONSTRAINT FK_ProductBackups_Users FOREIGN KEY(CreatedByUserID) REFERENCES Users(UserID) ON DELETE SET NULL
    );
    CREATE INDEX IX_ProductBackups_ProductID ON ProductBackups(ProductID);
END

IF OBJECT_ID('Payments', 'U') IS NULL
BEGIN
    CREATE TABLE Payments (
        PaymentID INT IDENTITY(1,1) PRIMARY KEY,
        SaleID INT NOT NULL,
        PaymentMethod INT NOT NULL,
        Amount DECIMAL(18,2) NOT NULL,
        PaymentDate DATETIME2 NOT NULL DEFAULT(GETUTCDATE()),
        ReferenceNo NVARCHAR(100) NULL,
        Notes NVARCHAR(500) NULL,
        CONSTRAINT FK_Payments_Sales FOREIGN KEY(SaleID) REFERENCES Sales(SaleID),
        CONSTRAINT CK_Payments_Amount_Positive CHECK (Amount > 0)
    );
    CREATE INDEX IX_Payments_SaleID ON Payments(SaleID);
END

IF OBJECT_ID('InventoryTransactions', 'U') IS NULL
BEGIN
    CREATE TABLE InventoryTransactions (
        InventoryTransactionID INT IDENTITY(1,1) PRIMARY KEY,
        ProductID INT NOT NULL,
        TransactionType INT NOT NULL,
        QuantityChange INT NOT NULL,
        OldStock INT NOT NULL,
        NewStock INT NOT NULL,
        UserID INT NOT NULL,
        Reason NVARCHAR(500) NOT NULL,
        SaleID INT NULL,
        CreatedAt DATETIME2 NOT NULL DEFAULT(GETUTCDATE()),
        CONSTRAINT FK_InventoryTransactions_Products FOREIGN KEY(ProductID) REFERENCES Products(ProductID),
        CONSTRAINT FK_InventoryTransactions_Users FOREIGN KEY(UserID) REFERENCES Users(UserID),
        CONSTRAINT FK_InventoryTransactions_Sales FOREIGN KEY(SaleID) REFERENCES Sales(SaleID),
        CONSTRAINT CK_InventoryTransactions_OldStock_NonNegative CHECK (OldStock >= 0),
        CONSTRAINT CK_InventoryTransactions_NewStock_NonNegative CHECK (NewStock >= 0)
    );
    CREATE INDEX IX_InventoryTransactions_ProductID ON InventoryTransactions(ProductID);
    CREATE INDEX IX_InventoryTransactions_CreatedAt ON InventoryTransactions(CreatedAt);
END

IF OBJECT_ID('AuditLogs', 'U') IS NULL
BEGIN
    CREATE TABLE AuditLogs (
        AuditLogID INT IDENTITY(1,1) PRIMARY KEY,
        UserID INT NULL,
        Action NVARCHAR(100) NOT NULL,
        EntityName NVARCHAR(100) NOT NULL,
        EntityID NVARCHAR(50) NULL,
        Description NVARCHAR(1000) NOT NULL,
        DeviceName NVARCHAR(100) NULL,
        IpAddress NVARCHAR(45) NULL,
        CreatedAt DATETIME2 NOT NULL DEFAULT(GETUTCDATE()),
        CONSTRAINT FK_AuditLogs_Users FOREIGN KEY(UserID) REFERENCES Users(UserID)
    );
    CREATE INDEX IX_AuditLogs_CreatedAt ON AuditLogs(CreatedAt);
    CREATE INDEX IX_AuditLogs_UserID ON AuditLogs(UserID);
    CREATE INDEX IX_AuditLogs_Action ON AuditLogs(Action);
END

IF OBJECT_ID('Settings', 'U') IS NULL
BEGIN
    CREATE TABLE Settings (
        SettingID INT IDENTITY(1,1) PRIMARY KEY,
        SettingKey NVARCHAR(100) NOT NULL UNIQUE,
        SettingValue NVARCHAR(1000) NOT NULL,
        Description NVARCHAR(500) NULL,
        UpdatedAt DATETIME2 NOT NULL DEFAULT(GETUTCDATE())
    );
END

IF OBJECT_ID('BackupLogs', 'U') IS NULL
BEGIN
    CREATE TABLE BackupLogs (
        BackupID INT IDENTITY(1,1) PRIMARY KEY,
        BackupPath NVARCHAR(500) NOT NULL,
        FileSizeBytes BIGINT NOT NULL DEFAULT(0),
        BackupDate DATETIME2 NOT NULL DEFAULT(GETUTCDATE()),
        CreatedByUserID INT NULL,
        Status NVARCHAR(20) NOT NULL,
        ErrorMessage NVARCHAR(1000) NULL,
        IsAutomatic BIT NOT NULL DEFAULT(0),
        CONSTRAINT FK_BackupLogs_Users FOREIGN KEY(CreatedByUserID) REFERENCES Users(UserID)
    );
    CREATE INDEX IX_BackupLogs_BackupDate ON BackupLogs(BackupDate);
END
