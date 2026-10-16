-- Style Costing Database Schema
-- Complete cost management for garment styles

USE SmartERP;
GO

-- Drop existing costing tables if they exist
IF EXISTS (SELECT * FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'StyleCostings')
    DROP TABLE StyleCostings;
IF EXISTS (SELECT * FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'MaterialCosts')
    DROP TABLE MaterialCosts;
IF EXISTS (SELECT * FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'Materials')
    DROP TABLE Materials;

-- Create Styles table if it doesn't exist
IF NOT EXISTS (SELECT * FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'Styles')
BEGIN
    CREATE TABLE Styles (
        StyleID INT IDENTITY(1,1) PRIMARY KEY,
        StyleCode NVARCHAR(20) UNIQUE NOT NULL,
        StyleName NVARCHAR(100) NOT NULL,
        Description NVARCHAR(500),
        Category NVARCHAR(50),
        EstimatedTimePerPiece INT,
        MaterialRequired NVARCHAR(MAX),
        CreatedAt DATETIME DEFAULT GETDATE()
    );
    
    -- Insert sample styles
    INSERT INTO Styles (StyleCode, StyleName, Description, Category, EstimatedTimePerPiece, MaterialRequired) VALUES
    ('ST001', 'Basic Cotton T-Shirt', 'Round neck cotton t-shirt', 'T-Shirt', 15, 'Cotton fabric, Thread, Labels'),
    ('ST002', 'Denim Jeans Regular', 'Regular fit denim jeans', 'Jeans', 45, 'Denim fabric, Zippers, Buttons, Thread'),
    ('ST003', 'Silk Evening Dress', 'Elegant silk evening dress', 'Dress', 120, 'Silk fabric, Lining, Zippers, Thread');
    
    PRINT '✅ Styles table created with sample data';
END
ELSE
BEGIN
    PRINT '✅ Styles table already exists';
END

-- Create Materials table
CREATE TABLE Materials (
    MaterialID INT IDENTITY(1,1) PRIMARY KEY,
    MaterialCode NVARCHAR(20) UNIQUE NOT NULL,
    MaterialName NVARCHAR(100) NOT NULL,
    Category NVARCHAR(50), -- Fabric, Thread, Button, Zipper, etc.
    Unit NVARCHAR(20), -- Meter, Piece, Kg, etc.
    CurrentRate DECIMAL(10,2) NOT NULL,
    Supplier NVARCHAR(100),
    IsActive BIT DEFAULT 1,
    CreatedAt DATETIME DEFAULT GETDATE()
);

-- Create Material Costs table (historical pricing)
CREATE TABLE MaterialCosts (
    CostID INT IDENTITY(1,1) PRIMARY KEY,
    MaterialID INT FOREIGN KEY REFERENCES Materials(MaterialID),
    Rate DECIMAL(10,2) NOT NULL,
    EffectiveDate DATE DEFAULT GETDATE(),
    Supplier NVARCHAR(100),
    CreatedAt DATETIME DEFAULT GETDATE()
);

-- Create Style Costings table
CREATE TABLE StyleCostings (
    CostingID INT IDENTITY(1,1) PRIMARY KEY,
    StyleID INT FOREIGN KEY REFERENCES Styles(StyleID),
    MaterialID INT FOREIGN KEY REFERENCES Materials(MaterialID),
    Quantity DECIMAL(8,2) NOT NULL, -- Quantity required per piece
    Rate DECIMAL(10,2) NOT NULL, -- Rate at time of costing
    TotalCost AS (Quantity * Rate), -- Computed column
    CostingDate DATE DEFAULT GETDATE(),
    CreatedBy INT,
    IsActive BIT DEFAULT 1,
    CreatedAt DATETIME DEFAULT GETDATE()
);

PRINT '✅ Costing tables created';

-- Insert sample materials only if they don't exist
IF NOT EXISTS (SELECT 1 FROM Materials WHERE MaterialCode = 'MAT001')
BEGIN
    INSERT INTO Materials (MaterialCode, MaterialName, Category, Unit, CurrentRate, Supplier) VALUES
    ('MAT001', 'Cotton Fabric', 'Fabric', 'Meter', 25.50, 'Textile Mills Co'),
    ('MAT002', 'Denim Fabric', 'Fabric', 'Meter', 45.00, 'Denim World Ltd'),
    ('MAT003', 'Silk Fabric', 'Fabric', 'Meter', 120.00, 'Premium Silk Inc'),
    ('MAT004', 'Polyester Thread', 'Thread', 'Meter', 0.15, 'Thread Masters'),
    ('MAT005', 'Cotton Thread', 'Thread', 'Meter', 0.20, 'Thread Masters'),
    ('MAT006', 'Metal Buttons', 'Accessories', 'Piece', 2.50, 'Button Factory'),
    ('MAT007', 'Plastic Buttons', 'Accessories', 'Piece', 1.25, 'Button Factory'),
    ('MAT008', 'Metal Zipper', 'Accessories', 'Piece', 8.75, 'Zipper Co'),
    ('MAT009', 'Plastic Zipper', 'Accessories', 'Piece', 4.50, 'Zipper Co'),
    ('MAT010', 'Labels', 'Accessories', 'Piece', 0.75, 'Label Print Co');
    PRINT '✅ Sample materials inserted';
END
ELSE
BEGIN
    PRINT '✅ Materials already exist';
END

-- Insert sample style costings using actual IDs
IF NOT EXISTS (SELECT 1 FROM StyleCostings)
BEGIN
    DECLARE @TShirtID INT, @JeansID INT, @DressID INT;
    DECLARE @Mat1 INT, @Mat2 INT, @Mat3 INT, @Mat4 INT, @Mat5 INT, @Mat6 INT, @Mat8 INT, @Mat9 INT, @Mat10 INT;
    
    SELECT @TShirtID = StyleID FROM Styles WHERE StyleCode = 'ST001';
    SELECT @JeansID = StyleID FROM Styles WHERE StyleCode = 'ST002';
    SELECT @DressID = StyleID FROM Styles WHERE StyleCode = 'ST003';
    
    SELECT @Mat1 = MaterialID FROM Materials WHERE MaterialCode = 'MAT001';
    SELECT @Mat2 = MaterialID FROM Materials WHERE MaterialCode = 'MAT002';
    SELECT @Mat3 = MaterialID FROM Materials WHERE MaterialCode = 'MAT003';
    SELECT @Mat4 = MaterialID FROM Materials WHERE MaterialCode = 'MAT004';
    SELECT @Mat5 = MaterialID FROM Materials WHERE MaterialCode = 'MAT005';
    SELECT @Mat6 = MaterialID FROM Materials WHERE MaterialCode = 'MAT006';
    SELECT @Mat8 = MaterialID FROM Materials WHERE MaterialCode = 'MAT008';
    SELECT @Mat9 = MaterialID FROM Materials WHERE MaterialCode = 'MAT009';
    SELECT @Mat10 = MaterialID FROM Materials WHERE MaterialCode = 'MAT010';

    IF @TShirtID IS NOT NULL AND @JeansID IS NOT NULL AND @DressID IS NOT NULL
    BEGIN
        INSERT INTO StyleCostings (StyleID, MaterialID, Quantity, Rate, CreatedBy) VALUES
        -- T-Shirt costing
        (@TShirtID, @Mat1, 1.2, 25.50, 1), -- Cotton fabric
        (@TShirtID, @Mat4, 50, 0.15, 1),   -- Thread
        (@TShirtID, @Mat10, 1, 0.75, 1),   -- Label

        -- Jeans costing  
        (@JeansID, @Mat2, 1.8, 45.00, 1), -- Denim fabric
        (@JeansID, @Mat5, 80, 0.20, 1),   -- Cotton thread
        (@JeansID, @Mat6, 5, 2.50, 1),    -- Metal buttons
        (@JeansID, @Mat8, 1, 8.75, 1),    -- Metal zipper
        (@JeansID, @Mat10, 1, 0.75, 1),   -- Label

        -- Dress costing
        (@DressID, @Mat3, 2.5, 120.00, 1), -- Silk fabric
        (@DressID, @Mat4, 100, 0.15, 1),   -- Thread
        (@DressID, @Mat9, 1, 4.50, 1),     -- Plastic zipper
        (@DressID, @Mat10, 1, 0.75, 1);    -- Label
    END
END

PRINT '✅ Sample costing data inserted';
GO

-- Create views for costing analysis
CREATE VIEW vw_StyleCostBreakdown AS
SELECT 
    s.StyleCode,
    s.StyleName,
    s.Category,
    m.MaterialName,
    m.Category as MaterialCategory,
    sc.Quantity,
    m.Unit,
    sc.Rate,
    sc.TotalCost,
    sc.CostingDate
FROM StyleCostings sc
JOIN Styles s ON sc.StyleID = s.StyleID
JOIN Materials m ON sc.MaterialID = m.MaterialID
WHERE sc.IsActive = 1;
GO

CREATE VIEW vw_StyleTotalCost AS
SELECT 
    s.StyleID,
    s.StyleCode,
    s.StyleName,
    s.Category,
    SUM(sc.TotalCost) as TotalMaterialCost,
    COUNT(sc.CostingID) as MaterialCount,
    MAX(sc.CostingDate) as LastUpdated
FROM Styles s
LEFT JOIN StyleCostings sc ON s.StyleID = sc.StyleID AND sc.IsActive = 1
GROUP BY s.StyleID, s.StyleCode, s.StyleName, s.Category;
GO

CREATE VIEW vw_MaterialUsage AS
SELECT 
    m.MaterialCode,
    m.MaterialName,
    m.Category,
    m.CurrentRate,
    COUNT(sc.CostingID) as UsedInStyles,
    SUM(sc.Quantity) as TotalQuantityUsed,
    AVG(sc.Rate) as AverageRate
FROM Materials m
LEFT JOIN StyleCostings sc ON m.MaterialID = sc.MaterialID AND sc.IsActive = 1
GROUP BY m.MaterialID, m.MaterialCode, m.MaterialName, m.Category, m.CurrentRate;

GO
PRINT '✅ Costing views created';

-- Create stored procedures
IF EXISTS (SELECT * FROM sys.procedures WHERE name = 'sp_GetStyleCosting')
    DROP PROCEDURE sp_GetStyleCosting;
GO

CREATE PROCEDURE sp_GetStyleCosting
    @StyleID INT = NULL
AS
BEGIN
    IF @StyleID IS NULL
    BEGIN
        SELECT * FROM vw_StyleTotalCost ORDER BY StyleCode;
    END
    ELSE
    BEGIN
        SELECT * FROM vw_StyleCostBreakdown WHERE StyleCode = (SELECT StyleCode FROM Styles WHERE StyleID = @StyleID);
    END
END;
GO

IF EXISTS (SELECT * FROM sys.procedures WHERE name = 'sp_UpdateStyleCosting')
    DROP PROCEDURE sp_UpdateStyleCosting;
GO

CREATE PROCEDURE sp_UpdateStyleCosting
    @StyleID INT,
    @MaterialID INT,
    @Quantity DECIMAL(8,2),
    @Rate DECIMAL(10,2),
    @CreatedBy INT
AS
BEGIN
    -- Deactivate existing costing for this style-material combination
    UPDATE StyleCostings 
    SET IsActive = 0 
    WHERE StyleID = @StyleID AND MaterialID = @MaterialID;
    
    -- Insert new costing
    INSERT INTO StyleCostings (StyleID, MaterialID, Quantity, Rate, CreatedBy)
    VALUES (@StyleID, @MaterialID, @Quantity, @Rate, @CreatedBy)
    
    SELECT 'Success' as Result, 'Style costing updated successfully' as Message
END;
GO

IF EXISTS (SELECT * FROM sys.procedures WHERE name = 'sp_GetCostingDashboard')
    DROP PROCEDURE sp_GetCostingDashboard;
GO

CREATE PROCEDURE sp_GetCostingDashboard
AS
BEGIN
    -- Style costs summary
    SELECT 'StyleCosts' as DataType, * FROM vw_StyleTotalCost;
    
    -- Material usage
    SELECT 'MaterialUsage' as DataType, * FROM vw_MaterialUsage;
    
    -- Cost metrics
    SELECT 'Metrics' as DataType,
        (SELECT COUNT(*) FROM Styles) as TotalStyles,
        (SELECT COUNT(*) FROM Materials WHERE IsActive = 1) as TotalMaterials,
        (SELECT AVG(TotalMaterialCost) FROM vw_StyleTotalCost) as AvgStyleCost,
        (SELECT MAX(TotalMaterialCost) FROM vw_StyleTotalCost) as MaxStyleCost,
        (SELECT MIN(TotalMaterialCost) FROM vw_StyleTotalCost WHERE TotalMaterialCost > 0) as MinStyleCost;
END;
GO

PRINT '✅ Costing procedures created';
PRINT '🎉 Style Costing schema complete!';