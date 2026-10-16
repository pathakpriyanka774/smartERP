-- Payroll lifecycle and safe employee codes.
--
-- Payrolls had no status, so "Mark Paid" could not be stored (the API wrote
-- allowances and deductions to 0 instead). A payroll now moves
-- pending → approved → paid (or cancelled), and records who paid it and when.

ALTER TABLE Payrolls ADD COLUMN IF NOT EXISTS Status VARCHAR(20) NOT NULL DEFAULT 'pending';
ALTER TABLE Payrolls ADD COLUMN IF NOT EXISTS PaidAt TIMESTAMP;
ALTER TABLE Payrolls ADD COLUMN IF NOT EXISTS PaidBy INT REFERENCES Users(UserID) ON DELETE SET NULL;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_payrolls_status') THEN
        ALTER TABLE Payrolls ADD CONSTRAINT CK_Payrolls_Status
            CHECK (Status IN ('pending', 'approved', 'paid', 'cancelled'));
    END IF;

    -- One payroll per employee per month. Existing duplicates are not resolved
    -- automatically: which row is correct is a business decision, so the
    -- migration stops and says so instead of guessing.
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'uq_payrolls_employee_month') THEN
        IF EXISTS (SELECT 1 FROM Payrolls GROUP BY EmployeeID, Month HAVING COUNT(*) > 1) THEN
            RAISE EXCEPTION 'Payrolls contains more than one row for the same employee and month. Remove the duplicates (SELECT EmployeeID, Month, COUNT(*) FROM Payrolls GROUP BY 1,2 HAVING COUNT(*) > 1) and re-run setup-database.js.';
        END IF;
        ALTER TABLE Payrolls ADD CONSTRAINT UQ_Payrolls_Employee_Month UNIQUE (EmployeeID, Month);
    END IF;
END $$;

-- Employee codes came from COUNT(*) + 1, so two employees created at the same
-- moment got the same code and one failed. A sequence cannot collide. It
-- starts after the highest number already in use.
CREATE SEQUENCE IF NOT EXISTS EmployeeCodeSeq;
SELECT setval('EmployeeCodeSeq',
              GREATEST(1, COALESCE((SELECT MAX(NULLIF(regexp_replace(EmployeeCode, '\D', '', 'g'), '')::INT) FROM Employees), 0)),
              EXISTS (SELECT 1 FROM Employees));

CREATE OR REPLACE FUNCTION sp_CreateEmployee(
    p_Name             VARCHAR,
    p_Email            VARCHAR,
    p_Position         VARCHAR,
    p_Department       VARCHAR,
    p_BaseSalary       DECIMAL,
    p_Phone            VARCHAR DEFAULT NULL,
    p_JoiningDate      DATE    DEFAULT NULL,
    p_CTC              DECIMAL DEFAULT NULL,
    p_Tasks            TEXT    DEFAULT NULL,
    p_Address          VARCHAR DEFAULT NULL,
    p_EmergencyContact VARCHAR DEFAULT NULL
)
RETURNS TABLE (
    id INT, employeeCode VARCHAR, name VARCHAR, email VARCHAR, phone VARCHAR,
    "position" VARCHAR, department VARCHAR, joiningDate DATE, baseSalary DECIMAL,
    ctc DECIMAL, tasks TEXT, address VARCHAR, emergencyContact VARCHAR,
    status VARCHAR, isActive BOOLEAN
)
LANGUAGE plpgsql AS $$
#variable_conflict use_column
DECLARE
    v_Next INT := nextval('EmployeeCodeSeq');
    v_ID   INT;
BEGIN
    INSERT INTO Employees (
        EmployeeCode, Name, Email, Phone, Position, Department,
        JoiningDate, BaseSalary, CTC, Tasks, Address, EmergencyContact
    )
    VALUES (
        -- EMP001..EMP999, then widens instead of wrapping back to EMP000.
        'EMP' || LPAD(v_Next::TEXT, GREATEST(3, LENGTH(v_Next::TEXT)), '0'),
        p_Name, p_Email, p_Phone, p_Position, p_Department,
        COALESCE(p_JoiningDate, CURRENT_DATE), p_BaseSalary,
        CASE WHEN p_CTC IS NULL OR p_CTC = 0 THEN p_BaseSalary * 12 ELSE p_CTC END,
        p_Tasks, p_Address, p_EmergencyContact
    )
    RETURNING EmployeeID INTO v_ID;

    RETURN QUERY
    SELECT e.EmployeeID, e.EmployeeCode, e.Name, e.Email, e.Phone,
           e.Position, e.Department, e.JoiningDate, e.BaseSalary,
           e.CTC, e.Tasks, e.Address, e.EmergencyContact,
           e.Status, e.IsActive
    FROM Employees e
    WHERE e.EmployeeID = v_ID;
END;
$$;
