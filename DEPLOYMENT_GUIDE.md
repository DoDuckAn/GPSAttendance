# 🚀 Deployment Guide — Indoor Positioning Attendance System

Complete guide to deploy this system on **Vercel** (frontend + API) with **MongoDB Atlas** (database).

---

## 📋 Prerequisites

- **Node.js** ≥ 18 installed locally
- **npm** or **yarn** package manager
- A **GitHub** account (for Vercel deployment)
- A **MongoDB Atlas** account (free tier works)
- A **Vercel** account (free tier works)

---

## Step 1: Create MongoDB Atlas Cluster

### 1.1 Sign Up / Sign In
1. Go to [https://cloud.mongodb.com](https://cloud.mongodb.com)
2. Create an account or sign in

### 1.2 Create a Free Cluster
1. Click **"Build a Database"**
2. Select **"M0 FREE"** (Shared Cluster)
3. Choose a cloud provider (AWS recommended) and region closest to you
4. Name your cluster (e.g., `indoor-positioning`)
5. Click **"Create Cluster"**

### 1.3 Create Database User
1. Go to **Database Access** (left sidebar)
2. Click **"Add New Database User"**
3. Choose **"Password"** authentication
4. Set username and a strong password (⚠️ save these!)
5. User Privileges: **"Read and Write to any database"**
6. Click **"Add User"**

### 1.4 Allow Network Access
1. Go to **Network Access** (left sidebar)
2. Click **"Add IP Address"**
3. For development: click **"Allow Access from Anywhere"** (0.0.0.0/0)
   - For production: add only your Vercel IP ranges
4. Click **"Confirm"**

### 1.5 Get Connection String
1. Go to **Database** → click **"Connect"** on your cluster
2. Choose **"Connect your application"**
3. Select **Driver: Node.js**, **Version: 5.5 or later**
4. Copy the connection string. It looks like:
   ```
   mongodb+srv://<username>:<password>@cluster0.xxxxx.mongodb.net/?retryWrites=true&w=majority
   ```
5. Replace `<username>` and `<password>` with your actual credentials
6. Add the database name before the `?`:
   ```
   mongodb+srv://myuser:mypassword@cluster0.xxxxx.mongodb.net/indoor-positioning?retryWrites=true&w=majority
   ```

---

## Step 2: Local Development Setup

### 2.1 Install Dependencies
```bash
cd test_dinh_vi
npm install
```

### 2.2 Configure Environment
1. Copy the example env file:
   ```bash
   cp .env.example .env
   ```
2. Edit `.env` and paste your MongoDB connection string:
   ```
   MONGODB_URI=mongodb+srv://myuser:mypassword@cluster0.xxxxx.mongodb.net/indoor-positioning?retryWrites=true&w=majority
   ```

### 2.3 Run Development Server
```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) to see the app.

- **Client page**: http://localhost:3000
- **Admin panel**: http://localhost:3000/admin
- **Room management**: http://localhost:3000/admin/rooms
- **Attendance logs**: http://localhost:3000/admin/logs
- **Analytics**: http://localhost:3000/admin/analytics

---

## Step 3: Deploy to Vercel

### 3.1 Push to GitHub
```bash
cd test_dinh_vi
git init
git add .
git commit -m "Initial commit: indoor positioning attendance system"
git remote add origin https://github.com/YOUR_USERNAME/YOUR_REPO.git
git push -u origin main
```

### 3.2 Deploy on Vercel
1. Go to [https://vercel.com](https://vercel.com)
2. Sign in with your GitHub account
3. Click **"Add New..."** → **"Project"**
4. Import your GitHub repository
5. Vercel auto-detects it's a Next.js project

### 3.3 Set Environment Variables
1. Before deploying, go to **"Environment Variables"** section
2. Add the following variable:
   | Name | Value |
   |------|-------|
   | `MONGODB_URI` | `mongodb+srv://user:pass@cluster0.xxxxx.mongodb.net/indoor-positioning?retryWrites=true&w=majority` |
3. Make sure it's available in **Production**, **Preview**, and **Development**

### 3.4 Deploy
1. Click **"Deploy"**
2. Wait for the build to complete (~1-2 minutes)
3. Your app is live at: `https://your-project.vercel.app`

---

## Step 4: Test the System

### 4.1 Create a Room
1. Go to `/admin/rooms`
2. Enter a room name (e.g., "Lab A1-101")
3. Optionally add polygon corners in format: `lat,lng; lat,lng; lat,lng; lat,lng`
4. Set buffer radius (default: 30m)
5. Click "Create Room"

### 4.2 Perform a Check-in
1. Go to `/` (client page)
2. Select a room
3. Click "Check In"
4. Allow GPS permissions when prompted
5. Wait for GPS sample collection (~10 seconds)
6. View algorithm results
7. Provide ground truth feedback (YES/NO)

### 4.3 View Analytics
1. After collecting several check-ins with feedback
2. Go to `/admin/analytics`
3. View accuracy comparison charts, confusion matrices, and per-room performance

### 4.4 Export Data
- CSV: Visit `/api/export?format=csv`
- JSON: Visit `/api/export?format=json`
- Filter by room: `/api/export?format=csv&roomId=ROOM_ID`

---

## 🔧 API Endpoints Reference

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/rooms` | List all rooms |
| POST | `/api/rooms` | Create a room |
| GET | `/api/rooms/:id` | Get room detail |
| PUT | `/api/rooms/:id` | Update room |
| DELETE | `/api/rooms/:id` | Delete room |
| GET | `/api/attendance` | List attendance logs |
| POST | `/api/attendance` | Check-in (submit GPS samples) |
| PATCH | `/api/attendance/:id/feedback` | Update ground truth |
| GET | `/api/analytics` | Get algorithm metrics |
| GET | `/api/export?format=csv` | Export data as CSV |
| GET | `/api/export?format=json` | Export data as JSON |

---

## ⚠️ Troubleshooting

### "MongoServerError: bad auth"
- Double check your username and password in the connection string
- Make sure the password doesn't contain special characters that need URL encoding

### "MongoNetworkError: connection refused"
- Check Network Access in MongoDB Atlas — ensure your IP is whitelisted
- For Vercel, allow 0.0.0.0/0 (all IPs)

### GPS not working
- Make sure you're using HTTPS (Vercel provides this automatically)
- GPS requires HTTPS or localhost
- On mobile, allow location permissions

### No analytics data
- Analytics requires at least one check-in WITH ground truth feedback
- The feedback is the YES/NO answer after check-in

---

## 📝 Notes

- **Free tier limits**: MongoDB Atlas M0 has 512MB storage. Sufficient for research.
- **Vercel free tier**: Supports serverless functions with cold starts. API routes work well.
- **GPS accuracy**: Indoor GPS is inherently unreliable (20-100m+ accuracy). This is expected and part of the research.
