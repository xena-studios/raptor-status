# Setting it up

Everything this page runs on, and how to build it again from nothing.

## What's running

In the Azure subscription **Raptor**, resource group `raptor-status`, Central US:

| Resource | Name | What it's for |
| --- | --- | --- |
| Storage account | `raptorstatus` | The public `status` container: `status.json` and `history.json` |
| Storage account | `raptorstatusfn` | The Function's own, private storage |
| Function App (Flex Consumption, Node 22) | `raptor-status-checker` | The checker, with Application Insights for its logs |
| Static Web App (Free) | `raptor-status` | The page, at `status.raptorpanel.net` and `brave-rock-00fb9f210.6.azurestaticapps.net` |
| Entra app | `raptor-status-deploy` | What GitHub deploys the checker as (OIDC, `main` only) |
| Budget | `raptor-monthly` | $5 a month: emails at 50% and 100%, and when the month is forecast past it |

Outside Azure: the healthchecks.io check *Raptor status checker*, the `#alerts` webhook on the Raptor Discord server, and the `status` record on Cloudflare.

## Building it again

With the [Azure CLI](https://learn.microsoft.com/cli/azure/install-azure-cli) (`brew install azure-cli`) and `gh`.

### 1. An Azure account and a budget

1. Sign up at [azure.microsoft.com](https://azure.microsoft.com/free) with a **pay-as-you-go** subscription. (The free trial's credit ends after 30 days; pay-as-you-go keeps the always-free amounts this uses.) Use hardware-key 2FA on the account, as on Cloudflare and the registrar.
2. `az login`
3. **A budget, so a mistake can't run up a bill:** Portal → Cost Management → Budgets → Add: $5 a month, emailing you at 50% and 100%.

```sh
az provider register --namespace Microsoft.Web
az provider register --namespace Microsoft.Storage
az provider register --namespace Microsoft.App
az group create --name raptor-status --location centralus
```

**Central US (Iowa)** keeps the checks away from Virginia, where the Panel (Oracle, Ashburn) is. Check Flex Consumption is offered there with `az functionapp list-flexconsumption-locations -o table`; if not, use `northcentralus` or `westus2`, and use it everywhere below.

### 2. Storage for status.json

A storage account of its own, readable by anyone (it only ever holds the two public files):

```sh
DATA=raptorstatus             # unique across Azure: 3-24 lowercase letters and digits
az storage account create -g raptor-status -n $DATA -l centralus \
  --sku Standard_LRS --kind StorageV2 --min-tls-version TLS1_2 --allow-blob-public-access true
az storage container create --account-name $DATA -n status --public-access blob --auth-mode login
az storage cors add --account-name $DATA --services b --methods GET HEAD OPTIONS \
  --origins https://status.raptorpanel.net --allowed-headers '*' --exposed-headers '*' --max-age 3600
```

(`az storage container create --auth-mode login` needs you to have **Storage Blob Data Contributor** on the account; if it says you don't, add it in the portal under the account's Access control, or drop `--auth-mode login`.)

Its address, for steps 4 and 6: `https://$DATA.blob.core.windows.net/status`.

### 3. The checker (Function App)

```sh
FN=raptor-status-checker      # unique across Azure: becomes <name>.azurewebsites.net
FNSTORE=raptorstatusfn        # unique across Azure: the Function's private storage
az storage account create -g raptor-status -n $FNSTORE -l centralus --sku Standard_LRS --min-tls-version TLS1_2 --allow-blob-public-access false
az functionapp create -g raptor-status -n $FN --storage-account $FNSTORE \
  --flexconsumption-location centralus --runtime node --runtime-version 22 --instance-memory 512
```

`functionapp create` also makes an Application Insights resource for its logs: one line a minute is far inside the free 5 GB a month. Leave it; it's where to look if the checker misbehaves (Portal → the Function App → Monitoring → Logs).

Let it write to the status container with its own identity, so there's no key to keep:

```sh
az functionapp identity assign -g raptor-status -n $FN --identities [system]
PRINCIPAL=$(az functionapp identity show -g raptor-status -n $FN --query principalId -o tsv)
az role assignment create --assignee-object-id $PRINCIPAL --assignee-principal-type ServicePrincipal \
  --role "Storage Blob Data Contributor" \
  --scope "$(az storage account show -g raptor-status -n $DATA --query id -o tsv)/blobServices/default/containers/status"
```

### 4. The checker's settings

```sh
az functionapp config appsettings set -g raptor-status -n $FN --settings \
  STATUS_STORAGE_URL=https://$DATA.blob.core.windows.net \
  STATUS_CONTAINER=status \
  "STATUS_REGION=Central US"
```

And the two that tell someone when things break:

- **`HEARTBEAT_URL`**: the healthchecks.io check *Raptor status checker* (project *Raptor*; period 1 minute, grace 5 minutes), pinged after every run, so a checker that stops is noticed. The page says "checks are delayed" either way, but nobody's watching the page then.
- **`DISCORD_WEBHOOK_URL`**: a webhook in the staff-only `#alerts` channel (Channel settings → Integrations → Webhooks). It posts when a component goes down and comes back. Never a public channel: the page and its feed are the public side.

### 5. The page (Static Web App)

```sh
az staticwebapp create -g raptor-status -n raptor-status -l centralus --sku Free
az staticwebapp show -g raptor-status -n raptor-status --query defaultHostname -o tsv     # <name>.azurestaticapps.net
az storage cors add --account-name $DATA --services b --methods GET HEAD OPTIONS \
  --origins https://<that default hostname> --allowed-headers '*' --exposed-headers '*' --max-age 3600
```

The second CORS rule lets the page work on its default address too, before the domain moves.

### 6. The repository

```sh
gh repo create xena-studios/raptor-status --public --source . --push
gh variable set STATUS_BASE_URL --body "https://$DATA.blob.core.windows.net/status"
gh secret set AZURE_STATIC_WEB_APPS_API_TOKEN \
  --body "$(az staticwebapp secrets list -g raptor-status -n raptor-status --query properties.apiKey -o tsv)"
```

Then protect `main` against force pushes and deletion with a ruleset, without requiring pull requests: incidents are committed straight to `main`, which is why this repository is separate from Raptor's. Merges are squash only, as in Raptor's.

### 7. Deploying the checker from GitHub

An Entra app that GitHub signs in as with its OIDC token, allowed to deploy this one Function App and nothing else:

```sh
APP=$(az ad app create --display-name raptor-status-deploy --query appId -o tsv)
az ad sp create --id $APP
# GitHub names this organisation's repositories by owner and repository ID in
# the token's subject, so a deleted and re-created repository can't inherit it.
SUBJECT=$(gh api repos/xena-studios/raptor-status --jq '"repo:\(.owner.login)@\(.owner.id)/\(.name)@\(.id):ref:refs/heads/main"')
az ad app federated-credential create --id $APP --parameters "{
  \"name\": \"github-main-ids\",
  \"issuer\": \"https://token.actions.githubusercontent.com\",
  \"subject\": \"$SUBJECT\",
  \"audiences\": [\"api://AzureADTokenExchange\"]
}"
az role assignment create --assignee $APP --role "Website Contributor" \
  --scope "$(az functionapp show -g raptor-status -n $FN --query id -o tsv)"

gh variable set AZURE_CLIENT_ID --body $APP
gh variable set AZURE_TENANT_ID --body "$(az account show --query tenantId -o tsv)"
gh variable set AZURE_SUBSCRIPTION_ID --body "$(az account show --query id -o tsv)"
gh variable set AZURE_FUNCTIONAPP_NAME --body $FN
```

If `azure/login` fails with `AADSTS700213: No matching federated identity record`, the error shows the subject GitHub sent: make the credential's subject exactly that. Website Contributor on the Function App is enough to deploy it (tested).

### 8. Deploy and check

```sh
gh workflow run "Deploy checker" && gh workflow run "Deploy site"
gh run watch
```

Within two minutes, `https://$DATA.blob.core.windows.net/status/status.json` exists and `https://<default hostname>` shows every component operational. If not, the checker's log is in the Function App (Monitoring → Logs, or Log stream).

### 9. The domain

`status.raptorpanel.net` is on Cloudflare's DNS, **unproxied** (DNS only): Cloudflare's outages have been its proxy, which a DNS-only record doesn't use, and Azure's address resolves on Azure's own nameservers. Raptor's DECISIONS #359 has the reasoning.

1. Cloudflare → raptorpanel.net → DNS: **CNAME `status` → `<default hostname>`, Proxy status: DNS only.**
2. `az staticwebapp hostname set -g raptor-status -n raptor-status --hostname status.raptorpanel.net`: it checks the CNAME, then issues the certificate, in a few minutes.
