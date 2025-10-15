-- Fix CTC calculation in stored procedure
USE SmartERP;
GO

-- Update sp_CreateEmployee procedure to respect provided CTC
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
    
    -- Only calculate CTC if not provided (don't override user input)
    DECLARE @FinalCTC DECIMAL(15,2);
    IF @CTC IS NULL OR @CTC = 0
        SET @FinalCTC = @BaseSalary * 12;
    ELSE
        SET @FinalCTC = @CTC;
    
    INSERT INTO Employees (
        EmployeeCode, Name, Email, Phone, Position, Department, 
        JoiningDate, BaseSalary, CTC, Tasks, Address, EmergencyContact
    )
    VALUES (
        @EmployeeCode, @Name, @Email, @Phone, @Position, @Department,
        @JoiningDate, @BaseSalary, @FinalCTC, @Tasks, @Address, @EmergencyContact
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

PRINT '✅ Fixed CTC calculation - now respects user input';