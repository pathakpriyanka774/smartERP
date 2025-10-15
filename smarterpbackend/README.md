# ERP Microservices Backend

## Architecture Overview
- **API Gateway**: Routes requests to appropriate services (Port 8000)
- **Auth Service**: Authentication & authorization (Port 5001)
- **Order Service**: Order management (Port 5002)
- **Inventory Service**: Stock management (Port 5003)
- **Production Service**: Manufacturing workflows (Port 5004)
- **Finance Service**: Financial operations (Port 5005)
- **Client Service**: Customer/vendor management (Port 5006)
- **Report Service**: Analytics & reporting (Port 5007)

## Quick Start
```bash
# Start all services
npm run start:all

# Start individual service
cd services/auth-service && npm start
```

## API Endpoints
- Gateway: http://localhost:8000
- Auth: http://localhost:5001
- Orders: http://localhost:5002
- Inventory: http://localhost:5003
- Production: http://localhost:5004
- Finance: http://localhost:5005
- Clients: http://localhost:5006
- Reports: http://localhost:5007