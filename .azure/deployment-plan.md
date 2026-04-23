# Deployment Plan: External-ID Demo → Azure Container Instance

**Status:** Deployed ✅  
**Date:** 2026-04-23  
**IaC:** Terraform  
**Region:** West US 2 (`westus2`)

---

## Architecture

Single Linux container running both the app server (port 8080) and CORS proxy (port 3001)
via `scripts/start-stack.js --plain`. Docker image is pushed manually to ACR; Terraform
manages the ACI infrastructure only.

| Attribute | Value |
|-----------|-------|
| Container registry | `blogwriterdeveus6c2uw5.azurecr.io` |
| Image | `blogwriterdeveus6c2uw5.azurecr.io/external-id-demo:latest` |
| Resource group | `rg-blog-writer-dev` |
| ACI name | `external-id-demo` |
| DNS label | `codexjay-auth-demo` |
| Public FQDN | `codexjay-auth-demo.westus2.azurecontainer.io` |
| App URL | `http://codexjay-auth-demo.westus2.azurecontainer.io:8080` |
| Proxy URL | `http://codexjay-auth-demo.westus2.azurecontainer.io:3001` |
| CPU | 1 core |
| Memory | 1.5 GB |
| ACR auth | Admin credentials (sensitive Terraform variables) |

---

## Terraform State Backend

| Attribute | Value |
|-----------|-------|
| Backend type | `azurerm` |
| Storage account | `blogwritertfstate` |
| Resource group | `rg-blog-writer-dev` |
| Container | `external-id-demo` |
| State key | `external-id-demo.tfstate` |

---

## Artifacts Generated

| File | Status |
|------|--------|
| `infra/backend.tf` | ✅ Created |
| `infra/providers.tf` | ✅ Created |
| `infra/variables.tf` | ✅ Created |
| `infra/main.tf` | ✅ Created |
| `infra/outputs.tf` | ✅ Created |
| `infra/terraform.tfvars.example` | ✅ Created |
| `.gitignore` (updated) | ✅ Updated |

---

## Pre-Deployment Steps (Manual)

1. **Entra App Registration** — Add redirect URI in Azure Portal:  
   `http://codexjay-auth-demo.westus2.azurecontainer.io`  
   *(Portal → Entra ID → App registrations → your app → Authentication)*

2. **Build + push Docker image**
   ```bash
   az acr login --name blogwriterdeveus6c2uw5
   docker build -t blogwriterdeveus6c2uw5.azurecr.io/external-id-demo:latest .
   docker push blogwriterdeveus6c2uw5.azurecr.io/external-id-demo:latest
   ```

3. **Get ACR admin credentials**
   ```bash
   az acr credential show --name blogwriterdeveus6c2uw5 \
     --query "{username:username,password:passwords[0].value}" -o json
   ```

4. **Create `infra/terraform.tfvars`** (git-ignored) with real secrets:
   ```hcl
   acr_username             = "<from step 3>"
   acr_password             = "<from step 3>"
   lookup_app_client_secret = "<from .env>"
   ```

---

## Deployment Steps

```bash
# Initialise — downloads provider, connects to remote state
terraform -chdir=infra init

# Preview
terraform -chdir=infra plan -out=tfplan

# Apply (after reviewing plan output)
terraform -chdir=infra apply tfplan
```

---

## Key Environment Variable Overrides (vs local .env)

| Variable | ACI Value |
|----------|-----------|
| `PUBLIC_BASE_API_URL` | `http://codexjay-auth-demo.westus2.azurecontainer.io:3001/api` |
| `REDIRECT_URI` | `http://codexjay-auth-demo.westus2.azurecontainer.io` |
| `ALLOWED_ORIGINS` | `http://codexjay-auth-demo.westus2.azurecontainer.io` |
| `LOOKUP_APP_CLIENT_SECRET` | ACI secure env var (not logged) |

---

## Post-Deployment Verification

```bash
# Check container state
az container show \
  --name external-id-demo \
  --resource-group rg-blog-writer-dev \
  --query "{state:instanceView.state, fqdn:ipAddress.fqdn}" -o json

# Confirm config is served from public URL (must NOT show localhost)
curl http://codexjay-auth-demo.westus2.azurecontainer.io:8080/app-config.js

# Container logs if anything fails
az container logs --name external-id-demo --resource-group rg-blog-writer-dev

# Terraform output
terraform -chdir=infra output fqdn
```

---

## Tear Down

```bash
terraform -chdir=infra destroy
```

---

## Validation Proof

| Check | Result | Timestamp |
|-------|--------|-----------|
| `az account show` | Subscription: US Consulting CSDO AdvisoryCyberLab (`c49edb83`) | 2026-04-23 |
| `az acr show --name blogwriterdeveus6c2uw5` | loginServer: `blogwriterdeveus6c2uw5.azurecr.io`, RG: `rg-blog-writer-dev` | 2026-04-23 |
| `az storage account show --name blogwritertfstate` | Present in `rg-blog-writer-dev`, location: eastus | 2026-04-23 |
| State container `external-id-demo` | Created successfully in `blogwritertfstate` | 2026-04-23 |
| `terraform -chdir=infra init` | Backend configured, azurerm v3.117.1 installed | 2026-04-23 |
| `terraform -chdir=infra validate` | **Success! The configuration is valid.** | 2026-04-23 |
