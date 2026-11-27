# infra/envs/dev/main.tf - 1NEON dev: dev.neon1.tech/1NEON, a separate backend for trying changes with no
# client data in reach. Same modules as production with dev names (1neon-dev, neon1-1neon-*-dev), its own
# Cognito pool on auth-dev.neon1.tech, texts to the allow-listed test number only, no malware scanning, and a one-day lock on test records.
# Mail goes out from production's notify.neon1.tech identity through a dev configuration set.
#
# Apply order (by hand, AWS_PROFILE=neon1): neon1-aws-infrastructure site-dev (portal=false), github
# (for neon1-boundary-1neon-dev), this stack, then site-dev again with portal on.


# One name prefix and the dev hostnames
locals {
  name        = "1neon-dev"
  public_url  = "https://dev.${var.domain}"
  auth_domain = "auth-dev.${var.domain}"
  boundary    = "neon1-boundary-1neon-dev"
  mail_from   = "\"[DEV] 1NEON\" <noreply@notify.${var.domain}>"
  # Cognito's codes, as the API's security notices are named
  security_from = "\"[DEV] 1NEON Security\" <security@notify.${var.domain}>"

  # No GuardDuty scan in dev (nothing there comes from a client); the bucket and the API must agree
  malware_scan = false
}


data "aws_caller_identity" "current" {}


# The dev distribution (neon1-aws-infrastructure site-dev); its ARN scopes the app bucket policy
data "aws_ssm_parameter" "site_dev" {
  name = "/neon1-site/dev/distribution_arn"
}


# The apex + wildcard certificate covers auth-dev.neon1.tech
data "aws_acm_certificate" "site" {
  domain      = var.domain
  statuses    = ["ISSUED"]
  most_recent = true
}


# The app's bucket, read by the dev distribution
module "hosting" {
  source           = "../../modules/hosting"
  name             = "neon1-1neon-app-dev"
  distribution_arn = data.aws_ssm_parameter.site_dev.value
}


# Its own table
module "data" {
  source = "../../modules/data"
  name   = local.name
}


# Documents, without the paid malware scan (nothing in dev comes from a client)
module "storage" {
  source         = "../../modules/storage"
  name           = "neon1-1neon-docs-dev"
  allowed_origin = local.public_url
  malware_scan   = local.malware_scan
  boundary       = local.boundary
}


# Locked copies of test records, held one day instead of seven years
module "records" {
  source      = "../../modules/records"
  name        = "neon1-1neon-records-dev"
  retain_days = 1
}


# Mail: production's verified identity, a dev configuration set so dev sending is counted apart
resource "aws_sesv2_configuration_set" "dev" {
  configuration_set_name = local.name

  reputation_options { reputation_metrics_enabled = true }
  sending_options { sending_enabled = true }

  # The provider reports the API's zero value as drift; leave the live delivery setting untouched.
  lifecycle { ignore_changes = [delivery_options] }
}

locals {
  ses_identity_arn = "arn:aws:ses:us-east-1:${data.aws_caller_identity.current.account_id}:identity/notify.${var.domain}"
}


# Dev uses its own sender; app-level sends remain off until registration and sandbox checks pass
module "sms" {
  source          = "../../modules/sms"
  name            = local.name
  two_way_enabled = var.texts_live
}


# dev.neon1.tech's sign-in gate (neon1-aws-infrastructure site-dev, applied after this stack's pool)
data "aws_ssm_parameter" "gate_client_id" {
  name = "/neon1-site/dev/gate_client_id"
}


# The API and the Cognito trigger
module "api" {
  source                  = "../../modules/api"
  name                    = local.name
  env                     = "dev"
  boundary                = local.boundary
  table_arn               = module.data.arn
  table_name              = module.data.name
  docs_bucket             = module.storage.bucket
  malware_scan            = local.malware_scan
  docs_bucket_arn         = module.storage.bucket_arn
  records_bucket          = module.records.bucket
  records_bucket_arn      = module.records.bucket_arn
  public_url              = local.public_url
  gate_client_id          = data.aws_ssm_parameter.gate_client_id.value
  auth_domain             = local.auth_domain
  mail_from               = local.mail_from
  ses_identity_arn        = local.ses_identity_arn
  ses_configuration_set   = aws_sesv2_configuration_set.dev.configuration_set_name
  operator_emails         = var.operator_emails
  user_pool_id            = module.auth.user_pool_id
  user_pool_arn           = module.auth.user_pool_arn
  client_id               = module.auth.client_id
  sms_number_arn          = var.texts_live ? module.sms.number_arn : ""
  sms_number              = var.texts_live ? module.sms.number : ""
  sms_inbound_topic_arn   = var.texts_live ? module.sms.inbound_topic_arn : ""
  sms_allowlist_parameter = var.texts_live ? "/1neon/dev/sms/allowlist/pradeep_personal_cell" : ""
  texts_live              = var.texts_live
  # neon1's own alerts (chat, contact, bugs, feedback, requests) and their phone push go through the neon1-notify
  # service, which holds the Pushover keys; the API reads none
  notify_function_arn = "arn:aws:lambda:us-east-1:${data.aws_caller_identity.current.account_id}:function:neon1-notify-dev"
  neo_model           = var.neo_model
  neo_monthly_usd     = 2
  # Trin answers with Qwen3 Next 80B (the public Neo's model) and searches with Titan; its month is capped at $5
  trin_model = "qwen.qwen3-next-80b-a3b"
  # Prospect sign-up, tried here first with Cloudflare's invisible always-pass test key
  signup             = true
  turnstile_site_key = "1x00000000000000000000BB"
  # dev.neon1.tech sends the secret once site-dev/ is applied after this stack
  origin_lock = true
}


# Publish the sender ARN so the shared IAM-boundary stack can grant only this dev identity
resource "aws_ssm_parameter" "sms_sender_arn" {
  name  = "/1neon/dev/sms/sender_arn"
  type  = "String"
  value = module.sms.number_arn
}


# Cognito on auth-dev.neon1.tech: dev accounts are separate from production's
module "auth" {
  source          = "../../modules/auth"
  name            = local.name
  auth_domain     = local.auth_domain
  zone_id         = var.zone_id
  certificate_arn = data.aws_acm_certificate.site.arn
  public_url      = local.public_url
  # Dev passkeys belong to dev.neon1.tech, so a device never offers a neon1.tech (production) passkey
  # to dev, or a dev one to production
  passkey_rp_id                  = "dev.${var.domain}"
  ses_identity_arn               = local.ses_identity_arn
  ses_configuration_set          = aws_sesv2_configuration_set.dev.configuration_set_name
  mail_from                      = local.security_from
  pre_sign_up_arn                = module.api.trigger_arn
  google_client_id               = ""
  google_client_secret_parameter = "/1neon/dev/google_client_secret"
}


# --- Values site-dev reads ---


resource "aws_ssm_parameter" "edge" {
  for_each = {
    app_bucket_domain = module.hosting.bucket_domain
    api_domain        = module.api.api_domain
  }
  name  = "/1neon/dev/${each.key}"
  type  = "String"
  value = each.value
}
