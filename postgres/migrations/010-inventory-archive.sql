-- Retire obsolete stock items without deleting their history.
--
-- An archived item keeps its movements and ledger postings but is left out of
-- the stock list (unless asked for), the order and purchase pickers and the
-- stock statistics. Only an item with nothing on hand or reserved can be
-- archived, so no stock value disappears from view.

ALTER TABLE InventoryItems ADD COLUMN IF NOT EXISTS IsActive BOOLEAN NOT NULL DEFAULT TRUE;
CREATE INDEX IF NOT EXISTS IX_Inventory_Active ON InventoryItems (IsActive);

-- New columns go at the end, so CREATE OR REPLACE keeps the existing ones.
CREATE OR REPLACE VIEW vw_InventoryStatus AS
SELECT
    i.ItemID, i.ItemName, i.Category, i.Quantity, i.Unit, i.ReorderLevel,
    CASE
        WHEN i.Quantity <= 0 THEN 'out-of-stock'
        WHEN i.Quantity <= i.ReorderLevel THEN 'low-stock'
        ELSE 'in-stock'
    END AS Status,
    i.SKU,
    i.UnitCost,
    i.ReservedQuantity,
    i.Quantity - i.ReservedQuantity AS AvailableQuantity,
    CAST(i.Quantity * i.UnitCost AS DECIMAL(16,2)) AS TotalValue,
    i.HSNCode,
    i.GSTRate,
    i.IsActive,
    (SELECT MAX(m.CreatedAt) FROM StockMovements m WHERE m.ItemID = i.ItemID) AS LastMovementAt
FROM InventoryItems i;
