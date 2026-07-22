import { LegalPage } from '@/components/legal/LegalPage'

const sections = [
  {
    title: '1. Overview',
    paragraphs: [
      'This Privacy Policy explains how Time Translator collects, uses, stores and discloses personal information when you visit timetranslator.com.au, create an account, use the Time Translator application, or contact us for support.',
      'Time Translator is operated by GLASGOW, JASMINE LEIGH, sole trader, ABN 67 730 170 835. Although some small businesses may be exempt from parts of the Privacy Act 1988 (Cth), Time Translator chooses to handle personal information in line with the Australian Privacy Principles.',
    ],
  },
  {
    title: '2. Customer data',
    paragraphs: [
      'Customers remain the data controller for any data they choose to connect, upload or process through Time Translator, including calendar events, Jira worklogs, and related content. Time Translator processes that data solely on the customer\'s behalf and only for the purpose of providing the requested service.',
      'Time Translator does not access, use, or disclose customer data except as necessary to deliver the service, as described in this policy, or as required by law.',
      'Customers requiring a Data Processing Agreement may contact us at contact@timetranslator.com.au.',
    ],
  },
  {
    title: '3. What information we collect',
    paragraphs: [
      'We may collect identity and contact information such as your name, email address, account identifiers, billing details, and any support messages you send to us.',
      'We may collect service data that you choose to provide through the app, including uploaded calendar files, parsed calendar events, timesheet review data, invoice draft data, and configuration settings such as ignore rules or mapping rules.',
      'When you log time to Jira through Time Translator, we store a record of that submission — including the Jira issue key, date, duration, and associated calendar event title — so that you can view, filter, and export your submission history from the History page. This log is stored on your account and deleted when you delete your account.',
      'Where you connect third-party services such as Google or Atlassian Jira, we may collect or receive authentication tokens, account identifiers, profile details, worklog information, and other data needed to provide the service you request.',
      'When you connect Google Calendar, Time Translator requests read-only access to your Google Calendar events (the calendar.readonly scope). We read your calendar events — such as their titles, descriptions, dates and times — so the app can convert them into the timesheets, worklogs and invoice drafts you review. We do not create, edit, or delete anything in your Google Calendar. How we access, use, store, and share this data is described in the "Google user data" section below.',
      'When you connect Atlassian Jira, Time Translator writes worklogs to Jira on your behalf. Our app never edits or deletes worklogs.',
      'We may also collect technical and usage information such as device type, browser type, IP address, approximate location, log records, timestamps, pages used, and feature interaction counts for service administration, security and improvement.',
    ],
  },
  {
    title: '4. How we collect information',
    paragraphs: [
      'We collect information directly from you when you create an account, sign in, upload files, connect integrations, edit settings, create outputs, subscribe to a paid plan, or contact us.',
      'We collect information automatically through the operation of the website and app, including through cookies, session data, security logs, hosting infrastructure and product analytics where used.',
      'We may also receive information from third parties you authorise us to use, including authentication providers, payment processors, cloud hosting providers, and software platforms such as Google and Atlassian.',
    ],
  },
  {
    title: '5. Why we use personal information',
    paragraphs: [
      'We use personal information to provide, maintain and improve Time Translator, including signing you in, importing and processing your data, generating outputs such as timesheets and invoice drafts, and supporting integrations you enable.',
      'We also use personal information to manage subscriptions and payments, respond to support requests, monitor usage limits, protect the security and reliability of the service, investigate misuse, comply with legal obligations, and communicate service updates or important notices.',
      'If we want to use your information for a new purpose that is not reasonably related to the reasons described in this policy, we will seek consent where required or update this policy before doing so.',
    ],
  },
  {
    title: '6. Disclosure of personal information',
    paragraphs: [
      'We may disclose personal information to service providers who help us operate Time Translator, such as hosting and infrastructure providers, authentication providers, payment processors, email and support tools, and integration partners including Google and Atlassian where you authorise those connections.',
      'Where the service uses AI to generate outputs such as timesheet summaries or invoice drafts, this processing may be performed using AI language model providers including Anthropic (Claude API) and OpenAI (ChatGPT API). Calendar event titles, descriptions, and Jira worklog data you have imported may be sent to these providers for this purpose. Neither Anthropic nor OpenAI uses API data to train their models. No customer data is used for AI model training.',
      'We may also disclose information where required or authorised by law, to protect our legal rights, to investigate suspected fraud or abuse, or as part of a sale, restructure or transfer of the business.',
      'We do not sell personal information for unrelated third-party marketing purposes.',
    ],
  },
  {
    title: '7. Google user data',
    paragraphs: [
      'When you connect your Google Calendar, Time Translator requests read-only access to your calendar events (the https://www.googleapis.com/auth/calendar.readonly scope). We use this access solely to read your calendar events so the app can convert them into the timesheets, worklogs and invoice drafts you review. We do not create, edit, or delete anything in your Google Calendar.',
      'Time Translator\'s use and transfer of information received from Google APIs to any other app will adhere to the Google API Services User Data Policy (https://developers.google.com/terms/api-services-user-data-policy), including the Limited Use requirements.',
      'Specifically: we do not use Google user data for advertising; we do not sell Google user data; we do not transfer or disclose Google user data to others except as necessary to provide or improve user-facing features that are prominent in the app, to comply with applicable law, or as part of a merger or acquisition with notice to you; and we do not allow humans to read Google user data unless we first obtain your affirmative consent, it is necessary for security purposes (such as investigating abuse), it is required to comply with applicable law, or the data has been aggregated and anonymised so it can no longer identify an individual user.',
      'Where the app sends your Google Calendar event data to AI language model providers (Anthropic and/or OpenAI) to generate the outputs you have requested, this transfer is limited to providing that user-facing feature. Neither Anthropic nor OpenAI uses this data to train their models, and no Google user data is used for AI model training.',
      'When you disconnect Google Calendar from within Time Translator, we revoke our access token with Google — so the grant is removed from your Google Account\'s third-party access page, not just our own storage — and we delete the stored authentication tokens. You can also review and revoke Time Translator\'s access at any time from your Google Account at https://myaccount.google.com/permissions.',
    ],
  },
  {
    title: '8. Overseas disclosure',
    paragraphs: [
      'Some of the service providers we use may store or process personal information outside Australia. This may include providers located in the United States or other countries where cloud infrastructure, support tools, payment systems or integration services operate.',
      'Where personal information is disclosed overseas, we take reasonable steps to ensure the recipient handles it in a manner consistent with this policy and with the Australian Privacy Principles where applicable.',
    ],
  },
  {
    title: '9. Security and retention',
    paragraphs: [
      'We take reasonable steps to protect personal information from misuse, interference, loss, unauthorised access, modification or disclosure. Measures may include access controls, encryption, provider-managed security features, logging, environment segregation, and limiting access to information that is needed to run the service.',
      'No internet-based service can be guaranteed completely secure. You are responsible for maintaining the security of your account credentials and for keeping connected third-party accounts secure.',
      'We retain personal information only for as long as reasonably necessary for the purposes described in this policy. As a general guide:',
      'Account and profile data — deleted immediately and permanently when you delete your account. Cancelling or deactivating your subscription does not delete your data. If your account remains inactive for 2 years following cancellation, we will make reasonable efforts to notify you before deleting your account and all associated data unless you request otherwise.',
      'Service data (calendar events, timesheets, invoice drafts, Jira worklogs) — deleted immediately and permanently when you delete your account.',
      'Connected Google Calendar access — when you disconnect Google Calendar, we revoke our access token with Google and delete the stored authentication tokens immediately. Google user data is never retained after you disconnect or delete your account.',
      'Billing and payment records — subscription metadata in our systems is deleted when you delete your account. Payment transaction records are retained by our payment processor (Stripe) in accordance with their own retention policies and applicable financial record-keeping laws.',
      'Security and access logs — retained for up to 2 years for security monitoring, incident investigation and audit purposes, then automatically deleted.',
      'Where retention is required by law beyond these periods, we comply with those obligations.',
    ],
  },
  {
    title: '10. Access, correction and choices',
    paragraphs: [
      'You may request access to personal information we hold about you, and you may request corrections if you believe the information is inaccurate, out of date, incomplete, irrelevant or misleading.',
      'You can also update some account and profile information directly within the service. If you want us to delete account information, disconnect integrations or assist with an access request, contact us at contact@timetranslator.com.au.',
      'We may need to verify your identity before acting on a request. In some cases, the law allows us to refuse a request or give only limited access, but if that happens we will explain the reason where required.',
    ],
  },
  {
    title: '11. Cookies and similar technologies',
    paragraphs: [
      'Time Translator may use cookies, local storage, session storage and similar technologies to keep you signed in, remember preferences, support security features, measure usage and improve performance.',
      'You can usually control cookies through your browser settings, but disabling some technologies may affect how the service works.',
    ],
  },
  {
    title: '12. Complaints',
    paragraphs: [
      'If you have a privacy complaint, please contact us at contact@timetranslator.com.au and describe the issue. We will review the complaint and respond within a reasonable time.',
      'If you are not satisfied with our response, you may be able to contact the Office of the Australian Information Commissioner.',
    ],
  },
  {
    title: '13. Changes to this policy',
    paragraphs: [
      'We may update this Privacy Policy from time to time to reflect changes to the service, technology, law or our practices. The current version will be published on this page with an updated effective date.',
    ],
  },
] as const

export default function PrivacyPage() {
  return (
    <LegalPage
      eyebrow="Privacy"
      title="Privacy Policy"
      intro="This policy explains how Time Translator handles personal information in connection with our website, paid software service and related support."
      effectiveDate="15 July 2026"
      sections={sections.map(section => ({ ...section, paragraphs: [...section.paragraphs] }))}
    />
  )
}
