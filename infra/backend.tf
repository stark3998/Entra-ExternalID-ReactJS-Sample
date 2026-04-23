terraform {
  backend "azurerm" {
    resource_group_name  = "rg-blog-writer-dev"
    storage_account_name = "blogwritertfstate"
    container_name       = "external-id-demo"
    key                  = "external-id-demo.tfstate"
  }
}
