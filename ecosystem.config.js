module.exports = {
  apps: [
    {
      name: 'voice-bridge-bff',
      script: 'backend/server.js',
      max_restarts: 10,
      restart_delay: 3000,
      max_memory_restart: '2G',
      merge_logs: true,
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      error_file: './logs/bff-error.log',
      out_file: './logs/bff-out.log',
      env: {
        WHISPER_MODEL: 'medium',
        WHISPER_WORKERS: 2,
      },
    },
  ],
};
