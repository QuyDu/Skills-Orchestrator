// Minimal Azure baseline: an App Service with a system-assigned identity, a Key Vault it can read
// through RBAC, and an optional Azure OpenAI account whose model is chosen by infra/discover.ps1.
// Extend this file with the services your application actually needs.

targetScope = 'resourceGroup'

@minLength(2)
@maxLength(90)
@description('The user-entered project name used as the source for deterministic Azure names.')
param siteName string

@description('Azure-valid App Service plan name generated from the project name.')
param appServicePlanName string

@description('Azure-valid Web App name generated from the project name.')
param webAppName string

@description('Azure-valid Key Vault name generated from the project name.')
param keyVaultName string

@description('Azure-valid OpenAI account name generated from the project name.')
param openAIName string

@description('Azure-valid Speech account name generated from the project name.')
param speechName string

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

@description('Set true only after discovery and approval confirm that Azure Speech should be provisioned in this resource group.')
param deploySpeech bool = false

@description('Speech account kind. AIServices supports Speech among other Azure AI capabilities.')
@allowed(['SpeechServices', 'AIServices'])
param speechKind string = 'AIServices'

@description('Existing or newly provisioned Speech endpoint selected by deployment discovery.')
param speechEndpoint string = ''

@description('Existing or newly provisioned Speech region selected by deployment discovery.')
param speechRegion string = ''

@description('Set true after the deployment has placed the Speech key in Key Vault.')
param configureSpeech bool = false

@description('Key Vault secret name used for the Speech key.')
param speechKeySecretName string = 'AzureSpeechKey'

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

// Built-in role: Key Vault Secrets User.
var keyVaultSecretsUserRoleId = '4633458b-17de-408a-b874-0445c86b69e6'
// Built-in role: Cognitive Services OpenAI User.
var openAIUserRoleId = '5e0bd9bd-7b93-4f28-af87-19fc36ad61bd'
// Built-in role: Cognitive Services User.
var cognitiveServicesUserRoleId = 'a97b65f3-24c7-4388-baec-2e87135dc908'

resource appServicePlan 'Microsoft.Web/serverfarms@2024-04-01' = {
  name: appServicePlanName
  location: location
  tags: union({ project: siteName }, tags)
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
  tags: union({ project: siteName }, tags)
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
  tags: union({ project: siteName }, tags)
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

resource speech 'Microsoft.CognitiveServices/accounts@2025-06-01' = if (deploySpeech) {
  name: speechName
  location: location
  tags: union({ project: siteName }, tags)
  kind: speechKind
  sku: {
    name: 'S0'
  }
  properties: {
    customSubDomainName: speechName
    publicNetworkAccess: publicNetworkAccess
    disableLocalAuth: false
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
  tags: union({ project: siteName }, tags)
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
        {
          name: 'AZURE_SPEECH_ENDPOINT'
          value: !empty(speechEndpoint) ? speechEndpoint : speech.?properties.endpoint ?? ''
        }
        {
          name: 'AZURE_SPEECH_REGION'
          value: !empty(speechRegion) ? speechRegion : deploySpeech ? location : ''
        }
        {
          name: 'AZURE_SPEECH_CLOUD'
          value: isAzureGov ? 'AzureUSGovernment' : 'AzureCloud'
        }
        {
          name: 'AZURE_SPEECH_KEY'
          value: configureSpeech && deployKeyVault ? '@Microsoft.KeyVault(SecretUri=${keyVault.?properties.vaultUri}secrets/${speechKeySecretName}/)' : ''
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

resource speechUser 'Microsoft.Authorization/roleAssignments@2022-04-01' = if (deploySpeech) {
  scope: speech
  name: guid(speechName, webApp.id, cognitiveServicesUserRoleId)
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', cognitiveServicesUserRoleId)
    principalId: webApp.identity.principalId
    principalType: 'ServicePrincipal'
  }
}

output webAppName string = webAppName
output webAppHostName string = webApp.properties.defaultHostName
output keyVaultUri string = keyVault.?properties.vaultUri ?? ''
output managedIdentityPrincipalId string = webApp.identity.principalId
output openAIEndpoint string = openAI.?properties.endpoint ?? ''
output speechEndpoint string = speech.?properties.endpoint ?? ''
output speechRegion string = deploySpeech ? location : ''
output speechAccountName string = deploySpeech ? speechName : ''
output keyVaultName string = deployKeyVault ? keyVaultName : ''
