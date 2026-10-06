# Security

Before publishing this repository, configure GitHub private vulnerability reporting or add a private maintainer contact here. Do not post exploit details or credentials in public issues.

Sensitive operations require authentication and generation requires verified email. Project and assistant queries are scoped to the current user. Credentials use Laravel encryption; do not rotate APP_KEY without migrating encrypted data. Production deployment requires TLS, secure cookies, actual SMTP, and protected persistent storage. Generated media can contain private user content and must remain behind authenticated downloads.
