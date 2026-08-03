// Single source of truth for the Resend "from" address.
//
// The sending domain verified in Resend is the `contact.` subdomain, not the
// apex — so the from address must be on that subdomain or Resend rejects the
// send. Override with EMAIL_FROM if the verified domain ever changes.
export const EMAIL_FROM =
  process.env.EMAIL_FROM ?? 'Time Translator <noreply@contact.timetranslator.com.au>'
