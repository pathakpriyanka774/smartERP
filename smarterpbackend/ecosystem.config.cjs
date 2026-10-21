
module.exports = {
  apps: [
    {
      name: "gateway",
      script: "gateway/server.js",
      env: {
        NODE_ENV: "production"
      }
    },
    {
      name: "auth",
      script: "services/auth-service/server.js"
    },
    {
      name: "orders",
      script: "services/order-service/server.js"
    },
    {
      name: "inventory",
      script: "services/inventory-service/server.js"
    },
    {
      name: "finance",
      script: "services/finance-service/server.js"
    },
    {
      name: "clients",
      script: "services/client-service/server.js"
    },
    {
      name: "reports",
      script: "services/report-service/server.js"
    },
    {
      name: "payroll",
      script: "services/payroll-service/server.js"
    },
    {
      name: "production-planning",
      script: "services/production-planning-service/server.js"
    },
    {
      name: "costing",
      script: "services/costing-service/server.js"
    },
    {
      name: "attendance",
      script: "services/attendance-service/server.js"
    },
    {
      name: "builder",
      script: "services/page-builder-service/server.js"
    },
    {
      name: "accounting",
      script: "services/accounting-service/server.js"
    },
    {
      name: "purchases",
      script: "services/purchase-service/server.js"
    }
  ].map(app => ({
    ...app,
    cwd: __dirname,
    instances: 1,
    exec_mode: "fork",
    autorestart: true,
    watch: false,
    max_memory_restart: "150M",
    min_uptime: "10s",
    max_restarts: 5
  }))
};

