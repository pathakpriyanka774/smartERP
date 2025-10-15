-- Complete SmartERP Database Setup
-- Run this in SSMS to create all required tables with ALL form fields

USE SmartERP;
GO

-- Drop existing tables if they exist (to recreate with all fields)
IF EXISTS (SELECT * FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'Payrolls')
    DROP TABLE Payrolls;
IF EXISTS (SELECT * FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'Employees')
    DROP TABLE Employees;
IF EXISTS (SELECT * FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'Users')
    DROP TABLE Users;

-- Create Users table
CREATE TABLE Users (
    UserID INT IDENTITY(1,1) PRIMARY KEY,
    Username NVARCHAR(50) UNIQUE NOT NULL,
    Email NVARCHAR(100) UNIQUE NOT NULL,
    PasswordHash NVARCHAR(255) NOT NULL,
    Role NVARCHAR(20) DEFAULT 'Employee',
    IsActive BIT DEFAULT 1,
    CreatedAt DATETIME DEFAULT GETDATE()
);
PRINT '✅ Users table created';

-- Create Employees table with ALL form fields
CREATE TABLE Employees (
    EmployeeID INT IDENTITY(1,1) PRIMARY KEY,
    EmployeeCode NVARCHAR(20) UNIQUE NOT NULL,
    Name NVARCHAR(100) NOT NULL,
    Email NVARCHAR(100) UNIQUE NOT NULL,
    Phone NVARCHAR(20),
    Position NVARCHAR(100) NOT NULL,
    Department NVARCHAR(100) NOT NULL,
    JoiningDate DATE DEFAULT GETDATE(),
    BaseSalary DECIMAL(12,2) NOT NULL,
    CTC DECIMAL(15,2),
    Tasks NVARCHAR(MAX),
    Address NVARCHAR(500),
    EmergencyContact NVARCHAR(200),
    Status NVARCHAR(20) DEFAULT 'active',
    IsActive BIT DEFAULT 1,
    CreatedAt DATETIME DEFAULT GETDATE()
);
PRINT '✅ Employees table created with all fields';

-- Create Payrolls table
CREATE TABLE Payrolls (
    PayrollID INT IDENTITY(1,1) PRIMARY KEY,
    EmployeeID INT FOREIGN KEY REFERENCES Employees(EmployeeID),
    Month NVARCHAR(7) NOT NULL,
    BaseSalary DECIMAL(12,2) NOT NULL,
    Allowances DECIMAL(10,2) DEFAULT 0,
    Deductions DECIMAL(10,2) DEFAULT 0,
    ProcessedBy INT,
    ProcessedAt DATETIME DEFAULT GETDATE()
);
PRINT '✅ Payrolls table created';

-- Create sp_CreateEmployee procedure with ALL fields
IF EXISTS (SELECT * FROM sys.procedures WHERE name = 'sp_CreateEmployee')
    DROP PROCEDURE sp_CreateEmployee;
GO

CREATE PROCEDURE sp_CreateEmployee
    @Name NVARCHAR(100),
    @Email NVARCHAR(100),
    @Phone NVARCHAR(20) = NULL,
    @Position NVARCHAR(100),
    @Department NVARCHAR(100),
    @JoiningDate DATE = NULL,
    @BaseSalary DECIMAL(12,2),
    @CTC DECIMAL(15,2) = NULL,
    @Tasks NVARCHAR(MAX) = NULL,
    @Address NVARCHAR(500) = NULL,
    @EmergencyContact NVARCHAR(200) = NULL
AS
BEGIN
    DECLARE @EmployeeCode NVARCHAR(20);
    SET @EmployeeCode = 'EMP' + RIGHT('000' + CAST((SELECT COUNT(*) + 1 FROM Employees) AS VARCHAR), 3);
    
    -- Set default joining date if not provided
    IF @JoiningDate IS NULL
        SET @JoiningDate = GETDATE();
    
    -- Calculate CTC if not provided (assume 12 times monthly salary)
    IF @CTC IS NULL
        SET @CTC = @BaseSalary * 12;
    
    INSERT INTO Employees (
        EmployeeCode, Name, Email, Phone, Position, Department, 
        JoiningDate, BaseSalary, CTC, Tasks, Address, EmergencyContact
    )
    VALUES (
        @EmployeeCode, @Name, @Email, @Phone, @Position, @Department,
        @JoiningDate, @BaseSalary, @CTC, @Tasks, @Address, @EmergencyContact
    );
    
    SELECT 
        EmployeeID as id,
        EmployeeCode as employeeCode,
        Name as name,
        Email as email,
        Phone as phone,
        Position as position,
        Department as department,
        JoiningDate as joiningDate,
        BaseSalary as baseSalary,
        CTC as ctc,
        Tasks as tasks,
        Address as address,
        EmergencyContact as emergencyContact,
        Status as status,
        IsActive as isActive
    FROM Employees 
    WHERE EmployeeID = SCOPE_IDENTITY();
END;
GO
PRINT '✅ sp_CreateEmployee procedure created with all fields';

-- Create sp_AutoGeneratePayroll procedure
IF EXISTS (SELECT * FROM sys.procedures WHERE name = 'sp_AutoGeneratePayroll')
    DROP PROCEDURE sp_AutoGeneratePayroll;
GO

CREATE PROCEDURE sp_AutoGeneratePayroll
    @Month NVARCHAR(7),
    @ProcessedBy INT
AS
BEGIN
    INSERT INTO Payrolls (EmployeeID, Month, BaseSalary, ProcessedBy)
    SELECT 
        EmployeeID, 
        @Month, 
        BaseSalary, 
        @ProcessedBy
    FROM Employees 
    WHERE IsActive = 1
    AND EmployeeID NOT IN (
        SELECT EmployeeID FROM Payrolls WHERE Month = @Month
    );
    
    SELECT @@ROWCOUNT as RecordsCreated, @Month as Month;
END;
GO
PRINT '✅ sp_AutoGeneratePayroll procedure created';

PRINT '🎉 Complete database setup finished! All form fields are now supported.';