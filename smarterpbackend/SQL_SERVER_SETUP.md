# SQL Server Setup Guide for SmartERP

> **Note:** the Windows-specific instructions below (services.msc, SQL Server
> Configuration Manager, SSMS) apply only to a Windows host. On Linux or macOS,
> use the Docker container documented in `README.md` and then run
> `node ../setup-database.js`. Windows Authentication is not available off
> Windows, so `DB_USER`/`DB_PASSWORD` must be set in `.env`.

## Current Status
✅ mssql package installed  
✅ Database connection files created  
✅ Environment configuration ready (`.env.example` → `.env`)  
✅ SQL Server connection working (SQL Server 2022 via Docker)  

## Step 1: Configure SQL Server

### Enable SQL Server Services
1. Press `Win + R`, type `services.msc`, press Enter
2. Find and start these services:
   - **SQL Server (SQLEXPRESS)** - Set to Automatic
   - **SQL Server Browser** - Set to Automatic

### Enable TCP/IP Protocol
1. Press `Win + R`, type `SQLServerManager15.msc` (or SQLServerManager14.msc), press Enter
2. Go to **SQL Server Network Configuration** → **Protocols for SQLEXPRESS**
3. Right-click **TCP/IP** → **Enable**
4. Right-click **TCP/IP** → **Properties** → **IP Addresses** tab
5. Scroll to **IPAll** section:
   - **TCP Dynamic Ports**: Leave empty
   - **TCP Port**: Set to `1433`
6. Restart SQL Server service

### Configure Windows Firewall
1. Open Windows Firewall
2. Click **Allow an app or feature through Windows Firewall**
3. Add **SQL Server** and **SQL Server Browser**
4. Or create inbound rule for port 1433

## Step 2: Test Connection

### Option A: Windows Authentication (Recommended)
Update `.env` file:
```env
DB_SERVER=.\\SQLEXPRESS
DB_DATABASE=SmartERP
DB_USER=
DB_PASSWORD=
```

### Option B: SQL Server Authentication
1. Open SSMS
2. Connect to your SQL Server
3. Right-click server → **Properties** → **Security**
4. Select **SQL Server and Windows Authentication mode**
5. Restart SQL Server service
6. Create/enable SA account:
   ```sql
   ALTER LOGIN sa ENABLE;
   ALTER LOGIN sa WITH PASSWORD = 'YourSecurePassword123!';
   ```

Update `.env` file:
```env
DB_SERVER=localhost\\SQLEXPRESS
DB_DATABASE=SmartERP
DB_USER=sa
DB_PASSWORD=YourSecurePassword123!
```

## Step 3: Test Your Setup

Run the connection test:
```bash
node test-connection.js
```

If successful, initialize the database:
```bash
node -e "require('./shared/init-db').initTables()"
```

Start the example API:
```bash
node example-api.js
```

Test the API:
```bash
curl http://localhost:5000/api/test
```

## Common Issues

### "Failed to connect" Error
- Check if SQL Server service is running
- Verify TCP/IP is enabled
- Check Windows Firewall settings
- Try different server names: `localhost\\SQLEXPRESS`, `.\\SQLEXPRESS`, `(local)\\SQLEXPRESS`

### "Login failed" Error
- For Windows Auth: Make sure your Windows user has access to SQL Server
- For SQL Auth: Verify SA account is enabled and password is correct

### "Database does not exist" Error
Create the database in SSMS:
```sql
CREATE DATABASE SmartERP;
```

## Your Current Configuration

**Database Connection**: `./shared/database.js`  
**Table Initialization**: `./shared/init-db.js`  
**Environment Config**: `./.env`  
**Test Scripts**: `test-connection.js`, `test-sql-server.js`, `test-windows-auth.js`  
**Example API**: `example-api.js`  

## Next Steps

1. Fix SQL Server connection using the steps above
2. Run `node test-connection.js` to verify
3. Initialize tables with `node -e "require('./shared/init-db').initTables()"`
4. Start building your API endpoints using the example in `example-api.js`