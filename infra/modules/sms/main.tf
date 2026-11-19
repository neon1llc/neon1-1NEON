# infra/modules/sms/main.tf - Text messages from 1NEON: a US toll-free number for notifications and
# an opt-out list, so anyone who replies STOP never gets another text. AWS End User Messaging sends
# only after the number's toll-free registration is approved and the account leaves the SMS sandbox.


# Inputs: a name for the opt-out list
variable "name" { type = string }
variable "two_way_enabled" { type = bool }


data "aws_caller_identity" "current" {}


# Replies of STOP (and its variants) land here, and AWS stops sending to those numbers by itself
resource "aws_pinpointsmsvoicev2_opt_out_list" "main" {
  name = var.name
}


# The toll-free number texts come from: transactional notices only, SMS only, kept safe from deletion
resource "aws_pinpointsmsvoicev2_phone_number" "notify" {
  iso_country_code              = "US"
  message_type                  = "TRANSACTIONAL"
  number_type                   = "TOLL_FREE"
  number_capabilities           = ["SMS"]
  opt_out_list_name             = aws_pinpointsmsvoicev2_opt_out_list.main.name
  two_way_channel_enabled       = var.two_way_enabled
  two_way_channel_arn           = var.two_way_enabled ? aws_sns_topic.inbound.arn : null
  self_managed_opt_outs_enabled = false
  deletion_protection_enabled   = true
  # A new toll-free number stays pending until its registration is approved, so don't wait on it
  wait_for_active = false
  # The registration is filed and linked by hand (it carries the business's tax details)
  lifecycle {
    ignore_changes = [registration_id]
  }
}


# Inbound replies go to the API; AWS still handles STOP and HELP automatically
resource "aws_sns_topic" "inbound" {
  name = "${var.name}-sms-inbound"
}


# Only this account's registered number may publish inbound messages to the topic
data "aws_iam_policy_document" "inbound" {
  statement {
    actions   = ["sns:Publish"]
    resources = [aws_sns_topic.inbound.arn]
    principals {
      type        = "Service"
      identifiers = ["sms-voice.amazonaws.com"]
    }
    condition {
      test     = "StringEquals"
      variable = "aws:SourceAccount"
      values   = [data.aws_caller_identity.current.account_id]
    }
    condition {
      test     = "ArnEquals"
      variable = "aws:SourceArn"
      values   = [aws_pinpointsmsvoicev2_phone_number.notify.arn]
    }
  }
}


# The service uses the scoped topic policy instead of an account-wide publish role
resource "aws_sns_topic_policy" "inbound" {
  arn    = aws_sns_topic.inbound.arn
  policy = data.aws_iam_policy_document.inbound.json
}


# Outputs: the number's ARN (the API sends from it) and the number itself
output "number_arn" { value = aws_pinpointsmsvoicev2_phone_number.notify.arn }
output "number" { value = aws_pinpointsmsvoicev2_phone_number.notify.phone_number }
output "inbound_topic_arn" { value = aws_sns_topic.inbound.arn }
