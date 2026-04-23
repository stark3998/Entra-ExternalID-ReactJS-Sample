# ---------------------------------------------------------------------------
# ACR credentials  (sensitive — never commit real values to git)
# ---------------------------------------------------------------------------
variable "acr_username" {
  description = "Admin username for blogwriterdeveus6c2uw5 ACR."
  type        = string
  sensitive   = true
}

variable "acr_password" {
  description = "Admin password for blogwriterdeveus6c2uw5 ACR."
  type        = string
  sensitive   = true
}

# ---------------------------------------------------------------------------
# Entra / app identity
# ---------------------------------------------------------------------------
variable "client_id" {
  description = "Entra application (client) ID for the External ID demo app."
  type        = string
  default     = "90947f60-61f6-4c24-a192-8f5dcbf944ec"
}

variable "tenant_id" {
  description = "Entra tenant (directory) ID."
  type        = string
  default     = "78a77549-78e5-49f7-a870-9efbb0d32d91"
}

variable "tenant_subdomain" {
  description = "Entra CIAM tenant subdomain (used to build the authority URL)."
  type        = string
  default     = "codexjay"
}

# ---------------------------------------------------------------------------
# Phone-based email recovery (lookup service)
# ---------------------------------------------------------------------------
variable "lookup_app_client_id" {
  description = "Client ID of the app registration used for MS Graph phone lookups."
  type        = string
  default     = "3879af56-4888-43e8-a6ab-46c3ca29c98c"
}

variable "lookup_app_tenant_id" {
  description = "Tenant ID for the lookup app registration."
  type        = string
  default     = "78a77549-78e5-49f7-a870-9efbb0d32d91"
}

variable "lookup_app_client_secret" {
  description = "Client secret for the lookup app registration. Passed as a secure env var."
  type        = string
  sensitive   = true
}

# ---------------------------------------------------------------------------
# Container settings
# ---------------------------------------------------------------------------
variable "container_image_tag" {
  description = "Tag of the container image to deploy."
  type        = string
  default     = "latest"
}

variable "cpu" {
  description = "vCPU allocated to the Azure Container App container."
  type        = number
  default     = 1
}

variable "memory" {
  description = "Memory allocated to the Azure Container App container."
  type        = string
  default     = "2Gi"
}
