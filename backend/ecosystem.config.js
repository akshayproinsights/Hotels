/**
 * PM2 ecosystem config for Santosh Palace API
 *
 * Usage:
 *   pm2 start ecosystem.config.js   # first start
 *   pm2 restart santosh-palace-api  # after deploy
 *   pm2 save                        # persist across reboots
 *   pm2 startup                     # generate systemd unit
 */
module.exports = {
  apps: [
    {
      name:        'santosh-palace-api',
      script:      'uvicorn',
      args:        'app.main:app --host 127.0.0.1 --port 8001 --workers 2',
      interpreter: '/var/www/santosh-palace/backend/venv/bin/python',
      cwd:         '/var/www/santosh-palace/backend',
      env_file:    '/var/www/santosh-palace/backend/.env',
      autorestart: true,
      watch:       false,
      max_memory_restart: '300M',
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      error_file:  '/var/log/santosh-palace/api-error.log',
      out_file:    '/var/log/santosh-palace/api-out.log',
    },
  ],
}
