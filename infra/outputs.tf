output "fqdn" {
  description = "Public FQDN of the deployed Azure Container App."
  value       = azurerm_container_app.app.latest_revision_fqdn
}

output "app_url" {
  description = "Browser URL for the External ID demo app."
  value       = "https://${azurerm_container_app.app.latest_revision_fqdn}"
}

output "proxy_url" {
  description = "Same-origin proxy base URL used by the browser-side app."
  value       = "https://${azurerm_container_app.app.latest_revision_fqdn}/api"
}
