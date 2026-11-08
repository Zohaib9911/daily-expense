// PM2 process file for the Shop Portal. Start with:  pm2 start ecosystem.config.cjs
//  - ONE process on purpose (fork mode, not cluster): the login throttle lives in memory and must be shared.
//  - Listens on 127.0.0.1:3100 only; Nginx is the only thing that talks to it (the world never reaches port 3100).
//  - Settings (MONGODB_URI, NEXTAUTH_*, R2_*) are read from the .env file in this folder by Next.js.
module.exports = {
  apps: [
    {
      name: "shop-portal",
      cwd: __dirname,
      script: "node_modules/next/dist/bin/next",
      args: "start -p 3100 -H 127.0.0.1",
      exec_mode: "fork",
      instances: 1,
      env: { NODE_ENV: "production" },
      autorestart: true,
      max_memory_restart: "700M", // restart (instead of freezing the server) if memory ever balloons
      min_uptime: "20s",
      max_restarts: 10,
      restart_delay: 3000,
      time: true, // timestamps in the logs
    },
  ],
};
