# Deploying the Shop Portal to admin.khaasfurniture.com (Oracle Linux + Nginx + PM2)

Result: `https://admin.khaasfurniture.com` runs this app on your Oracle server, behind Cloudflare and Nginx, with HTTPS,
a private MongoDB, and PM2 keeping it alive. The main site `khaasfurniture.com` is not touched.

Replace `PASSWORD`, `YOUR-STRONG-...` etc. with your own values. Run commands on the server over SSH unless it says "Cloudflare" or "Oracle console".

---------------------------------------------------------------------------------------------------

## Step 0. Before you start (on your PC)

1. Make sure the newest code is on GitHub (GitHub Desktop: Commit, then Push). The server downloads from GitHub.
2. Check your Oracle server's address: `144.24.124.186` (the A record of khaasfurniture.com).
3. Connect: `ssh opc@144.24.124.186` (or `ubuntu@` / `ec2-user@`, whatever user your Oracle image uses; it is usually `opc` on Oracle Linux).

## Step 1. Look at what is already on the server

```bash
cat /etc/os-release | head -3        # Oracle Linux 8 or 9?
uname -m                             # x86_64 or aarch64 (both work)
free -m                              # RAM. Under ~2 GB: do the swap step below
sudo ss -tlnp | grep -E ':(80|443|3100|27017)\b'   # what already uses these ports
nginx -v; node -v; mongod --version  # which of these exist already
```

- If **Nginx** already serves khaasfurniture.com: good, we add one more site next to it.
- If **something else** (Apache, a Node app) owns ports 80/443, stop and ask: we then add the admin site to that program instead.
- If **MongoDB** is already installed, skip step 4's install and only create the new database user.
- This app uses **port 3100** (internal only), so it cannot clash with another app on 3000.

## Step 2. Open the Oracle firewall (Oracle console + server)

Oracle blocks everything except SSH by default, in two places:

1. **Oracle Cloud console:** Networking → Virtual Cloud Networks → your VCN → Security Lists (or the instance's Network Security Group) →
   Ingress Rules → add: source `0.0.0.0/0`, TCP, destination ports **80** and **443**. (Skip if already there for the main site.)
   Do NOT open 27017 (MongoDB) or 3100 (the app). Never.
2. **On the server:**
   ```bash
   sudo firewall-cmd --permanent --add-service=http --add-service=https
   sudo firewall-cmd --reload
   sudo firewall-cmd --list-all        # should list http, https, ssh only
   ```

## Step 3. Install the tools

```bash
sudo dnf install -y git nginx openssl certbot
# Node.js 22 (the app needs 20.9 or newer; 22 is the safe choice)
curl -fsSL https://rpm.nodesource.com/setup_22.x | sudo bash -
sudo dnf install -y nodejs
node -v        # v22.x
sudo npm install -g pm2
sudo systemctl enable --now nginx
```
(If `certbot` is not in the Oracle repos: `sudo dnf install -y oracle-epel-release-el9` (or `-el8`), then retry. On some images use
`sudo dnf install -y python3-certbot-nginx` instead.)

**Less than 2 GB RAM?** The build needs memory. Add a 2 GB swap file once:
```bash
sudo fallocate -l 2G /swapfile && sudo chmod 600 /swapfile && sudo mkswap /swapfile && sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
```

SELinux (Oracle Linux has it on): let Nginx talk to the app on localhost:
```bash
sudo setsebool -P httpd_can_network_connect 1
```

## Step 4. MongoDB (private, with a password)

Install (skip if it is already installed), Oracle Linux 8/9:
```bash
sudo tee /etc/yum.repos.d/mongodb-org-8.0.repo <<'EOF'
[mongodb-org-8.0]
name=MongoDB Repository
baseurl=https://repo.mongodb.org/yum/redhat/$releasever/mongodb-org/8.0/$basearch/
gpgcheck=1
enabled=1
gpgkey=https://pgp.mongodb.com/server-8.0.asc
EOF
sudo dnf install -y mongodb-org
sudo systemctl enable --now mongod
```

Create the passwords BEFORE turning security on (use long passwords with letters and numbers only, so no special-character trouble in the connection string):
```bash
mongosh
```
inside mongosh:
```js
use admin
db.createUser({ user: "dbadmin", pwd: passwordPrompt(), roles: [{ role: "root", db: "admin" }] })
use shop_portal
db.createUser({ user: "shopapp", pwd: passwordPrompt(), roles: [{ role: "readWrite", db: "shop_portal" }] })
exit
```
Now lock it down: `sudo nano /etc/mongod.conf` and make these two sections look like this:
```yaml
net:
  port: 27017
  bindIp: 127.0.0.1        # ONLY this server can reach it. Never 0.0.0.0.

security:
  authorization: enabled
```
```bash
sudo systemctl restart mongod
mongosh "mongodb://shopapp:PASSWORD@127.0.0.1:27017/shop_portal?authSource=shop_portal" --eval "db.runCommand({ping:1})"
```
It must print `{ ok: 1 }`. That string (`mongodb://shopapp:PASSWORD@127.0.0.1:27017/shop_portal?authSource=shop_portal`) is your `MONGODB_URI`.

**This is the only change MongoDB needs.** The app connects to localhost with that user. No ports are opened to the internet.

## Step 5. A normal user for the app (not root) and the code

```bash
sudo useradd -m -s /bin/bash deploy
sudo mkdir -p /var/www/shop-portal /var/www/certbot
sudo chown deploy:deploy /var/www/shop-portal
sudo -iu deploy                      # from here on you are the "deploy" user
git clone https://github.com/Zohaib9911/daily-expense.git /var/www/shop-portal
cd /var/www/shop-portal
```
(If you make the GitHub repo private, which is a good idea, create a read-only "deploy key": `ssh-keygen -t ed25519 -f ~/.ssh/id_ed25519 -N ""`,
`cat ~/.ssh/id_ed25519.pub`, add it at GitHub → repo → Settings → Deploy keys (no write access), and clone with
`git clone git@github.com:Zohaib9911/daily-expense.git`.)

## Step 6. The secret settings file (.env) on the server

This file never goes to GitHub. Create it on the server:
```bash
cd /var/www/shop-portal
nano .env
```
Paste (fill in your values):
```
MONGODB_URI=mongodb://shopapp:PASSWORD@127.0.0.1:27017/shop_portal?authSource=shop_portal
NEXTAUTH_SECRET=PASTE_THE_RESULT_OF: openssl rand -base64 32
NEXTAUTH_URL=https://admin.khaasfurniture.com
UPLOAD_DIR=/var/www/shop-portal-uploads

R2_ACCOUNT_ID=...
R2_ACCESS_KEY_ID=...
R2_SECRET_ACCESS_KEY=...
R2_BUCKET_NAME=khaas-furniture
R2_PUBLIC_URL=https://pub-....r2.dev
R2_PREFIX=shop-portal/
```
- `NEXTAUTH_URL` MUST start with `https://` (it makes the login cookie "secure").
- Use a NEW `NEXTAUTH_SECRET` for the server (`openssl rand -base64 32`). Do not reuse your PC's.
- The R2 values are the same as on your PC. Photos then go to the R2 bucket, so the server's disk holds no photos.
- Then: `chmod 600 .env` (only the app user can read it).

## Step 7. Build and start with PM2

```bash
cd /var/www/shop-portal
npm ci
npm run build
node scripts/seed-admin.js zohaib9911 'YOUR-STRONG-PASSWORD' "Zohaib"    # creates the owner login in the NEW server database
pm2 start ecosystem.config.cjs
pm2 save
curl -I http://127.0.0.1:3100/login        # should say 200
```
The server database starts EMPTY and has only this owner. Choose a NEW strong password (not one you have typed into chat or documents).
Never run `seed-demo.js` here.

Make PM2 start by itself after a reboot:
```bash
pm2 startup systemd -u deploy --hp /home/deploy
```
It prints one `sudo env PATH=... pm2 startup ...` line. Copy that exact line, `exit` to your sudo user, run it, then `sudo -iu deploy` and `pm2 save`.

Useful: `pm2 status`, `pm2 logs shop-portal --lines 50`, `pm2 restart shop-portal`, `pm2 install pm2-logrotate` (keeps logs from filling the disk).

## Step 8. Cloudflare: add the admin address

Cloudflare dashboard → khaasfurniture.com → DNS → Records → **Add record**:

| Type | Name | IPv4 address | Proxy status |
|------|------|--------------|--------------|
| A | `admin` | `144.24.124.186` | **Proxied** (orange cloud) |

Then SSL/TLS → Overview → set encryption mode to **Full (strict)** (do this after step 9 works, otherwise you will see errors).
Also: SSL/TLS → Edge Certificates → "Always Use HTTPS" **on**, "Minimum TLS Version" **1.2**.

## Step 9. Nginx and the HTTPS certificate

As your sudo user (not `deploy`):
```bash
cd /var/www/shop-portal
sudo cp deploy/nginx-proxy.conf /etc/nginx/shop-portal-proxy.conf
sudo bash deploy/cloudflare-real-ip.sh      # so the audit log and login throttle see the visitor's real address
```
First a tiny HTTP-only site, just to get the certificate:
```bash
sudo tee /etc/nginx/conf.d/admin.khaasfurniture.com.conf <<'EOF'
server {
    listen 80;
    server_name admin.khaasfurniture.com;
    location /.well-known/acme-challenge/ { root /var/www/certbot; }
    location / { return 404; }
}
EOF
sudo nginx -t && sudo systemctl reload nginx
sudo certbot certonly --webroot -w /var/www/certbot -d admin.khaasfurniture.com --deploy-hook "systemctl reload nginx"
```
(Certbot asks for your email and to accept the terms. The DNS record from step 8 must exist first.)

Now the real site file (HTTPS, security headers, login rate limit):
```bash
sudo cp deploy/nginx-admin.khaasfurniture.com.conf /etc/nginx/conf.d/admin.khaasfurniture.com.conf
sudo nginx -t && sudo systemctl reload nginx
sudo systemctl list-timers | grep certbot     # certificate renews by itself
```
Open **https://admin.khaasfurniture.com** and sign in. 

## Step 10. Security checklist (do all of these)

- [ ] `https://` works and `http://` redirects to it (Cloudflare "Always Use HTTPS" + Nginx).
- [ ] Cloudflare SSL mode = **Full (strict)**.
- [ ] MongoDB: `bindIp: 127.0.0.1` and `authorization: enabled` (step 4). Test from outside: port 27017 must NOT answer.
- [ ] Only ports 22, 80, 443 open (step 2). Port 3100 is never open.
- [ ] `.env` is `chmod 600` and is not on GitHub. GitHub repo set to **Private** (Settings → Danger zone → Change visibility).
- [ ] SSH: use keys only. `sudo nano /etc/ssh/sshd_config` → `PasswordAuthentication no`, `PermitRootLogin no`, then `sudo systemctl restart sshd`
      (open a second terminal to test login BEFORE closing the first one).
- [ ] Automatic security updates: `sudo dnf install -y dnf-automatic && sudo systemctl enable --now dnf-automatic-install.timer`
- [ ] Optional but strong: Cloudflare **Zero Trust → Access** (free for up to 50 people): protect `admin.khaasfurniture.com` so only your
      and your partner's email addresses can even see the login page. Then the app's own login is a second lock.
- [ ] Optional: Cloudflare → Security → WAF → add a rate-limit rule for `/api/auth/*`.
- [ ] Optional: let the server accept web traffic only from Cloudflare (stops people reaching your IP directly):
      allow Cloudflare's published IP ranges on 80/443 in the Oracle Security List instead of `0.0.0.0/0`
      (only if the main site also goes through Cloudflare).
- [ ] Rotate the R2 access keys now and then (Cloudflare → R2 → Manage API tokens), and update `.env` + `pm2 restart shop-portal`.
- [ ] Change the owner password if it was ever shared in chat or written down.

## Step 11. Backups

- **Database:** nightly dump, 14 days kept.
  ```bash
  sudo mkdir -p /var/backups/shop-portal && sudo chown deploy:deploy /var/backups/shop-portal
  sudo -iu deploy
  chmod +x /var/www/shop-portal/deploy/backup-mongo.sh
  crontab -e        # add this line:  30 2 * * * /var/www/shop-portal/deploy/backup-mongo.sh >> /var/backups/shop-portal/backup.log 2>&1
  ```
  Copy those files off the server now and then (for example `scp` to your PC). A backup on the same server does not protect you if the server is lost.
- **App backup button:** Settings → Backup downloads everything as one JSON file (no photos, no password hashes).
- **Photos:** they are in your R2 bucket, folder `shop-portal/`.

## Step 12. Updating the live site later

On your PC: change code, Commit, Push. On the server:
```bash
sudo -iu deploy
cd /var/www/shop-portal && bash deploy/deploy.sh
```
(pulls the code, installs, builds, restarts with PM2.)

## If something goes wrong

| Problem | Look here |
|---|---|
| 502 Bad Gateway | App not running: `pm2 status`, `pm2 logs shop-portal --lines 50`. SELinux: step 3 `setsebool` line. |
| 521/522 from Cloudflare | Port 443 not open in Oracle (step 2) or Nginx not running: `sudo systemctl status nginx`. |
| 525/526 | Certificate missing or Cloudflare on "Full (strict)" before step 9 finished. |
| Login keeps returning to the login page | `NEXTAUTH_URL` must be exactly `https://admin.khaasfurniture.com`, and `NEXTAUTH_SECRET` set; then `pm2 restart shop-portal --update-env`. |
| "Internal Server Error" / cannot connect to database | `MONGODB_URI` wrong or MongoDB down: `sudo systemctl status mongod`; test with the mongosh command from step 4. |
| Photos do not upload or show | R2 values in `.env`; `pm2 logs shop-portal` shows "R2 read failed" with the reason. |
| Build runs out of memory | Add swap (step 3), then run `npm run build` again. |
| Site slow after many days | `pm2 logs`; the app restarts itself if it passes 700 MB (`max_memory_restart`). |

Optional: copy your local test data to the server (only if you want it): on your PC
`mongodump --db shop_portal --archive=shop.gz --gzip`, copy with `scp shop.gz opc@144.24.124.186:/tmp/`, on the server
`mongorestore --uri="$MONGODB_URI" --archive=/tmp/shop.gz --gzip --nsFrom='shop_portal.*' --nsTo='shop_portal.*'`.
