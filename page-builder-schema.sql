-- Page Builder module
--
-- Stores client-authored page definitions, the custom columns they add to
-- existing ERP entities, and the menu entries that expose those pages.
--
-- A page's layout is JSON rather than a table per widget: the widget set will
-- keep growing, and a relational shape would need a migration every time.
-- ISJSON keeps the database from accepting a malformed definition.

USE SmartERP;
GO

IF EXISTS (SELECT * FROM sys.views WHERE name = 'vw_CustomPageMenus')
    DROP VIEW vw_CustomPageMenus;
IF EXISTS (SELECT * FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'CustomColumnValues')
    DROP TABLE CustomColumnValues;
IF EXISTS (SELECT * FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'CustomColumns')
    DROP TABLE CustomColumns;
IF EXISTS (SELECT * FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'AppMenus')
    DROP TABLE AppMenus;
IF EXISTS (SELECT * FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'MenuMappings')
    DROP TABLE MenuMappings;
IF EXISTS (SELECT * FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'CustomPages')
    DROP TABLE CustomPages;
GO

CREATE TABLE CustomPages (
    PageID      INT IDENTITY(1,1) PRIMARY KEY,
    PageKey     NVARCHAR(60)  NOT NULL,          -- URL slug: /p/<PageKey>
    -- 'page' and 'form' share one table and one renderer: a form is a page
    -- whose content is a form widget. Splitting them would mean two layout
    -- engines and two renderers to keep in step.
    Kind        NVARCHAR(10)  NOT NULL DEFAULT 'page',
    Title       NVARCHAR(150) NOT NULL,
    Description NVARCHAR(500),
    Layout      NVARCHAR(MAX) NOT NULL,          -- JSON: rows -> columns -> widgets
    Status      NVARCHAR(20)  NOT NULL DEFAULT 'Active',
    CreatedAt   DATETIME DEFAULT GETDATE(),
    UpdatedAt   DATETIME DEFAULT GETDATE(),

    CONSTRAINT UQ_CustomPages_Key  UNIQUE (PageKey),
    CONSTRAINT CK_CustomPages_Stat CHECK (Status IN ('Active','Inactive')),
    CONSTRAINT CK_CustomPages_Kind CHECK (Kind IN ('page','form')),
    -- A page that cannot be parsed can never be rendered, so refuse to store one.
    CONSTRAINT CK_CustomPages_Json CHECK (ISJSON(Layout) = 1)
);
GO

-- Every menu the application has: the built-ins seeded from
-- shared/app-menus.js plus any a client adds. Keeping them in one table is what
-- lets the Menu Mapping screen offer the whole application, and lets a menu
-- carry its page and API bindings on the same row — so one save maps all three.
CREATE TABLE AppMenus (
    MenuID    INT IDENTITY(1,1) PRIMARY KEY,
    MenuKey   NVARCHAR(60)  NOT NULL,
    Label     NVARCHAR(80)  NOT NULL,
    Icon      NVARCHAR(10),
    Section   NVARCHAR(50)  NOT NULL DEFAULT 'Main Menu',
    -- Nullable: a custom menu can be created before it is mapped, and until
    -- then it genuinely opens nothing. Built-ins always carry their own route.
    Path      NVARCHAR(120) NULL,
    SortOrder INT DEFAULT 100,
    IsBuiltIn BIT NOT NULL DEFAULT 0,

    -- Optional bindings. A page on a built-in menu overrides the screen that
    -- menu normally opens; ON DELETE SET NULL so removing a page unbinds the
    -- menu instead of leaving it pointing at nothing.
    PageID    INT NULL REFERENCES CustomPages(PageID) ON DELETE SET NULL,
    -- Bound to one of the application's own screens instead of a custom page.
    -- Kept separate from Path so a built-in menu never loses its canonical
    -- route: unbinding restores it rather than leaving nothing to open.
    TargetPath NVARCHAR(120) NULL,
    ApiKey    NVARCHAR(80) NULL,

    Status    NVARCHAR(20) NOT NULL DEFAULT 'Active',
    CreatedAt DATETIME DEFAULT GETDATE(),
    UpdatedAt DATETIME DEFAULT GETDATE(),

    CONSTRAINT UQ_AppMenus_Key  UNIQUE (MenuKey),
    CONSTRAINT CK_AppMenus_Stat CHECK (Status IN ('Active','Inactive'))
);
GO

CREATE INDEX IX_AppMenus_Section ON AppMenus (Section, SortOrder);
GO

-- Extra columns a client adds to an existing ERP entity. SourceKey refers to
-- the service's data-source registry, never to a raw table name supplied by
-- the browser.
CREATE TABLE CustomColumns (
    ColumnID  INT IDENTITY(1,1) PRIMARY KEY,
    SourceKey NVARCHAR(50)  NOT NULL,
    ColumnKey NVARCHAR(50)  NOT NULL,
    Label     NVARCHAR(100) NOT NULL,
    DataType  NVARCHAR(20)  NOT NULL DEFAULT 'text',
    Options   NVARCHAR(MAX),                      -- JSON array, for select/radio
    SortOrder INT DEFAULT 100,
    CreatedAt DATETIME DEFAULT GETDATE(),

    CONSTRAINT UQ_CustomColumns      UNIQUE (SourceKey, ColumnKey),
    CONSTRAINT CK_CustomColumns_Type CHECK (DataType IN ('text','number','date','select','radio','checkbox')),
    CONSTRAINT CK_CustomColumns_Opts CHECK (Options IS NULL OR ISJSON(Options) = 1)
);
GO

-- Values are stored per (column, record) rather than by altering the ERP
-- tables, so a client adding a field can never reshape a system table.
CREATE TABLE CustomColumnValues (
    ValueID   INT IDENTITY(1,1) PRIMARY KEY,
    ColumnID  INT NOT NULL FOREIGN KEY REFERENCES CustomColumns(ColumnID) ON DELETE CASCADE,
    RecordID  INT NOT NULL,                        -- primary key within the source entity
    Value     NVARCHAR(MAX),
    UpdatedAt DATETIME DEFAULT GETDATE(),

    CONSTRAINT UQ_CustomColumnValues UNIQUE (ColumnID, RecordID)
);
GO

CREATE INDEX IX_CustomColumnValues_Record ON CustomColumnValues (RecordID);
CREATE INDEX IX_CustomColumns_Source      ON CustomColumns (SourceKey);
GO

PRINT '✅ Page Builder tables created';
GO

CREATE VIEW vw_CustomPageMenus AS
SELECT
    m.MenuID,
    m.MenuKey,
    m.Label,
    m.Icon,
    m.Section,
    m.SortOrder,
    m.IsBuiltIn,
    m.Status      AS MenuStatus,
    m.ApiKey,
    m.TargetPath,
    -- A menu bound to a page opens that page; otherwise it keeps its own route.
    -- A bound custom page wins, then a bound application screen, then the
    -- menu's own route.
    COALESCE(
        CASE WHEN p.PageID IS NOT NULL AND p.Status = 'Active' THEN '/p/' + p.PageKey END,
        m.TargetPath,
        m.Path
    ) AS EffectivePath,
    p.PageID,
    p.PageKey,
    p.Title       AS PageTitle,
    p.Kind        AS PageKind,
    p.Status      AS PageStatus
FROM AppMenus m
LEFT JOIN CustomPages p ON m.PageID = p.PageID;
GO

PRINT '✅ Page Builder view created';
GO
