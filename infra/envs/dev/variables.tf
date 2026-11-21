# infra/envs/dev/variables.tf - Inputs for the dev backend behind dev.neon1.tech/1NEON.


variable "domain" {
  type    = string
  default = "neon1.tech"
}


variable "zone_id" {
  description = "Route 53 hosted zone for neon1.tech (owned outside this stack)."
  type        = string
  default     = "Z009089523ACQHD83TGQI"
}


# Who runs the dev portal: the same people as production
variable "operator_emails" {
  description = "Comma-separated emails with the neon1 operator role."
  type        = string
  default     = "pradeep@neon1.tech,neon1llc@gmail.com"
}


# Neo is on in dev (capped at $2 a month in main.tf), so the chat panel's two tabs show here the way they will in
# production once its Neo is on. Sonnet 5.5 is "not available for this account" (2026-11-20), so dev uses Sonnet 4.6;
# name no model to keep Neo off
variable "neo_model" {
  description = "Bedrock inference profile ID for Neo, or empty to keep Neo off."
  type        = string
  default     = "us.anthropic.claude-sonnet-4-6"
}


# Explicit opt-in only after the TFN registration is approved and the sandbox destination is verified
variable "texts_live" {
  description = "Enable dev SMS only after its TFN is approved and the sandbox destination is verified."
  type        = bool
  default     = false
}
