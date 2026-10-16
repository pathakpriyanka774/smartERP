-- Per-user menu permissions.
--
-- Permissions were previously held in the browser's localStorage, which meant
-- they were per-device rather than per-account, absent on any other machine,
-- and editable by anyone with dev tools. They belong in the database, and they
-- are enforced on the server.

USE SmartERP;
GO

IF EXISTS (SELECT * FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'UserPermissions')
    DROP TABLE UserPermissions;
GO

CREATE TABLE UserPermissions (
    UserID    INT NOT NULL REFERENCES Users(UserID) ON DELETE CASCADE,
    MenuKey   NVARCHAR(60) NOT NULL,
    GrantedAt DATETIME DEFAULT GETDATE(),

    -- The pair is the identity: a permission is held or it is not.
    CONSTRAINT PK_UserPermissions PRIMARY KEY (UserID, MenuKey)
);
GO

CREATE INDEX IX_UserPermissions_User ON UserPermissions (UserID);
GO

PRINT '✅ UserPermissions table created';
GO
