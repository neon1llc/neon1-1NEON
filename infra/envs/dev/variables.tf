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


# The signed-in Neo (the one that plans and runs workflows) is off in dev, as in production, until its planning is proven and a model
# this account can use is available (Sonnet 5.5 is "not available for this account", 2026-11-20). People see the public Neo with the
# chat with Pradeep as a tab. Name a Bedrock inference profile to turn the signed-in Neo on
variable "neo_model" {
  description = "Bedrock inference profile ID for the signed-in Neo, or empty to keep it off."
  type        = string
  default     = ""
}


# On now that dev's toll-free number is approved and the sandbox destination is verified; texts still go
# only to the destinations in the SMS allow-list parameter, so an apply never turns dev texting off by accident
variable "texts_live" {
  description = "Enable dev SMS (its toll-free number is approved; the allow-list limits recipients)."
  type        = bool
  default     = true
}
