module.exports = {
  apps: [
    {
      name: 'global-payment-service',
      script: 'src/index.js',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '256M',
      env: {
        NODE_ENV: 'production',
      },
    },
  ],
};
