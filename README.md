# Pharmacy Management System

A comprehensive full-stack Web Application designed to streamline pharmacy operations, inventory management, user/role management, supplier orders, sales orders, stock tracking, and real-time notifications.

---

## 🛠 Tech Stack & Frameworks

### **Backend**
- **Framework:** .NET 9 Web API (`ASP.NET Core`)
- **Database ORM:** Entity Framework Core 9 (`SQL Server`) with Lazy Loading Proxies
- **Authentication & Security:** ASP.NET Core Identity & JWT Bearer Authentication
- **Data Validation & Mapping:** FluentValidation & AutoMapper
- **Real-Time Communication:** SignalR Hubs for real-time notifications
- **API Documentation:** Swagger / OpenAPI (`Swashbuckle`)

### **Frontend**
- **Framework:** React 19 with TypeScript
- **UI Library & Components:** Material-UI (MUI v7), Emotion, Lucide React & React Icons
- **Styling:** Tailwind CSS & PostCSS
- **State & HTTP Handling:** Axios for REST API requests & SignalR client for web-socket updates
- **Routing:** React Router v7
- **Notifications:** React Hot Toast

---

## ✨ Core Features

- **Authentication & Authorization:** Secure user authentication with JWT, role-based access control (Admin, Pharmacist, Staff).
- **Medicine & Category Management:** Complete catalog tracking including dosages, categories, unit pricing, and prescription requirements.
- **Inventory & Stock Management:** Monitor live stock levels, batch expirations, and receive low-stock alerts.
- **Supplier & Purchase Management:** Manage supplier profiles, issue supply orders, track shipments, and update inventory upon receipt.
- **Sales & Orders Processing:** Process customer order transactions efficiently with automatic inventory updates.
- **Real-time Notifications:** SignalR-powered instant alerts for critical stock thresholds and order status updates.
- **Admin Dashboard:** Centralized dashboard for managing users, tracking metrics, and overseeing overall pharmacy operations.

---

## 📁 Project Architecture

```text
├── Backend/                # .NET 9 Web API Solution
│   ├── Configurations/     # Entity configurations & DB mapping
│   ├── Controllers/        # RESTful API endpoints
│   ├── Data/               # DB Context & Migrations
│   ├── Dtos/               # Data Transfer Objects
│   ├── Extensions/         # Dependency Injection & Extensions
│   ├── Hubs/               # SignalR WebSockets Hubs
│   ├── Models/             # Domain Models & Entities
│   ├── Services/           # Core Business Logic & Services
│   └── Validators/         # FluentValidation rules
├── Backend.Tests/          # Unit & Integration Tests
└── frontend/               # React TypeScript SPA
    ├── src/
    │   ├── Components/     # Reusable UI components
    │   ├── Pages/          # Application views/pages
    │   ├── Services/       # API integration services
    │   └── types/          # TypeScript interfaces & types
```

---

## 🚀 Getting Started

### **Prerequisites**
- [.NET 9 SDK](https://dotnet.microsoft.com/download/dotnet/9.0)
- [Node.js](https://nodejs.org/) (v18+ recommended) & npm
- [SQL Server](https://www.microsoft.com/sql-server/)

---

### **1. Backend Setup**

1. Navigate to the `Backend` directory:
   ```bash
   cd Backend
   ```

2. Configure Database connection in `appsettings.json`:
   ```json
   "ConnectionStrings": {
     "DefaultConnection": "Server=YOUR_SERVER;Database=PharmacyDb;Trusted_Connection=True;TrustServerCertificate=True;"
   }
   ```

3. Apply database migrations:
   ```bash
   dotnet ef database update
   ```

4. Run the API server:
   ```bash
   dotnet run
   ```
   The backend API will run and provide Swagger UI at `http://localhost:5000/swagger` (or configured HTTPS port).

---

### **2. Frontend Setup**

1. Navigate to the `frontend` directory:
   ```bash
   cd frontend
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Create a `.env` file in the `frontend` root (if not present):
   ```env
   REACT_APP_API_URL=http://localhost:5000/api
   ```

4. Start the React development server:
   ```bash
   npm start
   ```
   The web app will open at `http://localhost:3000`.

---

## 📝 License
This project is open-source and available under the [MIT License](LICENSE).
