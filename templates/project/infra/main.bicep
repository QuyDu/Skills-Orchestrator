// Minimal Azure baseline: an App Service with a system-assigned identity, a Key Vault it can read
// through RBAC, and an optional Azure OpenAI account whose model is chosen by infra/discover.ps1.
// Extend this file with the services your application actually needs.

targetScope = 'resourceGroup'

@minLength(2)
@maxLength(20)
@description('Base name for every resource in this deployment.')
param siteName string

@description('Region for the deployment.')
param location string = resourceGroup().location

@allowed(['B1', 'B2', 'S1', 'P1v3'])
param appServiceSku string = 'S1'

@description('Set true when deploying to Azure US Government so the app resolves sovereign endpoints.')
param isAzureGov bool = false

@description('Set false when the project keeps no secrets of its own and needs no vault.')
param deployKeyVault bool = true

@description('Set true only when discover.ps1 reported Azure OpenAI as available in the region.')
param deployOpenAI bool = false

@description('Model name reported by discover.ps1, for example gpt-4.1.')
param openAIModelName string = ''

@description('Model version reported by discover.ps1.')
param openAIModelVersion string = ''

@allowed(['Standard', 'GlobalStandard', 'DataZoneStandard'])
param openAIModelSku string = 'Standard'

@description('Runtime stack for the Linux web app, for example NODE|22-lts or PYTHON|3.12.')
param linuxFxVersion string = 'NODE|22-lts'

@description('Standard tag set applied to every resource.')
param tags object = {}

@allowed(['Enabled', 'Disabled'])
@description('Data-plane public access. Enabled lets the baseline run without a VNet. Production must set Disabled and front these services with private endpoints, recorded in an ADR.')
param publicNetworkAccess string = 'Enabled'

var suffix = uniqueString(resourceGroup().id)
var webAppName = 'app-${siteName}-${suffix}'
var keyVaultName = take('kv-${siteName}-${suffix}', 24)
var openAIName = 'oai-${siteName}-${suffix}'

// Built-in role: Key Vault Secrets User.
var keyVaultSecretsUserRoleId = '4633458b-17de-408a-b874-0445c86b69e6'
// Built-in role: Cognitive Services OpenAI User.
var openAIUserRoleId = '5e0bd9bd-7b93-4f28-af87-19fc36ad61bd'

resource appServicePlan 'Microsoft.Web/serverfarms@2024-04-01' = {
  name: 'plan-${siteName}-${suffix}'
  location: location
  tags: tags
  sku: {
    name: appServiceSku
  }
  kind: 'linux'
  properties: {
    reserved: true
  }
}

resource keyVault 'Microsoft.KeyVault/vaults@2024-11-01' = if (deployKeyVault) {
  name: keyVaultName
  location: location
  tags: tags
  properties: {
    sku: {
      family: 'A'
      name: 'standard'
    }
    tenantId: subscription().tenantId
    // RBAC instead of access policies keeps authorization in one model.
    enableRbacAuthorization: true
    enableSoftDelete: true
    softDeleteRetentionInDays: 90
    publicNetworkAccess: publicNetworkAccess
  }
}

resource openAI 'Microsoft.CognitiveServices/accounts@2025-06-01' = if (deployOpenAI) {
  name: openAIName
  location: location
  tags: tags
  kind: 'OpenAI'
  sku: {
    name: 'S0'
  }
  properties: {
    customSubDomainName: openAIName
    publicNetworkAccess: publicNetworkAccess
    disableLocalAuth: true
  }
}

resource openAIDeployment 'Microsoft.CognitiveServices/accounts/deployments@2025-06-01' = if (deployOpenAI && !empty(openAIModelName)) {
  parent: openAI
  name: openAIModelName
  sku: {
    name: openAIModelSku
    capacity: 10
  }
  properties: {
    model: {
      format: 'OpenAI'
      name: openAIModelName
      version: openAIModelVersion
    }
  }
}

resource webApp 'Microsoft.Web/sites@2024-04-01' = {
  name: webAppName
  location: location
  tags: tags
  identity: {
    type: 'SystemAssigned'
  }
  properties: {
    serverFarmId: appServicePlan.id
    httpsOnly: true
    siteConfig: {
      linuxFxVersion: linuxFxVersion
      minTlsVersion: '1.2'
      ftpsState: 'Disabled'
      http20Enabled: true
      appSettings: [
        {
          name: 'AZURE_CLOUD'
          value: isAzureGov ? 'AzureUSGovernment' : 'AzureCloud'
        }
        {
          name: 'KEY_VAULT_URI'
          value: keyVault.?properties.vaultUri ?? ''
        }
        {
          name: 'AZURE_OPENAI_ENDPOINT'
          value: openAI.?properties.endpoint ?? ''
        }
        {
          name: 'AZURE_OPENAI_DEPLOYMENT'
          value: deployOpenAI ? openAIModelName : ''
        }
      ]
    }
  }
}

resource keyVaultSecretsUser 'Microsoft.Authorization/roleAssignments@2022-04-01' = if (deployKeyVault) {
  scope: keyVault
  name: guid(keyVaultName, webApp.id, keyVaultSecretsUserRoleId)
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', keyVaultSecretsUserRoleId)
    principalId: webApp.identity.principalId
    principalType: 'ServicePrincipal'
  }
}

resource openAIUser 'Microsoft.Authorization/roleAssignments@2022-04-01' = if (deployOpenAI) {
  scope: openAI
  name: guid(openAIName, webApp.id, openAIUserRoleId)
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', openAIUserRoleId)
    principalId: webApp.identity.principalId
    principalType: 'ServicePrincipal'
  }
}

output webAppName string = webAppName
output webAppHostName string = webApp.properties.defaultHostName
output keyVaultUri string = keyVault.?properties.vaultUri ?? ''
output managedIdentityPrincipalId string = webApp.identity.principalId
output openAIEndpoint string = openAI.?properties.endpoint ?? ''
