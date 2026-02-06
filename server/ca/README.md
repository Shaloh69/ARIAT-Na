# SSL Certificate (ca.pem)

This folder contains the SSL certificate for Aiven MySQL connection.

## For Local Development (MySQL without SSL)

Leave `.env` SSL configuration empty:
```bash
DB_SSL_CA=
DB_SSL_REJECT_UNAUTHORIZED=false
```

## For Aiven Production

### Step 1: Download Certificate

1. Go to your Aiven console: https://console.aiven.io
2. Select your MySQL service
3. Go to **Overview** tab
4. Scroll to **Connection information**
5. Click **"Download CA Certificate"**
6. Save as `ca.pem` in this folder

### Step 2: Configure .env

Use relative path from server directory:

```bash
# Option 1: Relative path (recommended)
DB_SSL_CA=./ca/ca.pem

# Option 2: Absolute path
DB_SSL_CA=/home/user/ARIAT-Na/server/ca/ca.pem
```

### Step 3: Update Database Credentials

```bash
DB_HOST=your-service-name.aivencloud.com
DB_PORT=25060
DB_USER=avnadmin
DB_PASSWORD=your_aiven_password
DB_NAME=defaultdb
DB_SSL_REJECT_UNAUTHORIZED=true
```

### Step 4: Test Connection

```bash
cd /home/user/ARIAT-Na/server
npm start
```

You should see:
```
✅ Database connected successfully
   Host: your-service-name.aivencloud.com
   Database: defaultdb
   SSL: ✅ Enabled
```

## How It Works

The `database.ts` config uses `path.resolve(process.cwd(), process.env.DB_SSL_CA)` to:
- Resolve relative paths from the server directory
- Support absolute paths
- Load the certificate file using `fs.readFileSync()`

## Security Notes

- ⚠️ **Never commit** actual Aiven credentials to git
- ⚠️ The `ca.pem` file is **safe to commit** (it's a public CA certificate)
- ✅ Only the `DB_PASSWORD` needs to be kept secret

## Troubleshooting

### Error: ENOENT: no such file or directory

Your path is wrong. Check:
1. `ca.pem` exists in this folder
2. `.env` has correct path (use `./ca/ca.pem` for relative)
3. You're running `npm start` from `/server` directory

### Error: unable to get local issuer certificate

1. Re-download `ca.pem` from Aiven console
2. Make sure it's the CA certificate (not client certificate)
3. Verify `DB_SSL_REJECT_UNAUTHORIZED=true` is set

### Error: certificate has expired

Download a fresh certificate from Aiven console.
