// ===============================
//  Fichier: ecosystem.config.js
//  Configuration PM2 pour le clustering
// ===============================

module.exports = {
  apps: [{
    name: 'planmypost-backend',
    script: 'server.js',
    instances: 'max', // Utilise tous les cœurs CPU disponibles
    exec_mode: 'cluster',
    env: {
      NODE_ENV: 'production',
      PORT: 3000
    },
    env_development: {
      NODE_ENV: 'development',
      PORT: 3000
    },
    // Options de performance
    max_memory_restart: '1G',
    node_args: '--max-old-space-size=1024',
    
    // Logs
    log_file: './logs/combined.log',
    out_file: './logs/out.log',
    error_file: './logs/error.log',
    log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    
    // Auto-restart en cas de crash
    autorestart: true,
    watch: false, // Désactivé en production
    max_restarts: 10,
    min_uptime: '10s',
    
    // Variables d'environnement spécifiques
    env_vars: {
      UV_THREADPOOL_SIZE: 128 // Augmente le pool de threads pour les opérations I/O
    }
  }]
};