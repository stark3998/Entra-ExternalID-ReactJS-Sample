locals {
  location            = "westus2"
  resource_group_name = "rg-blog-writer-dev"
  acr_server          = "blogwriterdeveus6c2uw5.azurecr.io"
  image               = "${local.acr_server}/external-id-demo:${var.container_image_tag}"
  app_name            = "external-id-demo"
  environment_name    = "external-id-demo-env"
  log_workspace_name  = "external-id-demo-logs"

  container_env = {
    APP_PORT                                   = "8080"
    CORS_PORT                                  = "3001"
    APP_ORIGIN                                 = ""
    REDIRECT_URI                               = ""
    PUBLIC_BASE_API_URL                        = ""
    CLIENT_ID                                  = var.client_id
    TENANT_ID                                  = var.tenant_id
    TENANT_SUBDOMAIN                           = var.tenant_subdomain
    ENTRA_AUTHORITY_HOST                       = "ciamlogin.com"
    LOCAL_API_PATH                             = "/api"
    ALLOWED_ORIGINS                            = "*"
    LOCALE                                     = "en"
    THEME                                      = "azure-portal"
    DEMO_MODE                                  = "false"
    ENABLE_OPERATOR_MODE                       = "false"
    ENABLE_BETA_GRAPH                          = "true"
    LOGIN_SCOPES                               = "openid,profile,email,User.Read,UserAuthenticationMethod.Read,UserAuthMethod-Phone.ReadWrite"
    NATIVE_AUTH_SCOPES                         = "openid offline_access User.Read UserAuthenticationMethod.Read UserAuthMethod-Phone.ReadWrite"
    NATIVE_AUTH_CAPABILITIES                   = "registration_required mfa_required"
    NATIVE_AUTH_SIGNIN_CHALLENGE_TYPE          = "password oob redirect"
    NATIVE_AUTH_SIGNUP_CHALLENGE_TYPE          = "oob password redirect"
    NATIVE_AUTH_RESET_PASSWORD_CHALLENGE_TYPE  = "oob redirect"
    SIGNUP_ENABLED_ATTRIBUTES                  = "displayName,givenName,surname,username,city,country,postalCode,state,streetAddress,jobTitle"
    SIGNUP_SHOW_ADVANCED_JSON                  = "true"
    LOOKUP_RECOVERY_ENABLED                    = "true"
    LOOKUP_DISCLOSURE_MODE                     = "full-email"
    LOOKUP_PHONE_SOURCE                        = "mobilePhone"
    LOOKUP_APP_CLIENT_ID                       = var.lookup_app_client_id
    LOOKUP_APP_TENANT_ID                       = var.lookup_app_tenant_id
    LOOKUP_GRAPH_SCOPE                         = "https://graph.microsoft.com/.default"
  }
}

resource "azurerm_log_analytics_workspace" "app" {
  name                = local.log_workspace_name
  location            = local.location
  resource_group_name = local.resource_group_name
  sku                 = "PerGB2018"
  retention_in_days   = 30

  tags = {
    project     = local.app_name
    environment = "dev"
    managed-by  = "terraform"
  }
}

resource "azurerm_container_app_environment" "app" {
  name                       = local.environment_name
  location                   = local.location
  resource_group_name        = local.resource_group_name
  log_analytics_workspace_id = azurerm_log_analytics_workspace.app.id

  tags = {
    project     = local.app_name
    environment = "dev"
    managed-by  = "terraform"
  }
}

resource "azurerm_container_app" "app" {
  name                         = local.app_name
  resource_group_name          = local.resource_group_name
  container_app_environment_id = azurerm_container_app_environment.app.id
  revision_mode                = "Single"

  secret {
    name  = "acr-password"
    value = var.acr_password
  }

  secret {
    name  = "lookup-app-client-secret"
    value = var.lookup_app_client_secret
  }

  registry {
    server               = local.acr_server
    username             = var.acr_username
    password_secret_name = "acr-password"
  }

  ingress {
    allow_insecure_connections = false
    external_enabled           = true
    target_port                = 8080
    transport                  = "auto"

    traffic_weight {
      latest_revision = true
      percentage      = 100
    }
  }

  template {
    min_replicas = 1
    max_replicas = 1

    container {
      name   = local.app_name
      image  = local.image
      cpu    = var.cpu
      memory = var.memory

      dynamic "env" {
        for_each = local.container_env
        content {
          name  = env.key
          value = env.value
        }
      }

      env {
        name        = "LOOKUP_APP_CLIENT_SECRET"
        secret_name = "lookup-app-client-secret"
      }

      readiness_probe {
        transport = "HTTP"
        path      = "/"
        port      = 8080
      }

      liveness_probe {
        transport = "HTTP"
        path      = "/"
        port      = 8080
      }
    }
  }

  tags = {
    project     = local.app_name
    environment = "dev"
    managed-by  = "terraform"
  }
}
