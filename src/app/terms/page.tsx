import { LegalPage } from '@/components/legal/LegalPage'

const sections = [
  {
    title: '1. Agreement',
    paragraphs: [
      'These Terms of Service govern your access to and use of Time Translator, including the website at timetranslator.com.au, the application, and any related paid plans, support and integrations.',
      'Time Translator is operated by GLASGOW, JASMINE LEIGH, sole trader, ABN 67 730 170 835. By creating an account, accessing the service or using any part of it, you agree to these terms.',
      'If you use Time Translator on behalf of a business or other entity, you represent that you have authority to bind that entity to these terms.',
    ],
  },
  {
    title: '2. The service',
    paragraphs: [
      'Time Translator is a software service that helps users translate calendar-based time records into administrative outputs such as timesheets, worklog-ready data, invoice drafts, reports and similar outputs. Features may change over time and some features may still be in beta or under active development.',
      'We may add, remove, suspend or modify features, limits, integrations, pricing, or service plans from time to time. We will take reasonable steps to communicate material changes where appropriate.',
    ],
  },
  {
    title: '3. Accounts and eligibility',
    paragraphs: [
      'You must provide accurate account information and keep it up to date. You are responsible for maintaining the confidentiality of your account, authentication methods and connected third-party credentials.',
      'You must not share your account in a way that is inconsistent with your plan, interfere with the security of the service, or allow unauthorised users to access your account.',
      'We may suspend or terminate access if we reasonably believe your account is being used unlawfully, fraudulently, abusively, or in breach of these terms.',
    ],
  },
  {
    title: '4. Paid plans, billing and refunds',
    paragraphs: [
      'Time Translator is intended to operate as a paid app. Fees, billing cycles, usage limits, included features and any trial terms will be shown in the app, on our website, or at the point of purchase.',
      'You agree to pay applicable fees for the plan you select. If your plan renews automatically, you authorise us or our payment processor to charge the relevant fees at the start of each renewal period unless you cancel beforehand.',
      'Unless stated otherwise, fees are non-refundable except where required by Australian law, including the Australian Consumer Law. Nothing in these terms excludes, restricts or modifies rights or remedies that cannot lawfully be excluded, restricted or modified.',
    ],
  },
  {
    title: '5. Your data and your responsibilities',
    paragraphs: [
      'You are responsible for the accuracy, legality and appropriateness of the data you upload to or generate through Time Translator, including calendar records, worklogs, descriptions, invoice information, and data imported from third-party services.',
      'You must ensure you have the rights, permissions and authority needed to connect external accounts and to process any personal information, business data or client information through the service.',
      'You remain responsible for reviewing outputs before acting on them. Time Translator assists with automation and drafting, but you are responsible for confirming the correctness of final worklogs, invoices, reports and business records.',
    ],
  },
  {
    title: '6. Acceptable use',
    paragraphs: [
      "You must not use the service to break the law, infringe another person’s rights, upload malicious code, probe or disrupt the service, reverse engineer restricted parts of the platform except as allowed by law, attempt to bypass plan limits, rate limits or security controls, engage in automated scraping or bulk data extraction, or make excessive or abusive API requests that place unreasonable load on the service or connected third-party platforms.",
      'You must not use Time Translator in a way that could harm the service, other users, connected providers, or our reputation.',
    ],
  },
  {
    title: '7. Customer data and third-party integrations',
    paragraphs: [
      'Time Translator integrates with third-party platforms including Atlassian Jira and Google Calendar in order to generate timesheets, invoices and related operational records.',
      'To provide these services, Time Translator may store imported metadata from connected services, generated worklog and timesheet records, processing history, user configuration and mapping settings, and exported reporting data.',
      'Generated records may remain stored within Time Translator even where equivalent records also exist within connected third-party systems.',
      'Users may export generated records and reporting data in supported formats such as CSV.',
      'Time Translator is not intended to replace Atlassian Jira or Google Calendar as the authoritative system of record for those platforms, but may retain derived operational records required to provide application functionality, reporting, historical processing and user access to prior runs.',
    ],
  },
  {
    title: '8. Third-party services',
    paragraphs: [
      'Time Translator may interoperate with third-party services such as Google, Atlassian, payment processors and other tools. Your use of those services is also governed by their separate terms and privacy policies.',
      'We are not responsible for the continued availability, accuracy, security or performance of third-party services, or for changes those providers make to their platforms, APIs, permissions or pricing.',
    ],
  },
  {
    title: '9. Intellectual property',
    paragraphs: [
      'We own or license the intellectual property rights in Time Translator, including the software, design, branding, text, graphics and other content we make available through the service, other than user-provided content and third-party materials.',
      'We grant you a limited, non-exclusive, non-transferable, revocable right to use the service in accordance with your plan and these terms. You must not copy, resell, sublicense or exploit the service except as permitted by law or with our written consent.',
    ],
  },
  {
    title: '10. Availability, beta features and disclaimers',
    paragraphs: [
      'We aim to provide a reliable service, but we do not promise uninterrupted or error-free availability. The service may be unavailable from time to time due to maintenance, updates, third-party outages, internet issues or matters beyond our reasonable control.',
      'Support is provided on a reasonable-efforts basis through the support channels identified on our website. Users can typically expect a response within 48 hours on business days.',
      'To the maximum extent permitted by law, beta features, experimental features and development-stage features are provided as available and may change or be withdrawn without notice.',
      'Time Translator is a business productivity tool. It does not provide legal, accounting, taxation or financial advice, and you should obtain your own professional advice where required.',
    ],
  },
  {
    title: '11. Liability',
    paragraphs: [
      'Nothing in these terms excludes, restricts or modifies any consumer guarantee, statutory right or remedy you may have under the Australian Consumer Law or any other law where doing so would be unlawful.',
      'Where a guarantee or condition is implied by law and cannot be excluded, our liability is limited to the extent permitted by law. For services, that may include supplying the services again or paying the cost of having the services supplied again.',
      'To the maximum extent permitted by law, we are not liable for indirect, incidental, special or consequential loss, loss of profits, loss of revenue, loss of business opportunity, loss of data, or loss arising from third-party services, user error, or decisions you make based on outputs generated through the service.',
    ],
  },
  {
    title: '12. Suspension and termination',
    paragraphs: [
      'You may stop using the service at any time. We may suspend, restrict or terminate access if you breach these terms, fail to pay applicable fees, create risk for the service or other users, or if we are required to do so by law.',
      'On termination, your right to use the service ends immediately, but provisions that by their nature should continue will survive, including clauses about payment obligations, liability, intellectual property, privacy-related responsibilities and dispute resolution.',
    ],
  },
  {
    title: '13. Governing law',
    paragraphs: [
      'These terms are governed by the laws of New South Wales, Australia, unless another non-excludable law applies. You and we submit to the non-exclusive jurisdiction of the courts of New South Wales and the Commonwealth of Australia.',
    ],
  },
  {
    title: '14. Contact',
    paragraphs: [
      'For questions about these terms, support, notices, billing issues or legal requests, contact us at contact@timetranslator.com.au.',
    ],
  },
] as const

export default function TermsPage() {
  return (
    <LegalPage
      eyebrow="Legal"
      title="Terms of Service"
      intro="These terms set out how paid access to Time Translator works, what each side is responsible for, and the legal framework for using the service in Australia."
      effectiveDate="2 June 2026"
      sections={sections.map(section => ({ ...section, paragraphs: [...section.paragraphs] }))}
    />
  )
}
