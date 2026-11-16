# Raptor status

[status.raptorpanel.net](https://status.raptorpanel.net): whether Raptor's Panel, web app, and services are up, and what's been wrong lately. It runs on Microsoft Azure, apart from everything Raptor itself runs on (Oracle Cloud, AWS, Cloudflare), so it stays up when they don't.

| Folder | What it is |
| --- | --- |
| [`site/`](site/) | The page: static Astro, in Raptor's design system, on Azure Static Web Apps (Free) |
| [`checker/`](checker/) | An Azure Function that checks everything once a minute and writes `status.json` and `history.json` to Blob Storage |
| [`incidents/`](incidents/) | One Markdown file per incident or maintenance. [How to post one](incidents/README.md) |
| [`components.json`](components.json) | What's shown and how each part is checked |
| [`shared/`](shared/) | The file formats and rules the page and the checker share |

```
 every minute                  public, cached 15 s              static, rebuilt on push
 Azure Function  ── writes ──▶  Blob Storage: status.json  ◀── reads ──  Static Web App
 (checker/)                     history.json                             (site/ + incidents/)
     │
     └── checks api., app., get., docs., raptorpanel.net, and raptornodes.net's nameservers
```

**Costs** (pay-as-you-go, list prices, November 2026): the Static Web App is free (100 GB a month, and it stops serving past that rather than billing). The Function stays inside Flex Consumption's monthly free grant (about 43,000 runs against 250,000). Blob Storage is about $0.30 a month, almost all of it write operations. Expect **$0.30 to $0.60 a month**.

## Posting an incident

See [incidents/README.md](incidents/README.md). In short: add a Markdown file under `incidents/` on `main`, from github.com if need be, and the page is updated in about a minute.

## How it decides

- A component is **down** after 2 failed checks in a row, and **degraded** after 2 slow answers in a row (`slowMs` in `components.json`). One bad check changes nothing.
- An open incident raises what its components show: `major` shows them down, `minor` degraded, and maintenance shows "Maintenance" during its window.
- Each day's bar: up if it was never down, partly down under 30 minutes down, down from 30 minutes. Incidents colour their days too. Uptime counts minutes down; slow minutes count as up.
- If `status.json` is more than 5 minutes old, the page says the checks are delayed instead of guessing.
- `raptornodes.net` is checked by asking each of its own nameservers (Route 53) for the zone's SOA record directly: some not answering is degraded, none is down.

## Developing

Node 24 for the page, Node 22 for the checker (what Azure runs).

```sh
cd checker && npm ci && npm run once -- ../site/public/data   # real checks, from this machine, into the page
cd site && npm ci && npm run dev                                # http://localhost:4321, reads /data
```

`npm test` in `checker/` tests the status rules. To see the page with made-up incidents, build it from `site/preview/ok` or `site/preview/outage` instead of `incidents/`: `PREVIEW=outage npm run build`.

The page's colours and fonts are copies of Raptor's ([its DESIGN.md](https://github.com/xena-studios/raptor/blob/main/docs/DESIGN.md), `site/src/styles/site.css`): keep them in step.

## Setup

**Done on 2026-11-16**, in the subscription **Raptor**, resource group `raptor-status` (Central US): storage `raptorstatus` (public `status` container) and `raptorstatusfn`, Function App `raptor-status-checker`, Static Web App `raptor-status` (`brave-rock-00fb9f210.6.azurestaticapps.net`), Entra app `raptor-status-deploy`, and the budget `raptor-monthly` ($5 a month: alerts at 50% and 100%, and when the month is forecast past it). The steps are kept for rebuilding it.

Once, with the [Azure CLI](https://learn.microsoft.com/cli/azure/install-azure-cli) (`brew install azure-cli`) and `gh`. The names below are suggestions; storage account names must be unique across Azure, so pick your own where they're marked.

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
DATA=raptorstatusdata        # pick your own: 3-24 lowercase letters and digits
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
FN=raptor-status-checker      # pick your own: becomes <name>.azurewebsites.net
FNSTORE=raptorstatusfn        # pick your own: the Function's private storage
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

Optional, and worth it:

- **`HEARTBEAT_URL`**: a [healthchecks.io](https://healthchecks.io) check (period 1 minute, grace 5 minutes), pinged after every run, so you hear about it if the checker itself stops. The page says "checks are delayed" either way, but nobody's watching the page then.
- **`DISCORD_WEBHOOK_URL`**: a webhook for a staff channel (Channel settings → Integrations → Webhooks). It posts when a component goes down and comes back. Keep it out of public channels: the page and its feed are the public side.

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

Then in the repository's settings: **Branches** → protect `main` against force pushes and deletion (but don't require pull requests: incidents are committed straight to `main`, which is why this repository is separate from Raptor's). Turn on Renovate for it, as for the other repositories.

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

### 8. First deploy and check

```sh
gh workflow run "Deploy checker" && gh workflow run "Deploy site"
gh run watch
```

Within two minutes, `https://$DATA.blob.core.windows.net/status/status.json` exists and `https://<default hostname>` shows every component operational. If not, the checker's log is in the Function App (Monitoring → Logs, or Log stream).

### 9. The domain

`status.raptorpanel.net` stays on Cloudflare's DNS, **unproxied**: Cloudflare's outages have been its proxy, which a DNS-only record doesn't use, and Azure's address resolves on Azure's own nameservers.

1. Cloudflare → raptorpanel.net → DNS: change the `status` record (Better Stack's today) to **CNAME `status` → `<default hostname>`, Proxy status: DNS only** (grey cloud).
2. `az staticwebapp hostname set -g raptor-status -n raptor-status --hostname status.raptorpanel.net` (it validates the CNAME, then issues the certificate: a few minutes).
3. Open https://status.raptorpanel.net and check it's live.
4. Turn off Better Stack's status page. Keep any monitors that page you until the monitoring redo.

### 10. Afterwards

- Link it: Raptor's web app and docs already link to `status.raptorpanel.net`. Pin it in the Discord's announcements channel, and add the feed (`/feed.xml`) to a Discord feed bot there if you want posts.
- Raptor's docs say the status page's DNS is off Cloudflare (ARCHITECTURE.md, PANEL.md, RELIABILITY.md, ROADMAP item 22): update them to "Azure, DNS-only record on Cloudflare" with a DECISIONS entry.

## Licence

AGPL-3.0, as Raptor. See [LICENSE](LICENSE).
