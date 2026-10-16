-- Core ERP tables for the services that previously held data in memory:
-- orders, inventory, finance and clients.
--
-- Column names deliberately mirror the JSON keys those services already
-- returned, so their HTTP contracts are unchanged by the move to SQL Server.

USE SmartERP;
GO

IF EXISTS (SELECT * FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'FinanceTransactions')
    DROP TABLE FinanceTransactions;
IF EXISTS (SELECT * FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'InventoryItems')
    DROP TABLE InventoryItems;
IF EXISTS (SELECT * FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'Orders')
    DROP TABLE Orders;
IF EXISTS (SELECT * FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'Clients')
    DROP TABLE Clients;
GO

CREATE TABLE Clients (
    ClientID INT IDENTITY(1,1) PRIMARY KEY,
    Name NVARCHAR(150) NOT NULL,
    Type NVARCHAR(50),
    Email NVARCHAR(150),
    Phone NVARCHAR(30),
    Status NVARCHAR(20) DEFAULT 'active',
    CreatedAt DATETIME DEFAULT GETDATE()
);
GO

CREATE TABLE Orders (
    OrderID INT IDENTITY(1,1) PRIMARY KEY,
    ClientName NVARCHAR(150) NOT NULL,
    OrderDate DATE DEFAULT GETDATE(),
    DeliveryDate DATE,
    Status NVARCHAR(30) DEFAULT 'pending',
    Priority NVARCHAR(20) DEFAULT 'medium',
    TotalAmount DECIMAL(14,2) DEFAULT 0,
    CreatedAt DATETIME DEFAULT GETDATE()
);
GO

CREATE TABLE InventoryItems (
    ItemID INT IDENTITY(1,1) PRIMARY KEY,
    ItemName NVARCHAR(150) NOT NULL,
    Category NVARCHAR(50),
    Quantity INT DEFAULT 0,
    Unit NVARCHAR(30),
    ReorderLevel INT DEFAULT 0,
    CreatedAt DATETIME DEFAULT GETDATE()
);
GO

CREATE TABLE FinanceTransactions (
    TransactionID INT IDENTITY(1,1) PRIMARY KEY,
    Type NVARCHAR(20) NOT NULL,          -- income | expense
    Amount DECIMAL(14,2) NOT NULL,
    Description NVARCHAR(300),
    TxnDate DATE DEFAULT GETDATE(),
    Category NVARCHAR(50),
    CreatedAt DATETIME DEFAULT GETDATE()
);
GO

PRINT '✅ Core ERP tables created';
GO

-- Seed data mirrors what the in-memory services used to return, so the
-- endpoints behave the same on a fresh database.
INSERT INTO Clients (Name, Type, Email, Phone, Status) VALUES
('ABC Manufacturing', 'manufacturing-unit', 'contact@abc.com',  '+1234567890', 'active'),
('XYZ Wholesale',     'wholesale',          'orders@xyz.com',   '+0987654321', 'active');

INSERT INTO Orders (ClientName, OrderDate, DeliveryDate, Status, Priority, TotalAmount) VALUES
('ABC Manufacturing', '2024-01-15', '2024-02-15', 'in-production', 'high',   15000),
('XYZ Wholesale',     '2024-01-20', '2024-02-20', 'confirmed',     'medium',  8500);

INSERT INTO InventoryItems (ItemName, Category, Quantity, Unit, ReorderLevel) VALUES
('Cotton Fabric', 'raw-material', 500, 'meters', 100),
('Buttons',       'accessories',   25, 'pieces',  50);

INSERT INTO FinanceTransactions (Type, Amount, Description, TxnDate, Category) VALUES
('income',  15000, 'Order Payment', '2024-01-15', 'sales'),
('expense',  3000, 'Raw Materials', '2024-01-10', 'materials');

PRINT '✅ Core ERP seed data inserted';
GO

-- Inventory status is derived from Quantity vs ReorderLevel rather than stored,
-- so it cannot drift out of sync with the quantity on hand.
CREATE VIEW vw_InventoryStatus AS
SELECT
    ItemID, ItemName, Category, Quantity, Unit, ReorderLevel,
    CASE
        WHEN Quantity <= 0 THEN 'out-of-stock'
        WHEN Quantity <= ReorderLevel THEN 'low-stock'
        ELSE 'in-stock'
    END AS Status
FROM InventoryItems;
GO

PRINT '✅ Inventory status view created';
GO
