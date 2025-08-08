module.exports = {
  apps: [{
    name: 'publication-organizer',
    script: 'server.js',
    instances: 'max', // Utilise tous les cœurs CPU disponibles
    exec_mode: 'cluster',
    env: {
      NODE_ENV: 'development',
      PORT: 3000
    },
    env_production: {
      NODE_ENV: 'production',
      PORT: process.env.PORT || 3000
    },
    // Options de performance
    max_memory_restart: '1G',
    node_args: '--max-old-space-size=1024',
    // Logs
    log_file: './logs/combined.log',
    out_file: './logs/out.log',
    error_file: './logs/error.log',
    log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    // Auto-restart
    watch: false,
    ignore_watch: ['node_modules', 'uploads', 'temp_uploads', 'logs'],
    // Graceful shutdown
    kill_timeout: 5000,
    wait_ready: true,
    listen_timeout: 10000
  }]
};