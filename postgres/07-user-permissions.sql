-- Per-user menu permissions.
-- PostgreSQL port of user-permissions-schema.sql.
--
-- Permissions were previously held in the browser's localStorage, which meant
-- they were per-device rather than per-account, absent on any other machine,
-- and editable by anyone with dev tools. They belong in the database, and they
-- are enforced on the server.

DROP TABLE IF EXISTS UserPermissions CASCADE;

CREATE TABLE UserPermissions (
    UserID    INT NOT NULL REFERENCES Users(UserID) ON DELETE CASCADE,
    MenuKey   VARCHAR(60) NOT NULL,
    GrantedAt TIMESTAMP DEFAULT LOCALTIMESTAMP,

    -- The pair is the identity: a permission is held or it is not.
    CONSTRAINT PK_UserPermissions PRIMARY KEY (UserID, MenuKey)
);

CREATE INDEX IX_UserPermissions_User ON UserPermissions (UserID);
