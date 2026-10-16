-- Business rules enforced by the database, behind the API's own validation.
--
-- Added NOT VALID: every new or changed row must satisfy them, but rows that
-- already exist are not re-checked, so this migration cannot fail on old data.
-- Check existing rows later with:  ALTER TABLE <t> VALIDATE CONSTRAINT <name>;

CREATE OR REPLACE FUNCTION pg_temp.add_check(p_table TEXT, p_name TEXT, p_expr TEXT) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = lower(p_name)) THEN
        EXECUTE format('ALTER TABLE %s ADD CONSTRAINT %s CHECK (%s) NOT VALID', p_table, p_name, p_expr);
    END IF;
END;
$$;

-- Sales orders
SELECT pg_temp.add_check('Orders', 'CK_Orders_Amount', 'TotalAmount >= 0');
SELECT pg_temp.add_check('Orders', 'CK_Orders_Status',
    $c$Status IN ('pending','confirmed','in-production','ready','dispatched','delivered','completed','cancelled')$c$);
SELECT pg_temp.add_check('Orders', 'CK_Orders_Priority', $c$Priority IN ('low','medium','high','urgent')$c$);
SELECT pg_temp.add_check('Orders', 'CK_Orders_Dates', 'DeliveryDate IS NULL OR OrderDate IS NULL OR DeliveryDate >= OrderDate');

-- Stock
SELECT pg_temp.add_check('InventoryItems', 'CK_Inventory_Quantity', 'Quantity >= 0');
SELECT pg_temp.add_check('InventoryItems', 'CK_Inventory_Reorder', 'ReorderLevel >= 0');

-- Money
SELECT pg_temp.add_check('FinanceTransactions', 'CK_Finance_Amount', 'Amount > 0');
SELECT pg_temp.add_check('FinanceTransactions', 'CK_Finance_Type', $c$Type IN ('income','expense')$c$);

-- Payroll
SELECT pg_temp.add_check('Employees', 'CK_Employees_Salary', 'BaseSalary > 0');
SELECT pg_temp.add_check('Payrolls', 'CK_Payrolls_Amounts', 'BaseSalary >= 0 AND Allowances >= 0 AND Deductions >= 0');
SELECT pg_temp.add_check('Payrolls', 'CK_Payrolls_Month', $c$Month ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'$c$);

-- Production and quality
SELECT pg_temp.add_check('ProductionOrders', 'CK_ProdOrders_Quantity', 'TotalQuantity > 0 AND CompletedQuantity >= 0');
SELECT pg_temp.add_check('ProductionTasks', 'CK_Tasks_Pieces', 'TargetPieces > 0 AND CompletedPieces >= 0');
SELECT pg_temp.add_check('DailyProduction', 'CK_DailyProduction_Pieces', 'PiecesCompleted > 0');
SELECT pg_temp.add_check('QualityInspections', 'CK_Inspections_Pieces',
    'PiecesInspected > 0 AND PiecesApproved >= 0 AND PiecesRejected >= 0 AND PiecesApproved + PiecesRejected = PiecesInspected');

-- Clients
SELECT pg_temp.add_check('Clients', 'CK_Clients_Status', $c$Status IN ('active','inactive')$c$);

-- PostgreSQL does not index foreign-key columns by itself; the production
-- and quality views join on all of these.
CREATE INDEX IF NOT EXISTS IX_Payrolls_Employee       ON Payrolls (EmployeeID);
CREATE INDEX IF NOT EXISTS IX_Allocations_Machine     ON MachineAllocations (MachineID);
CREATE INDEX IF NOT EXISTS IX_Allocations_Employee    ON MachineAllocations (EmployeeID);
CREATE INDEX IF NOT EXISTS IX_Allocations_Order       ON MachineAllocations (OrderID);
CREATE INDEX IF NOT EXISTS IX_Tasks_Allocation        ON ProductionTasks (AllocationID);
CREATE INDEX IF NOT EXISTS IX_Tasks_Date              ON ProductionTasks (TaskDate);
CREATE INDEX IF NOT EXISTS IX_DailyProduction_Task    ON DailyProduction (TaskID);
CREATE INDEX IF NOT EXISTS IX_DailyProduction_Order   ON DailyProduction (OrderID);
CREATE INDEX IF NOT EXISTS IX_DailyProduction_Date    ON DailyProduction (ProductionDate);
CREATE INDEX IF NOT EXISTS IX_Inspections_Production  ON QualityInspections (ProductionID);
CREATE INDEX IF NOT EXISTS IX_StyleCostings_Style     ON StyleCostings (StyleID);
CREATE INDEX IF NOT EXISTS IX_StyleCostings_Material  ON StyleCostings (MaterialID);
CREATE INDEX IF NOT EXISTS IX_ProductionOrders_Style  ON ProductionOrders (StyleID);
CREATE INDEX IF NOT EXISTS IX_Finance_Date            ON FinanceTransactions (TxnDate);
CREATE INDEX IF NOT EXISTS IX_Orders_Status           ON Orders (Status);
