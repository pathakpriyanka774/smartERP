-- Payroll computed from attendance, with statutory deductions, and posted to
-- the ledger.
--
-- Pay policy (documented on the payslip and in docs/erp-audit/12):
--   * Pay is for calendar days. Days before the joining date are unpaid.
--   * 'absent' is one day's loss of pay (LOP); 'half-day' is half a day.
--   * 'present', 'late' and 'leave' (paid leave) are paid. Days with no
--     attendance record are paid, because weekly offs and holidays are not
--     recorded; mark absences to deduct them.
--   * LOP amount = base salary × LOP days ÷ calendar days.
--   * PF (employee share) = PF rate × earned basic, capped at the wage ceiling.
--     ESI (employee share) = ESI rate × gross, rounded up, only while gross is
--     within the ESI wage limit. Professional tax is a flat monthly amount.
--     All three are off or zero until set in OrganizationSettings, because
--     whether they apply depends on headcount and state.
--   * TDS is entered per payroll; other deductions as before.

ALTER TABLE Payrolls ADD COLUMN IF NOT EXISTS CalendarDays    INT;
ALTER TABLE Payrolls ADD COLUMN IF NOT EXISTS PresentDays     DECIMAL(5,1) NOT NULL DEFAULT 0;
ALTER TABLE Payrolls ADD COLUMN IF NOT EXISTS HalfDays        INT NOT NULL DEFAULT 0;
ALTER TABLE Payrolls ADD COLUMN IF NOT EXISTS LeaveDays       INT NOT NULL DEFAULT 0;
ALTER TABLE Payrolls ADD COLUMN IF NOT EXISTS AbsentDays      INT NOT NULL DEFAULT 0;
ALTER TABLE Payrolls ADD COLUMN IF NOT EXISTS UnmarkedDays    INT NOT NULL DEFAULT 0;
ALTER TABLE Payrolls ADD COLUMN IF NOT EXISTS PreJoiningDays  INT NOT NULL DEFAULT 0;
ALTER TABLE Payrolls ADD COLUMN IF NOT EXISTS LOPDays         DECIMAL(5,1) NOT NULL DEFAULT 0;
ALTER TABLE Payrolls ADD COLUMN IF NOT EXISTS PaidDays        DECIMAL(5,1);
ALTER TABLE Payrolls ADD COLUMN IF NOT EXISTS LOPAmount       DECIMAL(12,2) NOT NULL DEFAULT 0;
ALTER TABLE Payrolls ADD COLUMN IF NOT EXISTS EarnedBasic     DECIMAL(12,2);
ALTER TABLE Payrolls ADD COLUMN IF NOT EXISTS GrossPay        DECIMAL(12,2);
ALTER TABLE Payrolls ADD COLUMN IF NOT EXISTS PF              DECIMAL(10,2) NOT NULL DEFAULT 0;
ALTER TABLE Payrolls ADD COLUMN IF NOT EXISTS ESI             DECIMAL(10,2) NOT NULL DEFAULT 0;
ALTER TABLE Payrolls ADD COLUMN IF NOT EXISTS ProfessionalTax DECIMAL(10,2) NOT NULL DEFAULT 0;
ALTER TABLE Payrolls ADD COLUMN IF NOT EXISTS TDS             DECIMAL(10,2) NOT NULL DEFAULT 0;
ALTER TABLE Payrolls ADD COLUMN IF NOT EXISTS NetPay          DECIMAL(12,2);
ALTER TABLE Payrolls ADD COLUMN IF NOT EXISTS ComputedAt      TIMESTAMP;
ALTER TABLE Payrolls ADD COLUMN IF NOT EXISTS AccrualEntryID  INT REFERENCES JournalEntries(EntryID);
ALTER TABLE Payrolls ADD COLUMN IF NOT EXISTS PaymentEntryID  INT REFERENCES JournalEntries(EntryID);
ALTER TABLE Payrolls ADD COLUMN IF NOT EXISTS PaymentMethod   VARCHAR(10);
ALTER TABLE Payrolls ADD COLUMN IF NOT EXISTS ApprovedBy      INT REFERENCES Users(UserID) ON DELETE SET NULL;
ALTER TABLE Payrolls ADD COLUMN IF NOT EXISTS ApprovedAt      TIMESTAMP;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_payrolls_statutory') THEN
        ALTER TABLE Payrolls ADD CONSTRAINT CK_Payrolls_Statutory
            CHECK (PF >= 0 AND ESI >= 0 AND ProfessionalTax >= 0 AND TDS >= 0 AND LOPAmount >= 0
                   AND (NetPay IS NULL OR NetPay >= 0)) NOT VALID;
    END IF;
END $$;

/**
 * (Re)compute one payroll from the employee's attendance and the statutory
 * settings. Only a pending payroll is recomputed; others are left as they are.
 */
CREATE OR REPLACE FUNCTION sp_ComputePayroll(p_PayrollID INT)
RETURNS TABLE (PayrollID INT, NetPay DECIMAL)
LANGUAGE plpgsql AS $$
#variable_conflict use_column
DECLARE
    p          RECORD;
    s          RECORD;
    v_Start    DATE;
    v_End      DATE;
    v_Days     INT;
    v_Join     DATE;
    v_PreJoin  INT;
    v_Present  INT;
    v_Half     INT;
    v_Leave    INT;
    v_Absent   INT;
    v_Marked   INT;
    v_LOP      DECIMAL(5,1);
    v_LOPAmt   DECIMAL(12,2);
    v_Earned   DECIMAL(12,2);
    v_Gross    DECIMAL(12,2);
    v_PF       DECIMAL(10,2) := 0;
    v_ESI      DECIMAL(10,2) := 0;
    v_PT       DECIMAL(10,2) := 0;
    v_Net      DECIMAL(12,2);
BEGIN
    SELECT pr.*, e.JoiningDate INTO p
    FROM Payrolls pr JOIN Employees e ON e.EmployeeID = pr.EmployeeID
    WHERE pr.PayrollID = p_PayrollID FOR UPDATE OF pr;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Payroll % does not exist', p_PayrollID;
    END IF;
    IF p.Status <> 'pending' THEN
        RETURN QUERY SELECT p.PayrollID, p.NetPay;
        RETURN;
    END IF;
    SELECT * INTO s FROM OrganizationSettings WHERE SettingsID = 1;

    v_Start := to_date(p.Month || '-01', 'YYYY-MM-DD');
    v_End   := (v_Start + INTERVAL '1 month - 1 day')::DATE;
    v_Days  := v_End - v_Start + 1;
    v_Join  := COALESCE(p.JoiningDate, v_Start);
    v_PreJoin := LEAST(v_Days, GREATEST(0, v_Join - v_Start));

    SELECT COUNT(*) FILTER (WHERE a.Status IN ('present', 'late')),
           COUNT(*) FILTER (WHERE a.Status = 'half-day'),
           COUNT(*) FILTER (WHERE a.Status = 'leave'),
           COUNT(*) FILTER (WHERE a.Status = 'absent'),
           COUNT(*)
      INTO v_Present, v_Half, v_Leave, v_Absent, v_Marked
    FROM EmployeeAttendance a
    WHERE a.EmployeeID = p.EmployeeID
      AND a.AttendanceDate BETWEEN GREATEST(v_Start, v_Join) AND v_End;

    v_LOP    := v_PreJoin + v_Absent + v_Half * 0.5;
    v_LOPAmt := LEAST(p.BaseSalary, ROUND(p.BaseSalary * v_LOP / v_Days, 2));
    v_Earned := p.BaseSalary - v_LOPAmt;
    v_Gross  := v_Earned + COALESCE(p.Allowances, 0);

    IF s.PFEnabled AND v_Earned > 0 THEN
        v_PF := ROUND(LEAST(v_Earned, s.PFWageCeiling) * s.PFRate / 100, 0);
    END IF;
    IF s.ESIEnabled AND v_Gross > 0 AND v_Gross <= s.ESIWageLimit THEN
        v_ESI := CEIL(v_Gross * s.ESIRate / 100);
    END IF;
    IF v_Gross > 0 THEN
        v_PT := LEAST(s.ProfessionalTax, v_Gross);
    END IF;

    v_Net := v_Gross - v_PF - v_ESI - v_PT - COALESCE(p.TDS, 0) - COALESCE(p.Deductions, 0);
    IF v_Net < 0 THEN
        RAISE EXCEPTION 'Deductions (%) exceed gross pay (%) for payroll %', v_Gross - v_Net, v_Gross, p_PayrollID;
    END IF;

    UPDATE Payrolls pr SET
        CalendarDays = v_Days, PresentDays = v_Present + v_Half * 0.5, HalfDays = v_Half,
        LeaveDays = v_Leave, AbsentDays = v_Absent, PreJoiningDays = v_PreJoin,
        UnmarkedDays = GREATEST(0, v_Days - v_PreJoin - v_Marked),
        LOPDays = v_LOP, PaidDays = v_Days - v_LOP, LOPAmount = v_LOPAmt,
        EarnedBasic = v_Earned, GrossPay = v_Gross, PF = v_PF, ESI = v_ESI, ProfessionalTax = v_PT,
        NetPay = v_Net, ComputedAt = LOCALTIMESTAMP
    WHERE pr.PayrollID = p_PayrollID;

    RETURN QUERY SELECT p_PayrollID, v_Net;
END;
$$;

/**
 * Move a payroll through its lifecycle and post the accounting:
 *   approve:             Dr Salaries (gross)
 *                        Cr PF / ESI / PT / TDS / other deductions payable, Cr Salaries Payable (net)
 *   pay:                 Dr Salaries Payable, Cr Bank or Cash (net), plus a cash-book row
 *   back to pending, or cancel after approval: the accrual is reversed
 * Paying a pending payroll approves it first. Paid and cancelled are final.
 */
CREATE OR REPLACE FUNCTION sp_PayrollTransition(p_PayrollID INT, p_To VARCHAR, p_UserID INT, p_Date DATE, p_Method VARCHAR DEFAULT 'bank')
RETURNS TABLE (PayrollID INT, Status VARCHAR)
LANGUAGE plpgsql AS $$
#variable_conflict use_column
DECLARE
    p       RECORD;
    v_Name  VARCHAR(100);
    v_Entry INT;
    v_Cash  INT;
    v_Bank  VARCHAR(10) := CASE WHEN p_Method = 'cash' THEN '1000' ELSE '1010' END;
BEGIN
    SELECT pr.* INTO p FROM Payrolls pr WHERE pr.PayrollID = p_PayrollID FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Payroll % does not exist', p_PayrollID;
    END IF;
    SELECT e.Name INTO v_Name FROM Employees e WHERE e.EmployeeID = p.EmployeeID;

    IF p.Status = p_To THEN
        RETURN QUERY SELECT p.PayrollID, p.Status;
        RETURN;
    END IF;
    IF p.Status IN ('paid', 'cancelled') THEN
        RAISE EXCEPTION 'A % payroll cannot become %', p.Status, p_To;
    END IF;
    IF p_To NOT IN ('pending', 'approved', 'paid', 'cancelled') THEN
        RAISE EXCEPTION 'Unknown payroll status %', p_To;
    END IF;

    -- Leaving 'approved' for pending or cancelled undoes the accrual.
    IF p.Status = 'approved' AND p_To IN ('pending', 'cancelled') THEN
        IF p.AccrualEntryID IS NOT NULL THEN
            PERFORM sp_ReverseJournal(p.AccrualEntryID, p_Date, p_UserID, 'Payroll accrual reversed');
        END IF;
        UPDATE Payrolls pr SET Status = p_To, AccrualEntryID = NULL, ApprovedBy = NULL, ApprovedAt = NULL
        WHERE pr.PayrollID = p_PayrollID;
        IF p_To = 'pending' THEN PERFORM sp_ComputePayroll(p_PayrollID); END IF;
        RETURN QUERY SELECT p_PayrollID, p_To;
        RETURN;
    END IF;

    IF p_To = 'cancelled' THEN      -- from pending: nothing was posted
        UPDATE Payrolls pr SET Status = 'cancelled' WHERE pr.PayrollID = p_PayrollID;
        RETURN QUERY SELECT p_PayrollID, p_To;
        RETURN;
    END IF;
    IF p_To = 'pending' THEN
        RAISE EXCEPTION 'A % payroll cannot become pending', p.Status;
    END IF;

    -- approve (directly, or as the first half of paying a pending payroll)
    IF p.Status = 'pending' THEN
        PERFORM sp_ComputePayroll(p_PayrollID);
        SELECT pr.* INTO p FROM Payrolls pr WHERE pr.PayrollID = p_PayrollID;
        v_Entry := NULL;
        IF p.GrossPay > 0 THEN
            SELECT EntryID INTO v_Entry FROM sp_PostJournal(p_Date, 'Payroll ' || p.Month, 'payroll', p.PayrollID,
                format('Salary %s for %s', p.Month, v_Name), p_UserID,
                jsonb_build_array(
                    jsonb_build_object('account', '5100', 'debit',  p.GrossPay),
                    jsonb_build_object('account', '2210', 'credit', p.PF),
                    jsonb_build_object('account', '2211', 'credit', p.ESI),
                    jsonb_build_object('account', '2212', 'credit', p.ProfessionalTax),
                    jsonb_build_object('account', '2213', 'credit', p.TDS),
                    jsonb_build_object('account', '2290', 'credit', p.Deductions),
                    jsonb_build_object('account', '2200', 'credit', p.NetPay)));
        END IF;
        UPDATE Payrolls pr SET Status = 'approved', AccrualEntryID = v_Entry, ApprovedBy = p_UserID, ApprovedAt = LOCALTIMESTAMP
        WHERE pr.PayrollID = p_PayrollID;
        IF p_To = 'approved' THEN
            RETURN QUERY SELECT p_PayrollID, p_To;
            RETURN;
        END IF;
    END IF;

    -- pay
    SELECT pr.* INTO p FROM Payrolls pr WHERE pr.PayrollID = p_PayrollID;
    v_Entry := NULL;
    IF p.NetPay > 0 THEN
        SELECT EntryID INTO v_Entry FROM sp_PostJournal(p_Date, 'Salary ' || p.Month, 'payroll-payment', p.PayrollID,
            format('Salary paid %s to %s', p.Month, v_Name), p_UserID,
            jsonb_build_array(jsonb_build_object('account', '2200', 'debit', p.NetPay),
                              jsonb_build_object('account', v_Bank, 'credit', p.NetPay)));
        INSERT INTO FinanceTransactions (Type, Amount, Description, TxnDate, Category, Method, AccountCode, SourceType, SourceID, EntryID)
        VALUES ('expense', p.NetPay, format('Salary %s – %s', p.Month, v_Name), p_Date, 'Salaries',
                CASE WHEN p_Method = 'cash' THEN 'cash' ELSE 'bank' END, '5100', 'payroll', p.PayrollID, v_Entry)
        RETURNING TransactionID INTO v_Cash;
    END IF;
    UPDATE Payrolls pr SET Status = 'paid', PaidAt = LOCALTIMESTAMP, PaidBy = p_UserID,
        PaymentEntryID = v_Entry, PaymentMethod = COALESCE(p_Method, 'bank')
    WHERE pr.PayrollID = p_PayrollID;
    RETURN QUERY SELECT p_PayrollID, 'paid'::VARCHAR;
END;
$$;

-- Generation now computes every new payroll from attendance.
CREATE OR REPLACE FUNCTION sp_AutoGeneratePayroll(p_Month VARCHAR, p_ProcessedBy INT)
RETURNS TABLE (RecordsCreated INT, Month VARCHAR)
LANGUAGE plpgsql AS $$
#variable_conflict use_column
DECLARE
    v_Count INT := 0;
    v_ID    INT;
BEGIN
    FOR v_ID IN
        INSERT INTO Payrolls (EmployeeID, Month, BaseSalary, ProcessedBy)
        SELECT e.EmployeeID, p_Month, e.BaseSalary, p_ProcessedBy
        FROM Employees e
        WHERE e.IsActive = TRUE
          AND e.EmployeeID NOT IN (SELECT p.EmployeeID FROM Payrolls p WHERE p.Month = p_Month)
        RETURNING PayrollID
    LOOP
        PERFORM sp_ComputePayroll(v_ID);
        v_Count := v_Count + 1;
    END LOOP;
    RETURN QUERY SELECT v_Count, p_Month;
END;
$$;

-- Existing payrolls: compute the pending ones; give the others their stored
-- figures so NetPay is never empty.
UPDATE Payrolls SET GrossPay = BaseSalary + Allowances, EarnedBasic = BaseSalary,
                    NetPay = BaseSalary + Allowances - Deductions
WHERE NetPay IS NULL AND Status <> 'pending';
DO $$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT PayrollID FROM Payrolls WHERE Status = 'pending' AND NetPay IS NULL LOOP
        BEGIN
            PERFORM sp_ComputePayroll(r.PayrollID);
        EXCEPTION WHEN OTHERS THEN
            UPDATE Payrolls SET GrossPay = BaseSalary + Allowances, EarnedBasic = BaseSalary,
                                NetPay = GREATEST(0, BaseSalary + Allowances - Deductions)
            WHERE PayrollID = r.PayrollID;
        END;
    END LOOP;
END $$;
