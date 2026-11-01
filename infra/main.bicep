// FamilyPlanner infrastructure (section 11). Deploy once by hand, re-runnable:
//   az group create -n rg-familyplanner -l uksouth
//   az deployment group create -g rg-familyplanner -f infra/main.bicep -p apiPrincipalId=<object id> alertEmail=<you>
// The README covers the rest: application settings, the deployment token and invitations.
// Application settings are set with `az staticwebapp appsettings set`, not here, because a
// staticSites/config resource replaces the whole set and would wipe the client secret on a re-run.

@description('Region for the data. UK South keeps it in the UK.')
param location string = 'uksouth'
@description('Static Web Apps is not offered in UK South; West Europe is the nearest region.')
param swaLocation string = 'westeurope'
param name string = 'familyplanner'
@description('Object id of the familyplanner-api service principal (S18).')
param apiPrincipalId string
@description('Monthly spend that triggers the budget alert, in GBP (S26).')
param budgetAmount int = 5
param alertEmail string = ''
@description('First of a month, and not before the current month. Azure rejects anything earlier.')
param budgetStart string = '${utcNow('yyyy-MM')}-01'

// One Static Web App, Free tier, with managed functions (section 6). Deployed from GitHub Actions with a deployment token.
resource swa 'Microsoft.Web/staticSites@2023-12-01' = {
  name: name
  location: swaLocation
  sku: { name: 'Free', tier: 'Free' }
  properties: {
    stagingEnvironmentPolicy: 'Enabled'
    allowConfigFileUpdates: true
  }
}

// Cosmos DB NoSQL, free tier, serverless-free 1000 RU/s (section 6.1).
resource cosmos 'Microsoft.DocumentDB/databaseAccounts@2024-05-15' = {
  name: '${name}-db'
  location: location
  kind: 'GlobalDocumentDB'
  properties: {
    databaseAccountOfferType: 'Standard'
    enableFreeTier: true
    locations: [ { locationName: location, failoverPriority: 0 } ]
    // Strong, not Session: session tokens do not cross function instances, and a save must show on the next read.
    consistencyPolicy: { defaultConsistencyLevel: 'Strong' }
    publicNetworkAccess: 'Enabled'
    ipRules: [ { ipAddressOrRange: '0.0.0.0' } ] // S20: 0.0.0.0 means public Azure datacentres only
    disableLocalAuth: true // S18: keys cannot be used at all
    backupPolicy: { type: 'Periodic', periodicModeProperties: { backupIntervalInMinutes: 240, backupRetentionIntervalInHours: 8 } } // S25
  }
}

resource database 'Microsoft.DocumentDB/databaseAccounts/sqlDatabases@2024-05-15' = {
  parent: cosmos
  name: 'familyplanner'
  properties: { resource: { id: 'familyplanner' }, options: { throughput: 1000 } }
}

resource container 'Microsoft.DocumentDB/databaseAccounts/sqlDatabases/containers@2024-05-15' = {
  parent: database
  name: 'docs'
  properties: {
    resource: {
      id: 'docs'
      partitionKey: { paths: [ '/familyId' ], kind: 'Hash' }
      indexingPolicy: { indexingMode: 'consistent', includedPaths: [ { path: '/*' } ], excludedPaths: [ { path: '/notes/?' } ] }
    }
  }
}

// Cosmos DB Built-in Data Contributor for the API's service principal (S18).
var dataContributorRoleId = '00000000-0000-0000-0000-000000000002'
resource roleAssignment 'Microsoft.DocumentDB/databaseAccounts/sqlRoleAssignments@2024-05-15' = {
  parent: cosmos
  name: guid(cosmos.id, apiPrincipalId, dataContributorRoleId)
  properties: {
    roleDefinitionId: '${cosmos.id}/sqlRoleDefinitions/${dataContributorRoleId}'
    principalId: apiPrincipalId
    scope: cosmos.id
  }
}

// Budget alert (S26). Budgets are subscription- or resource-group-scoped; this one covers the resource group.
resource budget 'Microsoft.Consumption/budgets@2023-11-01' = if (!empty(alertEmail)) {
  name: '${name}-budget'
  properties: {
    category: 'Cost'
    amount: budgetAmount
    timeGrain: 'Monthly'
    timePeriod: { startDate: budgetStart }
    notifications: {
      over80: { enabled: true, operator: 'GreaterThan', threshold: 80, contactEmails: [ alertEmail ] }
      over100: { enabled: true, operator: 'GreaterThan', threshold: 100, contactEmails: [ alertEmail ] }
    }
  }
}

output staticWebAppHost string = swa.properties.defaultHostname
output cosmosEndpoint string = cosmos.properties.documentEndpoint
