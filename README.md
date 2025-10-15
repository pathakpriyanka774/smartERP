# SmartERP - Complete ERP Management System

A comprehensive Enterprise Resource Planning (ERP) system built with React.js frontend and Node.js microservices backend, designed specifically for garment manufacturing businesses.

## 🚀 Features

### Core Modules
- **👥 Employee & Payroll Management** - Complete employee onboarding and payroll processing
- **🏭 Production Planning** - Machine allocation, task management, and production tracking
- **🔍 Quality Management** - Quality inspection workflows and defect tracking
- **💰 Style Costing** - Material costing and style-wise cost analysis
- **📊 Executive Dashboard** - Real-time KPIs and business insights
- **📦 Orders & Inventory** - Order processing and inventory management
- **👤 User Management** - Role-based access control and permissions

### Advanced Features
- **🎯 Planning Manager Dashboard** - Production oversight and resource allocation
- **👷 Production Worker Dashboard** - Daily task management and progress tracking
- **🔍 Quality Team Dashboard** - Inspection workflows and quality metrics
- **⚙️ Application Settings** - Form builder, page builder, and system configuration

## 🏗️ Architecture

```
Frontend (React.js)
    ↓ HTTP/REST APIs
Backend Microservices (Node.js)
    ↓ SQL Server Integration
Microsoft SQL Server Database
```

### Microservices
- **Gateway Service** (Port 5000) - API routing and load balancing
- **Auth Service** (Port 5001) - Authentication and authorization
- **Payroll Service** (Port 5008) - Employee and payroll management
- **Production Planning Service** (Port 5009) - Production workflows
- **Costing Service** (Port 5010) - Style costing and material management
- **Order Service** (Port 5002) - Order processing
- **Inventory Service** (Port 5003) - Inventory management
- **Finance Service** (Port 5005) - Financial operations
- **Report Service** (Port 5007) - Report generation

## 🛠️ Technology Stack

### Frontend
- **React.js 19.1.1** - Modern UI framework
- **React Router DOM** - Client-side routing
- **Axios** - HTTP client for API calls
- **CSS3** - Custom styling with responsive design

### Backend
- **Node.js** - Runtime environment
- **Express.js** - Web framework
- **Microsoft SQL Server** - Primary database
- **JWT** - Authentication tokens
- **bcryptjs** - Password hashing
- **CORS** - Cross-origin resource sharing

## 📋 Prerequisites

- **Node.js** (v16 or higher)
- **Microsoft SQL Server** (2019 or higher)
- **SQL Server Management Studio (SSMS)**
- **Git** for version control

## 🚀 Quick Start

### 1. Clone the Repository
```bash
git clone https://github.com/yourusername/smarterp.git
cd smarterp
```

### 2. Database Setup
```sql
-- In SQL Server Management Studio (SSMS):
-- 1. Create database: CREATE DATABASE SmartERP;
-- 2. Run: complete-setup-database.sql
-- 3. Run: production-planning-schema.sql
-- 4. Run: style-costing-schema.sql
```

### 3. Backend Setup
```bash
cd smarterpbackend
npm install

# Configure environment variables
# Update .env file with your SQL Server credentials:
DB_SERVER=localhost
DB_DATABASE=SmartERP
DB_USER=sa
DB_PASSWORD=YourPassword

# Start all services
npm run start:all
```

### 4. Frontend Setup
```bash
cd smarterpfrontend
npm install
npm start
```

### 5. Access the Application
- **Frontend**: http://localhost:3000
- **Backend Services**: http://localhost:5000-5010

## 📊 Database Schema

### Core Tables
- **Users** - System users and authentication
- **Employees** - Employee master data
- **Payrolls** - Salary processing records
- **Styles** - Garment style definitions
- **Materials** - Raw material master
- **StyleCostings** - Style-wise material costing
- **Machines** - Production machine master
- **ProductionOrders** - Manufacturing orders
- **ProductionTasks** - Daily production tasks
- **QualityInspections** - Quality control records

### Key Views
- **vw_ProductionOverview** - Production progress tracking
- **vw_MachineStatus** - Real-time machine availability
- **vw_StyleCostBreakdown** - Detailed cost analysis
- **vw_QualityInspectionSummary** - Quality metrics

## 🎯 User Roles & Access

### Planning Manager
- Production planning and scheduling
- Machine and resource allocation
- Order progress monitoring
- Quality oversight

### Production Workers
- Daily task management
- Production recording
- Progress tracking
- Safety guidelines

### Quality Team
- Quality inspection workflows
- Defect categorization
- Approval/rejection processes
- Quality metrics reporting

### Admin Users
- System configuration
- User management
- Role and permission management
- Application settings

## 🔧 Development

### Project Structure
```
smarterp/
├── smarterpfrontend/          # React.js frontend
│   ├── src/
│   │   ├── components/        # UI components
│   │   ├── services/          # API services
│   │   └── utils/            # Utility functions
│   └── public/               # Static assets
├── smarterpbackend/          # Node.js backend
│   ├── services/             # Microservices
│   ├── shared/               # Shared utilities
│   └── gateway/              # API gateway
├── database/                 # SQL scripts
└── docs/                     # Documentation
```

### Available Scripts

#### Backend
```bash
npm run start:gateway         # Start API gateway
npm run start:auth           # Start auth service
npm run start:payroll        # Start payroll service
npm run start:production-planning  # Start production service
npm run start:costing        # Start costing service
npm run start:all            # Start all services
```

#### Frontend
```bash
npm start                    # Development server
npm run build               # Production build
npm test                    # Run tests
```

## 🔒 Security Features

- **JWT Authentication** - Secure token-based authentication
- **Role-based Access Control** - Granular permissions
- **SQL Injection Prevention** - Parameterized queries
- **CORS Protection** - Cross-origin request security
- **Password Hashing** - bcrypt encryption
- **Environment Variables** - Secure configuration management

## 📈 Performance Features

- **Microservices Architecture** - Scalable and maintainable
- **Database Indexing** - Optimized query performance
- **Computed Columns** - Real-time calculations
- **Stored Procedures** - Efficient database operations
- **Connection Pooling** - Database connection optimization

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

## 📝 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 👥 Team

- **Project Lead** - System architecture and development
- **Frontend Team** - React.js UI development
- **Backend Team** - Node.js microservices
- **Database Team** - SQL Server design and optimization
- **QA Team** - Testing and quality assurance

## 📞 Support

For support and questions:
- Create an issue in the GitHub repository
- Contact the development team
- Check the documentation in the `/docs` folder

## 🎉 Acknowledgments

- Built with modern web technologies
- Designed for garment manufacturing industry
- Scalable microservices architecture
- Comprehensive business process coverage

---

**SmartERP** - Empowering businesses with intelligent resource planning.