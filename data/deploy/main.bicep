// main.bicep — Deploys the daily job-scheduler Function App and its failure alert.
//
// Deploys against the already-provisioned nrw-batch-poc resource group. The
// Batch account, pool, Key Vault and storage account are referenced as existing
// resources and are never recreated here.
//
// Resources created:
//   - Consumption (Linux) App Service Plan for the Function App.
//   - Python Function App bound to the pre-existing nrw-batch-scheduler
//     user-assigned managed identity. RBAC for that identity (Key Vault Secrets
//     User + Azure Batch Job Submitter) is granted once during setup, so this
//     template creates no role assignments and the deploying principal does not
//     need RBAC-write rights.
//   - Action group + TaskFailEvent metric alert on the Batch account.
//   - Workspace-based Application Insights connected to the Function App and to
//     the shared nrw-app-law Log Analytics workspace, so pipeline telemetry
//     lands alongside the backend's logs (invocation history, traces, KQL via
//     the Logs blade).
//
// Batch diagnostic settings remain deferred until the aggregate log strategy
// (ADX) is decided post-prototype (see data/deploy/readme-implementation.md).

@description('Location for all resources.')
param location string = resourceGroup().location

@description('Globally unique name of the scheduler Function App.')
param functionAppName string = 'nrw-batch-scheduler'

@description('Existing Key Vault holding the pipeline secrets.')
param keyVaultName string = 'nrw-batch-poc'

@description('Existing user-assigned managed identity the Function App runs as (dedicated, unrestricted; not the Batch pool identity, which is restricted to Batch providers).')
param managedIdentityName string = 'nrw-batch-scheduler'

@description('Existing Batch account that runs the pipeline jobs.')
param batchAccountName string = 'nrwbatchpoc'

@description('Data-plane endpoint of the Batch account.')
param batchAccountUrl string = 'https://nrwbatchpoc.westeurope.batch.azure.com'

@description('Batch pool that tasks are scheduled on.')
param batchPoolId string = 'nrwbatchpoc'

@description('Existing storage account reused for Function App runtime storage.')
param storageAccountName string = 'nrwbatchpoc'

@description('Python runtime version for the Function App.')
param pythonVersion string = '3.11'

@description('IBF environment name passed to Batch tasks.')
param ibfEnvironment string = 'test'

@description('NRW backend API base URL (no trailing /api).')
param ibfApiUrl string

@description('Seed data base URL used by the pipeline configs.')
param githubDataBaseUrl string = 'https://raw.githubusercontent.com/rodekruis/IBF-seed-data/refs/heads/main'

@description('ECMWF GloFAS FTP host.')
param glofasFtpHost string = 'aux.ecmwf.int'

@description('Blob mount path used as the pipeline data cache on Batch nodes.')
param dataCacheDir string = '/mnt/batch/tasks/fsmounts/nrw-data-cache'

@description('Email address that receives TaskFailEvent alerts.')
param alertEmail string = 'ehill@redcross.nl'

@description('Existing shared Log Analytics workspace that also backs the NRW backend Application Insights.')
param logAnalyticsWorkspaceName string = 'nrw-app-law'

@description('Resource group holding the shared Log Analytics workspace.')
param logAnalyticsResourceGroup string = 'NRW'

resource storageAccount 'Microsoft.Storage/storageAccounts@2023-01-01' existing = {
  name: storageAccountName
}

resource batchAccount 'Microsoft.Batch/batchAccounts@2024-07-01' existing = {
  name: batchAccountName
}

resource managedIdentity 'Microsoft.ManagedIdentity/userAssignedIdentities@2023-01-31' existing = {
  name: managedIdentityName
}

var storageConnectionString = 'DefaultEndpointsProtocol=https;AccountName=${storageAccount.name};AccountKey=${storageAccount.listKeys().keys[0].value};EndpointSuffix=${environment().suffixes.storage}'

// Key Vault reference expressions resolved by the Function host at runtime.
var apiKeyReference = '@Microsoft.KeyVault(VaultName=${keyVaultName};SecretName=ibf-pipeline-api-key)'
var glofasUserReference = '@Microsoft.KeyVault(VaultName=${keyVaultName};SecretName=glofas-ftp-user)'
var glofasPasswordReference = '@Microsoft.KeyVault(VaultName=${keyVaultName};SecretName=glofas-ftp-password)'

// Shared workspace already provisioned for the backend; pipeline telemetry is
// joined here rather than in a dedicated workspace. Retention is governed by
// this workspace and revisited post-POC (see data/deploy/readme-implementation.md).
resource logAnalyticsWorkspace 'Microsoft.OperationalInsights/workspaces@2023-09-01' existing = {
  name: logAnalyticsWorkspaceName
  scope: resourceGroup(logAnalyticsResourceGroup)
}

// Classic (workspace-less) Application Insights is retired, so the component
// must be workspace-based. It points at the shared nrw-app-law workspace so its
// traces/exceptions land alongside the backend's logs.
resource applicationInsights 'Microsoft.Insights/components@2020-02-02' = {
  name: functionAppName
  location: location
  kind: 'web'
  properties: {
    Application_Type: 'web'
    WorkspaceResourceId: logAnalyticsWorkspace.id
  }
}

resource hostingPlan 'Microsoft.Web/serverfarms@2023-12-01' = {
  name: '${functionAppName}-plan'
  location: location
  sku: {
    name: 'Y1'
    tier: 'Dynamic'
  }
  kind: 'functionapp'
  properties: {
    reserved: true
  }
}

resource functionApp 'Microsoft.Web/sites@2023-12-01' = {
  name: functionAppName
  location: location
  kind: 'functionapp,linux'
  identity: {
    type: 'UserAssigned'
    userAssignedIdentities: {
      '${managedIdentity.id}': {}
    }
  }
  properties: {
    serverFarmId: hostingPlan.id
    reserved: true
    httpsOnly: true
    keyVaultReferenceIdentity: managedIdentity.id
    siteConfig: {
      linuxFxVersion: 'Python|${pythonVersion}'
      ftpsState: 'Disabled'
      minTlsVersion: '1.2'
      appSettings: [
        {
          name: 'AzureWebJobsStorage'
          value: storageConnectionString
        }
        {
          name: 'APPLICATIONINSIGHTS_CONNECTION_STRING'
          value: applicationInsights.properties.ConnectionString
        }
        {
          name: 'ApplicationInsightsAgent_EXTENSION_VERSION'
          value: '~3'
        }
        {
          name: 'FUNCTIONS_EXTENSION_VERSION'
          value: '~4'
        }
        {
          name: 'FUNCTIONS_WORKER_RUNTIME'
          value: 'python'
        }
        {
          name: 'AZURE_CLIENT_ID'
          value: managedIdentity.properties.clientId
        }
        {
          name: 'BATCH_ACCOUNT_URL'
          value: batchAccountUrl
        }
        {
          name: 'BATCH_POOL_ID'
          value: batchPoolId
        }
        {
          name: 'IBF_ENVIRONMENT'
          value: ibfEnvironment
        }
        {
          name: 'IBF_API_URL'
          value: ibfApiUrl
        }
        {
          name: 'GITHUB_DATA_BASE_URL'
          value: githubDataBaseUrl
        }
        {
          name: 'GLOFAS_FTP_HOST'
          value: glofasFtpHost
        }
        {
          name: 'DATA_CACHE_DIR'
          value: dataCacheDir
        }
        {
          name: 'IBF_PIPELINE_API_KEY'
          value: apiKeyReference
        }
        {
          name: 'GLOFAS_FTP_USER'
          value: glofasUserReference
        }
        {
          name: 'GLOFAS_FTP_PASSWORD'
          value: glofasPasswordReference
        }
      ]
    }
  }
}

resource taskFailActionGroup 'Microsoft.Insights/actionGroups@2023-01-01' = {
  name: '${functionAppName}-task-fail'
  location: 'global'
  properties: {
    groupShortName: 'nrwbatchfail'
    enabled: true
    emailReceivers: [
      {
        name: 'primary'
        emailAddress: alertEmail
        useCommonAlertSchema: true
      }
    ]
  }
}

resource taskFailAlert 'Microsoft.Insights/metricAlerts@2018-03-01' = {
  name: '${batchAccountName}-task-fail-event'
  location: 'global'
  properties: {
    description: 'Fires when one or more Batch tasks fail.'
    severity: 2
    enabled: true
    scopes: [
      batchAccount.id
    ]
    evaluationFrequency: 'PT5M'
    windowSize: 'PT5M'
    criteria: {
      'odata.type': 'Microsoft.Azure.Monitor.SingleResourceMultipleMetricCriteria'
      allOf: [
        {
          name: 'TaskFailEvent'
          metricNamespace: 'Microsoft.Batch/batchAccounts'
          metricName: 'TaskFailEvent'
          operator: 'GreaterThan'
          threshold: 0
          timeAggregation: 'Total'
          criterionType: 'StaticThresholdCriterion'
        }
      ]
    }
    actions: [
      {
        actionGroupId: taskFailActionGroup.id
      }
    ]
  }
}

@description('Name of the deployed Function App; consumed by publish-function.sh.')
output functionAppName string = functionApp.name
