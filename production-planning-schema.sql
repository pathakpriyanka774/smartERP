-- Production Planning & Quality Management Database Schema
-- Complete workflow management for garment manufacturing

USE SmartERP;
GO

-- Drop existing production tables if they exist
IF EXISTS (SELECT * FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'QualityInspections')
    DROP TABLE QualityInspections;
IF EXISTS (SELECT * FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'DailyProduction')
    DROP TABLE DailyProduction;
IF EXISTS (SELECT * FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'ProductionTasks')
    DROP TABLE ProductionTasks;
IF EXISTS (SELECT * FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'MachineAllocations')
    DROP TABLE MachineAllocations;
IF EXISTS (SELECT * FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'ProductionOrders')
    DROP TABLE ProductionOrders;
IF EXISTS (SELECT * FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'Machines')
    DROP TABLE Machines;
IF EXISTS (SELECT * FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'Styles')
    DROP TABLE Styles;

-- Create Styles table (garment styles/designs)
CREATE TABLE Styles (
    StyleID INT IDENTITY(1,1) PRIMARY KEY,
    StyleCode NVARCHAR(20) UNIQUE NOT NULL,
    StyleName NVARCHAR(100) NOT NULL,
    Description NVARCHAR(500),
    Category NVARCHAR(50), -- T-Shirt, Jeans, Dress, etc.
    EstimatedTimePerPiece INT, -- minutes per piece
    MaterialRequired NVARCHAR(MAX), -- JSON or comma-separated
    CreatedAt DATETIME DEFAULT GETDATE()
);

-- Create Machines table
CREATE TABLE Machines (
    MachineID INT IDENTITY(1,1) PRIMARY KEY,
    MachineCode NVARCHAR(20) UNIQUE NOT NULL,
    MachineName NVARCHAR(100) NOT NULL,
    MachineType NVARCHAR(50), -- Cutting, Sewing, Finishing, etc.
    Status NVARCHAR(20) DEFAULT 'Available', -- Available, Occupied, Maintenance
    Location NVARCHAR(100),
    CapacityPerHour INT DEFAULT 0,
    IsActive BIT DEFAULT 1,
    CreatedAt DATETIME DEFAULT GETDATE()
);

-- Create Production Orders table
CREATE TABLE ProductionOrders (
    OrderID INT IDENTITY(1,1) PRIMARY KEY,
    OrderCode NVARCHAR(20) UNIQUE NOT NULL,
    StyleID INT FOREIGN KEY REFERENCES Styles(StyleID),
    ClientName NVARCHAR(100) NOT NULL,
    TotalQuantity INT NOT NULL,
    CompletedQuantity INT DEFAULT 0,
    StartDate DATE,
    DeadlineDate DATE,
    Status NVARCHAR(20) DEFAULT 'Pending', -- Pending, InProgress, Completed, Cancelled
    Priority NVARCHAR(10) DEFAULT 'Medium', -- High, Medium, Low
    CreatedAt DATETIME DEFAULT GETDATE()
);

-- Create Machine Allocations table
CREATE TABLE MachineAllocations (
    AllocationID INT IDENTITY(1,1) PRIMARY KEY,
    MachineID INT FOREIGN KEY REFERENCES Machines(MachineID),
    EmployeeID INT FOREIGN KEY REFERENCES Employees(EmployeeID),
    OrderID INT FOREIGN KEY REFERENCES ProductionOrders(OrderID),
    AllocatedDate DATE DEFAULT GETDATE(),
    ShiftTime NVARCHAR(20), -- Morning, Evening, Night
    Status NVARCHAR(20) DEFAULT 'Active', -- Active, Completed, Paused
    CreatedAt DATETIME DEFAULT GETDATE()
);

-- Create Production Tasks table (daily targets)
CREATE TABLE ProductionTasks (
    TaskID INT IDENTITY(1,1) PRIMARY KEY,
    AllocationID INT FOREIGN KEY REFERENCES MachineAllocations(AllocationID),
    TaskDate DATE DEFAULT GETDATE(),
    TargetPieces INT NOT NULL,
    CompletedPieces INT DEFAULT 0,
    Status NVARCHAR(20) DEFAULT 'Assigned', -- Assigned, InProgress, Completed
    StartTime DATETIME,
    EndTime DATETIME,
    Notes NVARCHAR(500),
    CreatedAt DATETIME DEFAULT GETDATE()
);

-- Create Daily Production table (actual production tracking)
CREATE TABLE DailyProduction (
    ProductionID INT IDENTITY(1,1) PRIMARY KEY,
    TaskID INT FOREIGN KEY REFERENCES ProductionTasks(TaskID),
    EmployeeID INT FOREIGN KEY REFERENCES Employees(EmployeeID),
    MachineID INT FOREIGN KEY REFERENCES Machines(MachineID),
    OrderID INT FOREIGN KEY REFERENCES ProductionOrders(OrderID),
    ProductionDate DATE DEFAULT GETDATE(),
    PiecesCompleted INT NOT NULL,
    QualityStatus NVARCHAR(20) DEFAULT 'Pending', -- Pending, ReadyForInspection, Approved, Rejected
    ShiftTime NVARCHAR(20),
    RecordedAt DATETIME DEFAULT GETDATE()
);

-- Create Quality Inspections table
CREATE TABLE QualityInspections (
    InspectionID INT IDENTITY(1,1) PRIMARY KEY,
    ProductionID INT FOREIGN KEY REFERENCES DailyProduction(ProductionID),
    InspectorID INT FOREIGN KEY REFERENCES Employees(EmployeeID),
    InspectionDate DATE DEFAULT GETDATE(),
    PiecesInspected INT NOT NULL,
    PiecesApproved INT DEFAULT 0,
    PiecesRejected INT DEFAULT 0,
    DefectTypes NVARCHAR(500), -- JSON or comma-separated
    InspectionNotes NVARCHAR(1000),
    Status NVARCHAR(20) DEFAULT 'Completed', -- Pending, Completed
    CreatedAt DATETIME DEFAULT GETDATE()
);

PRINT '✅ Production Planning tables created';

-- Insert sample data
INSERT INTO Styles (StyleCode, StyleName, Description, Category, EstimatedTimePerPiece, MaterialRequired) VALUES
('ST001', 'Basic Cotton T-Shirt', 'Round neck cotton t-shirt', 'T-Shirt', 15, 'Cotton fabric, Thread, Labels'),
('ST002', 'Denim Jeans Regular', 'Regular fit denim jeans', 'Jeans', 45, 'Denim fabric, Zippers, Buttons, Thread'),
('ST003', 'Silk Evening Dress', 'Elegant silk evening dress', 'Dress', 120, 'Silk fabric, Lining, Zippers, Thread');

INSERT INTO Machines (MachineCode, MachineName, MachineType, Status, Location, CapacityPerHour) VALUES
('MC001', 'Singer Industrial 1', 'Sewing', 'Available', 'Floor A - Section 1', 40),
('MC002', 'Singer Industrial 2', 'Sewing', 'Available', 'Floor A - Section 1', 40),
('MC003', 'Overlock Machine 1', 'Finishing', 'Available', 'Floor A - Section 2', 60),
('MC004', 'Cutting Machine 1', 'Cutting', 'Available', 'Floor B - Cutting', 120),
('MC005', 'Button Hole Machine', 'Finishing', 'Maintenance', 'Floor A - Section 3', 90);

INSERT INTO ProductionOrders (OrderCode, StyleID, ClientName, TotalQuantity, StartDate, DeadlineDate, Priority) VALUES
('ORD001', 1, 'Fashion Forward Ltd', 1000, GETDATE(), DATEADD(day, 15, GETDATE()), 'High'),
('ORD002', 2, 'Denim World', 500, GETDATE(), DATEADD(day, 20, GETDATE()), 'Medium'),
('ORD003', 3, 'Elite Boutique', 50, GETDATE(), DATEADD(day, 10, GETDATE()), 'High');

PRINT '✅ Sample data inserted';
GO

-- Create Views for Planning Manager Dashboard
CREATE VIEW vw_ProductionOverview AS
SELECT 
    po.OrderCode,
    po.ClientName,
    s.StyleName,
    po.TotalQuantity,
    po.CompletedQuantity,
    po.DeadlineDate,
    po.Priority,
    po.Status as OrderStatus,
    DATEDIFF(day, GETDATE(), po.DeadlineDate) as DaysRemaining,
    CAST((po.CompletedQuantity * 100.0 / po.TotalQuantity) AS DECIMAL(5,2)) as CompletionPercentage
FROM ProductionOrders po
JOIN Styles s ON po.StyleID = s.StyleID
WHERE po.Status != 'Cancelled';
GO

CREATE VIEW vw_MachineStatus AS
SELECT 
    m.MachineCode,
    m.MachineName,
    m.MachineType,
    m.Status,
    m.Location,
    e.Name as AssignedEmployee,
    po.OrderCode as CurrentOrder,
    ma.ShiftTime
FROM Machines m
LEFT JOIN MachineAllocations ma ON m.MachineID = ma.MachineID AND ma.Status = 'Active'
LEFT JOIN Employees e ON ma.EmployeeID = e.EmployeeID
LEFT JOIN ProductionOrders po ON ma.OrderID = po.OrderID;
GO

CREATE VIEW vw_DailyProductionSummary AS
SELECT 
    dp.ProductionDate,
    e.Name as EmployeeName,
    m.MachineName,
    po.OrderCode,
    s.StyleName,
    SUM(dp.PiecesCompleted) as TotalPieces,
    dp.QualityStatus,
    COUNT(*) as RecordCount
FROM DailyProduction dp
JOIN Employees e ON dp.EmployeeID = e.EmployeeID
JOIN Machines m ON dp.MachineID = m.MachineID
JOIN ProductionOrders po ON dp.OrderID = po.OrderID
JOIN Styles s ON po.StyleID = s.StyleID
GROUP BY dp.ProductionDate, e.Name, m.MachineName, po.OrderCode, s.StyleName, dp.QualityStatus;
GO

CREATE VIEW vw_QualityInspectionSummary AS
SELECT 
    qi.InspectionDate,
    e.Name as InspectorName,
    po.OrderCode,
    s.StyleName,
    SUM(qi.PiecesInspected) as TotalInspected,
    SUM(qi.PiecesApproved) as TotalApproved,
    SUM(qi.PiecesRejected) as TotalRejected,
    CAST((SUM(qi.PiecesApproved) * 100.0 / SUM(qi.PiecesInspected)) AS DECIMAL(5,2)) as ApprovalRate
FROM QualityInspections qi
JOIN DailyProduction dp ON qi.ProductionID = dp.ProductionID
JOIN Employees e ON qi.InspectorID = e.EmployeeID
JOIN ProductionOrders po ON dp.OrderID = po.OrderID
JOIN Styles s ON po.StyleID = s.StyleID
GROUP BY qi.InspectionDate, e.Name, po.OrderCode, s.StyleName;

GO
PRINT '✅ Views created for dashboards';
GO

-- Create Stored Procedures
CREATE PROCEDURE sp_AllocateMachineToEmployee
    @MachineID INT,
    @EmployeeID INT,
    @OrderID INT,
    @ShiftTime NVARCHAR(20)
AS
BEGIN
    -- Check if machine is available
    IF EXISTS (SELECT 1 FROM Machines WHERE MachineID = @MachineID AND Status = 'Available')
    BEGIN
        -- Update machine status
        UPDATE Machines SET Status = 'Occupied' WHERE MachineID = @MachineID;
        
        -- Create allocation
        INSERT INTO MachineAllocations (MachineID, EmployeeID, OrderID, ShiftTime)
        VALUES (@MachineID, @EmployeeID, @OrderID, @ShiftTime);
        
        SELECT 'Success' as Result, 'Machine allocated successfully' as Message;
    END
    ELSE
    BEGIN
        SELECT 'Error' as Result, 'Machine not available' as Message;
    END
END;
GO

CREATE PROCEDURE sp_CreateDailyTask
    @AllocationID INT,
    @TargetPieces INT,
    @TaskDate DATE = NULL
AS
BEGIN
    IF @TaskDate IS NULL
        SET @TaskDate = GETDATE();
    
    INSERT INTO ProductionTasks (AllocationID, TaskDate, TargetPieces)
    VALUES (@AllocationID, @TaskDate, @TargetPieces);
    
    SELECT 
        TaskID,
        TargetPieces,
        TaskDate,
        Status
    FROM ProductionTasks 
    WHERE TaskID = SCOPE_IDENTITY();
END;
GO

CREATE PROCEDURE sp_RecordProduction
    @TaskID INT,
    @PiecesCompleted INT,
    @Notes NVARCHAR(500) = NULL
AS
BEGIN
    DECLARE @AllocationID INT, @EmployeeID INT, @MachineID INT, @OrderID INT;
    
    -- Get allocation details
    SELECT @AllocationID = AllocationID FROM ProductionTasks WHERE TaskID = @TaskID;
    SELECT @EmployeeID = EmployeeID, @MachineID = MachineID, @OrderID = OrderID 
    FROM MachineAllocations WHERE AllocationID = @AllocationID;
    
    -- Update task
    UPDATE ProductionTasks 
    SET CompletedPieces = CompletedPieces + @PiecesCompleted,
        Status = CASE WHEN CompletedPieces + @PiecesCompleted >= TargetPieces THEN 'Completed' ELSE 'InProgress' END,
        Notes = @Notes
    WHERE TaskID = @TaskID;
    
    -- Record daily production. Recorded output goes straight onto the quality
    -- queue: without this the QualityStatus default of 'Pending' means a batch
    -- never appears in /quality/pending, which filters on 'ReadyForInspection'.
    INSERT INTO DailyProduction (TaskID, EmployeeID, MachineID, OrderID, PiecesCompleted, ShiftTime, QualityStatus)
    SELECT @TaskID, @EmployeeID, @MachineID, @OrderID, @PiecesCompleted, ma.ShiftTime, 'ReadyForInspection'
    FROM MachineAllocations ma WHERE AllocationID = @AllocationID;
    
    -- Update order completion
    UPDATE ProductionOrders 
    SET CompletedQuantity = CompletedQuantity + @PiecesCompleted
    WHERE OrderID = @OrderID;
    
    SELECT 'Success' as Result, 'Production recorded successfully' as Message;
END;
GO

CREATE PROCEDURE sp_GetPlanningDashboard
AS
BEGIN
    -- Production Overview
    SELECT 'ProductionOverview' as DataType, * FROM vw_ProductionOverview;
    
    -- Machine Status
    SELECT 'MachineStatus' as DataType, * FROM vw_MachineStatus;
    
    -- Today's Production Summary
    SELECT 'TodayProduction' as DataType, * FROM vw_DailyProductionSummary 
    WHERE ProductionDate = CAST(GETDATE() AS DATE);
    
    -- Quality Summary
    SELECT 'QualitySummary' as DataType, * FROM vw_QualityInspectionSummary 
    WHERE InspectionDate = CAST(GETDATE() AS DATE);
    
    -- Key Metrics
    SELECT 'Metrics' as DataType,
        (SELECT COUNT(*) FROM Machines WHERE Status = 'Available') as AvailableMachines,
        (SELECT COUNT(*) FROM Machines WHERE Status = 'Occupied') as OccupiedMachines,
        (SELECT COUNT(*) FROM DailyProduction WHERE ProductionDate = CAST(GETDATE() AS DATE) AND QualityStatus = 'ReadyForInspection') as ReadyForInspection,
        (SELECT COUNT(*) FROM DailyProduction WHERE ProductionDate = CAST(GETDATE() AS DATE) AND QualityStatus = 'Pending') as PendingInspection,
        (SELECT ISNULL(SUM(PiecesCompleted), 0) FROM DailyProduction WHERE ProductionDate = CAST(GETDATE() AS DATE)) as TodayProduction;
END;
GO

PRINT '✅ Stored procedures created';
PRINT '🎉 Production Planning & Quality Management schema complete!';