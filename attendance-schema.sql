-- Employee Attendance module
--
-- One row per employee per day, enforced by a unique constraint rather than by
-- application logic, so a double check-in cannot create a duplicate day.

USE SmartERP;
GO

IF EXISTS (SELECT * FROM sys.views WHERE name = 'vw_AttendanceDetail')
    DROP VIEW vw_AttendanceDetail;
IF EXISTS (SELECT * FROM sys.views WHERE name = 'vw_AttendanceDailySummary')
    DROP VIEW vw_AttendanceDailySummary;
IF EXISTS (SELECT * FROM sys.procedures WHERE name = 'sp_AttendanceCheckIn')
    DROP PROCEDURE sp_AttendanceCheckIn;
IF EXISTS (SELECT * FROM sys.procedures WHERE name = 'sp_AttendanceCheckOut')
    DROP PROCEDURE sp_AttendanceCheckOut;
IF EXISTS (SELECT * FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'EmployeeAttendance')
    DROP TABLE EmployeeAttendance;
GO

CREATE TABLE EmployeeAttendance (
    AttendanceID   INT IDENTITY(1,1) PRIMARY KEY,
    EmployeeID     INT NOT NULL FOREIGN KEY REFERENCES Employees(EmployeeID),
    AttendanceDate DATE NOT NULL,
    CheckInTime    DATETIME,
    CheckOutTime   DATETIME,
    Status         NVARCHAR(20) NOT NULL DEFAULT 'present',
    TotalHours     DECIMAL(5,2) DEFAULT 0,
    Notes          NVARCHAR(500),
    CreatedAt      DATETIME DEFAULT GETDATE(),
    UpdatedAt      DATETIME DEFAULT GETDATE(),

    -- One attendance record per employee per day.
    CONSTRAINT UQ_Attendance_Employee_Date UNIQUE (EmployeeID, AttendanceDate),
    CONSTRAINT CK_Attendance_Status CHECK (Status IN ('present','absent','half-day','leave','late')),
    -- A checkout before the corresponding check-in is always a data error.
    CONSTRAINT CK_Attendance_Times CHECK (CheckOutTime IS NULL OR CheckInTime IS NULL OR CheckOutTime >= CheckInTime)
);
GO

CREATE INDEX IX_Attendance_Date ON EmployeeAttendance (AttendanceDate);
GO

PRINT '✅ EmployeeAttendance table created';
GO

-- Attendance joined to the employee, for listing screens.
CREATE VIEW vw_AttendanceDetail AS
SELECT
    a.AttendanceID,
    a.EmployeeID,
    e.EmployeeCode,
    e.Name AS EmployeeName,
    e.Department,
    e.Position,
    a.AttendanceDate,
    a.CheckInTime,
    a.CheckOutTime,
    a.Status,
    a.TotalHours,
    a.Notes
FROM EmployeeAttendance a
JOIN Employees e ON a.EmployeeID = e.EmployeeID;
GO

-- Per-day counts, used by the dashboard tiles.
CREATE VIEW vw_AttendanceDailySummary AS
SELECT
    a.AttendanceDate,
    COUNT(*)                                                     AS TotalRecords,
    SUM(CASE WHEN a.Status = 'present'  THEN 1 ELSE 0 END)       AS PresentCount,
    SUM(CASE WHEN a.Status = 'absent'   THEN 1 ELSE 0 END)       AS AbsentCount,
    SUM(CASE WHEN a.Status = 'half-day' THEN 1 ELSE 0 END)       AS HalfDayCount,
    SUM(CASE WHEN a.Status = 'leave'    THEN 1 ELSE 0 END)       AS LeaveCount,
    SUM(CASE WHEN a.Status = 'late'     THEN 1 ELSE 0 END)       AS LateCount,
    CAST(ISNULL(SUM(a.TotalHours), 0) AS DECIMAL(10,2))          AS TotalHours
FROM EmployeeAttendance a
GROUP BY a.AttendanceDate;
GO

PRINT '✅ Attendance views created';
GO

CREATE PROCEDURE sp_AttendanceCheckIn
    @EmployeeID INT,
    @AttendanceDate DATE = NULL,
    @CheckInTime DATETIME = NULL,
    @Notes NVARCHAR(500) = NULL,
    -- Cutoff for a late arrival. Supplied by the service from
    -- ATTENDANCE_LATE_AFTER; the default here keeps direct SQL calls consistent.
    @LateAfter NVARCHAR(8) = '10:30'
AS
BEGIN
    SET NOCOUNT ON;
    SET @AttendanceDate = ISNULL(@AttendanceDate, CAST(GETDATE() AS DATE));
    SET @CheckInTime    = ISNULL(@CheckInTime, GETDATE());

    IF NOT EXISTS (SELECT 1 FROM Employees WHERE EmployeeID = @EmployeeID AND IsActive = 1)
    BEGIN
        SELECT 'Error' AS Result, 'Employee not found or inactive' AS Message;
        RETURN;
    END

    DECLARE @AttendanceID INT, @ExistingIn DATETIME;
    SELECT @AttendanceID = AttendanceID, @ExistingIn = CheckInTime
    FROM EmployeeAttendance
    WHERE EmployeeID = @EmployeeID AND AttendanceDate = @AttendanceDate;

    -- Only an actual recorded arrival blocks a second check-in. A row that
    -- exists because the day was marked absent or on leave has no CheckInTime,
    -- and checking in should correct it rather than be refused.
    IF @AttendanceID IS NOT NULL AND @ExistingIn IS NOT NULL
    BEGIN
        SELECT 'Error' AS Result, 'Already checked in for this date' AS Message;
        RETURN;
    END

    DECLARE @Status NVARCHAR(20) =
        CASE WHEN CAST(@CheckInTime AS TIME) > CAST(@LateAfter AS TIME)
             THEN 'late' ELSE 'present' END;

    IF @AttendanceID IS NULL
    BEGIN
        INSERT INTO EmployeeAttendance (EmployeeID, AttendanceDate, CheckInTime, Status, Notes)
        VALUES (@EmployeeID, @AttendanceDate, @CheckInTime, @Status, @Notes);
        SET @AttendanceID = SCOPE_IDENTITY();
    END
    ELSE
    BEGIN
        UPDATE EmployeeAttendance
        SET CheckInTime = @CheckInTime,
            Status      = @Status,
            Notes       = COALESCE(@Notes, Notes),
            UpdatedAt   = GETDATE()
        WHERE AttendanceID = @AttendanceID;
    END

    SELECT 'Success' AS Result, 'Checked in' AS Message,
           @AttendanceID AS AttendanceID,
           @Status AS Status,
           CONVERT(char(5), @CheckInTime, 108) AS CheckInTime;
END;
GO

CREATE PROCEDURE sp_AttendanceCheckOut
    @EmployeeID INT,
    @AttendanceDate DATE = NULL,
    @CheckOutTime DATETIME = NULL
AS
BEGIN
    SET NOCOUNT ON;
    SET @AttendanceDate = ISNULL(@AttendanceDate, CAST(GETDATE() AS DATE));
    SET @CheckOutTime   = ISNULL(@CheckOutTime, GETDATE());

    DECLARE @AttendanceID INT, @CheckInTime DATETIME, @ExistingOut DATETIME;
    SELECT @AttendanceID = AttendanceID, @CheckInTime = CheckInTime, @ExistingOut = CheckOutTime
    FROM EmployeeAttendance
    WHERE EmployeeID = @EmployeeID AND AttendanceDate = @AttendanceDate;

    IF @AttendanceID IS NULL OR @CheckInTime IS NULL
    BEGIN
        SELECT 'Error' AS Result, 'No check-in found for this date' AS Message;
        RETURN;
    END
    IF @ExistingOut IS NOT NULL
    BEGIN
        SELECT 'Error' AS Result, 'Already checked out for this date' AS Message;
        RETURN;
    END
    IF @CheckOutTime < @CheckInTime
    BEGIN
        SELECT 'Error' AS Result, 'Check-out cannot precede check-in' AS Message;
        RETURN;
    END

    DECLARE @Hours DECIMAL(5,2) =
        CAST(DATEDIFF(minute, @CheckInTime, @CheckOutTime) / 60.0 AS DECIMAL(5,2));

    -- Status is left as check-in set it: a late arrival stays 'late' for the
    -- day, and overwriting it here would silently erase that.
    UPDATE EmployeeAttendance
    SET CheckOutTime = @CheckOutTime,
        TotalHours   = @Hours,
        UpdatedAt    = GETDATE()
    WHERE AttendanceID = @AttendanceID;

    SELECT 'Success' AS Result, 'Checked out' AS Message,
           @AttendanceID AS AttendanceID,
           @Hours AS TotalHours,
           CONVERT(char(5), @CheckOutTime, 108) AS CheckOutTime,
           (SELECT Status FROM EmployeeAttendance WHERE AttendanceID = @AttendanceID) AS Status;
END;
GO

PRINT '✅ Attendance procedures created';
GO
