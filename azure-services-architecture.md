# Calgary Permit Bot - Azure Services Architecture

This diagram shows the high-level Azure services architecture and how different Azure components interact with each other in the Calgary Permit Bot solution.

## Azure Services Interaction Diagram

```mermaid
graph TB
    %% External Access
    Internet[🌐 Internet]
    Users[👥 End Users]
    
    %% Azure Front Door / CDN (Optional)
    subgraph "Edge & Load Balancing"
        CDN[📡 Azure CDN<br/>Static Content Delivery]
        FrontDoor[🚪 Azure Front Door<br/>Global Load Balancer]
    end
    
    %% Compute Layer
    subgraph "Compute Services"
        AppService[🖥️ Azure App Service<br/>Web App Hosting<br/>SKU: B1]
        ContainerApps[📦 Azure Container Apps<br/>Alternative Deployment<br/>Consumption Plan]
    end
    
    %% AI & Cognitive Services
    subgraph "Azure AI Platform"
        OpenAI[🧠 Azure OpenAI<br/>GPT Models & Embeddings<br/>SKU: S0]
        CogServices[🔍 Cognitive Services<br/>Computer Vision<br/>Document Intelligence<br/>Speech Services]
        AISearch[🔎 Azure AI Search<br/>Vector & Hybrid Search<br/>SKU: Basic]
    end
    
    %% Storage Layer
    subgraph "Data Storage"
        BlobStorage[💾 Azure Blob Storage<br/>Document Repository<br/>Standard_LRS]
        CosmosDB[🗄️ Azure Cosmos DB<br/>Chat History & Sessions<br/>Serverless]
        KeyVault[🔐 Azure Key Vault<br/>Secrets & Certificates]
    end
    
    %% Monitoring & Management
    subgraph "Observability"
        AppInsights[📊 Application Insights<br/>Telemetry & Monitoring]
        LogAnalytics[📈 Log Analytics<br/>Centralized Logging]
        Monitor[👁️ Azure Monitor<br/>Alerts & Dashboards]
    end
    
    %% Identity & Security
    subgraph "Identity & Access"
        AAD[🔑 Azure Active Directory<br/>Authentication & Authorization]
        RBAC[🛡️ Role-Based Access Control<br/>Resource Permissions]
    end
    
    %% Networking
    subgraph "Networking (Optional)"
        VNet[🌐 Virtual Network<br/>Private Networking]
        PrivateEndpoint[🔒 Private Endpoints<br/>Secure Connections]
    end
    
    %% Connection Flows
    Internet --> Users
    Users --> CDN
    Users --> FrontDoor
    CDN --> AppService
    FrontDoor --> AppService
    Users -.-> ContainerApps
    
    %% App Service Connections
    AppService --> OpenAI
    AppService --> CogServices
    AppService --> AISearch
    AppService --> BlobStorage
    AppService --> CosmosDB
    AppService --> KeyVault
    AppService --> AAD
    
    %% Container Apps Connections (Alternative)
    ContainerApps -.-> OpenAI
    ContainerApps -.-> CogServices
    ContainerApps -.-> AISearch
    ContainerApps -.-> BlobStorage
    ContainerApps -.-> CosmosDB
    
    %% AI Service Interactions
    OpenAI --> AISearch
    AISearch --> BlobStorage
    CogServices --> BlobStorage
    
    %% Data Flow
    BlobStorage --> AISearch
    CosmosDB --> AppInsights
    
    %% Security Flows
    AAD --> AppService
    AAD --> KeyVault
    KeyVault --> OpenAI
    KeyVault --> CogServices
    KeyVault --> BlobStorage
    KeyVault --> CosmosDB
    RBAC --> BlobStorage
    RBAC --> CosmosDB
    RBAC --> OpenAI
    
    %% Monitoring Flows
    AppService --> AppInsights
    OpenAI --> AppInsights
    CogServices --> AppInsights
    AISearch --> AppInsights
    BlobStorage --> AppInsights
    CosmosDB --> AppInsights
    AppInsights --> LogAnalytics
    LogAnalytics --> Monitor
    
    %% Network Security (Optional)
    VNet -.-> AppService
    VNet -.-> PrivateEndpoint
    PrivateEndpoint -.-> BlobStorage
    PrivateEndpoint -.-> CosmosDB
    PrivateEndpoint -.-> OpenAI
    
    %% Styling
    classDef compute fill:#e3f2fd,stroke:#1976d2,stroke-width:2px
    classDef ai fill:#fff3e0,stroke:#f57c00,stroke-width:2px
    classDef storage fill:#fce4ec,stroke:#c2185b,stroke-width:2px
    classDef monitoring fill:#e8f5e8,stroke:#388e3c,stroke-width:2px
    classDef security fill:#f3e5f5,stroke:#7b1fa2,stroke-width:2px
    classDef network fill:#e0f2f1,stroke:#00796b,stroke-width:2px
    classDef edge fill:#fff8e1,stroke:#fbc02d,stroke-width:2px
    classDef external fill:#efebe9,stroke:#5d4037,stroke-width:2px
    
    class AppService,ContainerApps compute
    class OpenAI,CogServices,AISearch ai
    class BlobStorage,CosmosDB,KeyVault storage
    class AppInsights,LogAnalytics,Monitor monitoring
    class AAD,RBAC security
    class VNet,PrivateEndpoint network
    class CDN,FrontDoor edge
    class Internet,Users external
```

## Service Communication Patterns

```mermaid
sequenceDiagram
    participant User as 👤 User
    participant App as 🖥️ App Service
    participant AAD as 🔑 Azure AD
    participant KV as 🔐 Key Vault
    participant AI as 🧠 OpenAI
    participant Search as 🔎 AI Search
    participant Blob as 💾 Blob Storage
    participant Cosmos as 🗄️ Cosmos DB
    participant Insights as 📊 App Insights
    
    User->>App: Request with Authentication
    App->>AAD: Validate Token
    AAD-->>App: Token Valid
    
    App->>KV: Get API Keys
    KV-->>App: Return Secrets
    
    App->>Blob: Upload/Retrieve Documents
    Blob-->>App: Document Data
    
    App->>AI: Process with GPT/Embeddings
    AI-->>App: AI Response
    
    App->>Search: Vector Search Query
    Search->>Blob: Retrieve Indexed Content
    Blob-->>Search: Document Content
    Search-->>App: Search Results
    
    App->>Cosmos: Store Chat History
    Cosmos-->>App: Confirmation
    
    App->>Insights: Send Telemetry
    App-->>User: Response
```

## Azure Resource Dependencies

```mermaid
graph LR
    subgraph "Resource Group"
        RG[📁 Calgary-Permit-Bot-RG]
    end
    
    subgraph "Core Dependencies"
        RG --> ASP[App Service Plan]
        ASP --> AS[App Service]
        RG --> ST[Storage Account]
        ST --> BC[Blob Container]
        RG --> AI[OpenAI Service]
        RG --> CS[Cognitive Services]
        RG --> SR[Search Service]
        RG --> KV[Key Vault]
    end
    
    subgraph "Optional Components"
        RG -.-> CD[Cosmos DB]
        RG -.-> SP[Speech Service]
        RG -.-> CV[Computer Vision]
        RG -.-> DI[Document Intelligence]
    end
    
    subgraph "Monitoring Stack"
        RG --> LA[Log Analytics]
        LA --> AI2[App Insights]
        AI2 --> AM[Azure Monitor]
    end
    
    subgraph "Security & Identity"
        RG --> AAD[Azure AD]
        AAD --> RBAC[RBAC Assignments]
        RBAC --> AS
        RBAC --> KV
        RBAC --> ST
        RBAC --> AI
    end
    
    %% Dependencies
    AS --> AI
    AS --> CS
    AS --> SR
    AS --> ST
    AS --> KV
    AS --> CD
    SR --> ST
    AI --> KV
    CS --> KV
    
    classDef core fill:#e3f2fd,stroke:#1976d2,stroke-width:2px
    classDef optional fill:#fff3e0,stroke:#f57c00,stroke-width:1px,stroke-dasharray: 5 5
    classDef monitoring fill:#e8f5e8,stroke:#388e3c,stroke-width:2px
    classDef security fill:#f3e5f5,stroke:#7b1fa2,stroke-width:2px
    
    class ASP,AS,ST,BC,AI,CS,SR,KV core
    class CD,SP,CV,DI optional
    class LA,AI2,AM monitoring
    class AAD,RBAC security
```

## Data Flow Patterns

### 1. **Document Processing Flow**
```
User Upload → Blob Storage → AI Search Indexing → Vector Embeddings → Search Index
                ↓
            Document Intelligence → Extracted Text → OpenAI Processing
```

### 2. **Chat Interaction Flow**
```
User Query → App Service → OpenAI (Chat) → AI Search (RAG) → Response
               ↓
        Cosmos DB (History Storage) → Application Insights (Telemetry)
```

### 3. **Authentication Flow**
```
User → Azure AD → JWT Token → App Service → Key Vault (API Keys) → AI Services
```

## Key Integration Points

### **🔗 Service Mesh Connectivity**
- **App Service** ↔ **All AI Services** (Primary compute layer)
- **AI Search** ↔ **Blob Storage** (Document indexing)
- **OpenAI** ↔ **AI Search** (RAG implementation)
- **Key Vault** ↔ **All Services** (Secret management)

### **📊 Monitoring Integration**
- **Application Insights** collects telemetry from all services
- **Log Analytics** centralizes all logs and metrics
- **Azure Monitor** provides alerting and dashboards

### **🔐 Security Integration**
- **Azure AD** provides identity for users and service principals
- **RBAC** controls access to all Azure resources
- **Key Vault** stores all secrets, keys, and certificates
- **Private Endpoints** (optional) for network isolation

### **💰 Cost Optimization**
- **App Service B1**: Cost-effective for moderate workloads
- **AI Search Basic**: Sufficient for most scenarios
- **Cosmos DB Serverless**: Pay-per-use for chat history
- **Storage Standard_LRS**: Cost-effective for document storage

---

*This architecture diagram shows the complete Azure services ecosystem for the Calgary Permit Bot, highlighting service interactions, dependencies, and data flow patterns.*