// PM2 Ecosystem Configuration for Multi-Project Orchestrator
// 
// This file defines multiple orchestrator instances, one per project.
// Each instance monitors a different GitHub repository.
//
// Usage:
//   1. Copy this file to your orchestrator-configs directory
//   2. Update paths and project names
//   3. Create .env file for each project in its config directory
//   4. Run: pm2 start ecosystem.config.js
//
// Learn more: https://pm2.keymetrics.io/docs/usage/application-declaration/

module.exports = {
  apps: [
    {
      // First project - Website
      name: 'orchestrator-website',
      script: '/path/to/opencode-orchestrator/dist/index.js',
      cwd: '/home/user/orchestrator-configs/website',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '1G',
      env: {
        NODE_ENV: 'production'
      },
      error_file: './logs/err.log',
      out_file: './logs/out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      time: true
    },

    {
      // Second project - Mobile App
      name: 'orchestrator-mobile-app',
      script: '/path/to/opencode-orchestrator/dist/index.js',
      cwd: '/home/user/orchestrator-configs/mobile-app',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '1.5G',  // More memory for mobile builds
      env: {
        NODE_ENV: 'production'
      },
      error_file: './logs/err.log',
      out_file: './logs/out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      time: true
    },

    {
      // Third project - Backend API
      name: 'orchestrator-backend-api',
      script: '/path/to/opencode-orchestrator/dist/index.js',
      cwd: '/home/user/orchestrator-configs/backend-api',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '1G',
      env: {
        NODE_ENV: 'production'
      },
      error_file: './logs/err.log',
      out_file: './logs/out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      time: true
    }

    // Add more projects by copying the structure above
    // Remember to:
    //   1. Use a unique name
    //   2. Point cwd to the project's config directory
    //   3. Create corresponding .env file in that directory
  ]
};

// ============================================
// PM2 Commands Cheat Sheet
// ============================================
//
// Start all:       pm2 start ecosystem.config.js
// Status:          pm2 status
// Logs (all):      pm2 logs
// Logs (one):      pm2 logs orchestrator-website
// Stop all:        pm2 stop all
// Stop one:        pm2 stop orchestrator-website
// Restart all:     pm2 restart all
// Restart one:     pm2 restart orchestrator-website
// Monitor:         pm2 monit
// Delete all:      pm2 delete all
// Save config:     pm2 save
// Startup script:  pm2 startup
//
// View detailed info:
//   pm2 show orchestrator-website
//
// Flush logs:
//   pm2 flush
//
// Reload (zero downtime):
//   pm2 reload orchestrator-website
