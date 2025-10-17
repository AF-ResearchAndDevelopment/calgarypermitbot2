# Calgary Permit Bot - Simplified Azure Architecture

This diagram shows the high-level Azure services architecture with key components and their primary interactions.

## High-Level Azure Services Architecture

```mermaid
graph TB
    %% User Layer
    Users[👥 Users]
    
    %% Compute Layer
    subgraph "Compute"
        App[🖥️ Azure App Service<br/>Web Application]
    end
    
    %% AI Services
    subgraph "AI & Cognitive Services"
        OpenAI[🧠 Azure OpenAI<br/>Chat & Embeddings]
        CogServices[🔍 Cognitive Services<br/>Vision & Documents]
        Search[🔎 Azure AI Search<br/>Knowledge Base]
    end
    
    %% Storage
    subgraph "Storage & Data"
        Blob[💾 Blob Storage<br/>Documents & Files]
        Cosmos[🗄️ Cosmos DB<br/>Chat History]
    end
    
    %% Security & Monitoring
    subgraph "Management"
        KeyVault[🔐 Key Vault<br/>Secrets]
        Insights[📊 App Insights<br/>Monitoring]
        AAD[🔑 Azure AD<br/>Authentication]
    end
    
    %% Main Flow
    Users --> App
    App --> OpenAI
    App --> CogServices
    App --> Search
    App --> Blob
    App --> Cosmos
    
    %% AI Interactions
    Search --> Blob
    
    %% Security & Management
    App --> KeyVault
    App --> AAD
    App --> Insights
    
    %% Styling
    classDef compute fill:#e3f2fd,stroke:#1976d2,stroke-width:3px
    classDef ai fill:#fff3e0,stroke:#f57c00,stroke-width:2px
    classDef storage fill:#fce4ec,stroke:#c2185b,stroke-width:2px
    classDef management fill:#e8f5e8,stroke:#388e3c,stroke-width:2px
    classDef user fill:#f3e5f5,stroke:#7b1fa2,stroke-width:2px
    
    class App compute
    class OpenAI,CogServices,Search ai
    class Blob,Cosmos storage
    class KeyVault,Insights,AAD management
    class Users user
```

## Simplified Data Flow

```mermaid
flowchart LR
    A[📱 User Request] --> B[🖥️ App Service]
    B --> C[🧠 AI Processing]
    C --> D[💾 Data Storage]
    D --> E[📊 Response]
    E --> F[😊 User]
    
    classDef flow fill:#e1f5fe,stroke:#0277bd,stroke-width:2px
    class A,B,C,D,E,F flow
```

## Key Components

### **Core Services**
- **Azure App Service**: Hosts the web application
- **Azure OpenAI**: Provides AI chat and text processing
- **Azure AI Search**: Manages knowledge base and search
- **Blob Storage**: Stores documents and files

### **Supporting Services**
- **Cognitive Services**: Handles document and image analysis
- **Cosmos DB**: Stores chat history and user sessions
- **Key Vault**: Manages secrets and API keys
- **Application Insights**: Monitors performance and usage
- **Azure AD**: Handles user authentication

## Architecture Benefits

✅ **Scalable**: Auto-scaling compute and storage  
✅ **Secure**: Enterprise-grade security with Azure AD  
✅ **Intelligent**: AI-powered document processing and chat  
✅ **Monitored**: Complete observability and analytics  
✅ **Cost-Effective**: Pay-as-you-use pricing model  

---

*This simplified architecture focuses on the essential Azure services and their primary relationships for the Calgary Permit Bot solution.*