# infra/envs/prod/variables.tf - Inputs for production. Defaults are the real values; secrets never
# appear here.


# The apex domain everything hangs off
variable "domain" {
  type    = string
  default = "neon1.tech"
}


# Resources owned elsewhere that this stack attaches to
variable "zone_id" {
  description = "Route 53 hosted zone for neon1.tech (owned outside this stack)."
  type        = string
  default     = "Z009089523ACQHD83TGQI"
}


variable "distribution_id" {
  description = "The neon1.tech CloudFront distribution (owned by neon1-aws-infrastructure/site)."
  type        = string
  default     = "EKL1R4AOR1VRG"
}


# Who runs the portal; the API reads this, nothing stores it
variable "operator_emails" {
  description = "Comma-separated emails with the neon1 operator role."
  type        = string
  default     = "pradeep@neon1.tech,neon1llc@gmail.com"
}


# Alarm and budget notices; must confirm the SNS subscription once
variable "alert_email" {
  type    = string
  default = "neon1llc@gmail.com"
}


# Optional switches, both off by default
variable "google_client_id" {
  description = "Google OAuth client ID. Empty leaves Google sign-in off."
  type        = string
  default     = ""
}


variable "malware_scan" {
  description = "GuardDuty Malware Protection on the documents bucket; uploads are open, so it stays on."
  type        = bool
  default     = true
}


# On (Pradeep, 2026-11-09). Carriers deliver only once the toll-free registration is approved; turning
# it off again hides texts in the profile and sends nothing
variable "texts_live" {
  description = "Offer text notices in the portal. Off until consent and STOP handling are fixed and tested."
  type        = bool
  default     = false
}


# The signed-in Neo (plans and runs workflows) is off until its planning is proven and a model this account can use is available
# (Sonnet 5.5 is "not available for this account", 2026-11-20). The chat with Pradeep does not need it: it is a tab in the public Neo.
# To turn the signed-in Neo on, the neon1-boundary-1neon boundary in neon1-aws-infrastructure/github must first allow
# bedrock:InvokeModel on the profile, then name it here
variable "neo_model" {
  description = "Bedrock inference profile ID for the signed-in Neo, or empty to keep it off."
  type        = string
  default     = ""
}

# Neo stops for the month once its estimated model spend reaches this many dollars
variable "neo_monthly_usd" {
  description = "Monthly ceiling for Neo's estimated model spend, in dollars."
  type        = number
  default     = 8
}
