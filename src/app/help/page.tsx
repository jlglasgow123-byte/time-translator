const quickStart = [
  {
    step: '1. Start with your calendar',
    detail: 'Time Translator begins with the work you already recorded in your calendar. Connect Google Calendar directly, or upload a Google Calendar .ics export.',
  },
  {
    step: '2. Import only the dates you need',
    detail: 'Choose a date range, upload your calendar export, and optionally exclude weekends or ignored events before review.',
  },
  {
    step: '3. Review your time',
    detail: 'The app turns calendar events into reviewable time entries. You stay in control: check the result, edit what needs attention, and skip anything that should not become an output.',
  },
  {
    step: '4. Export or log your time',
    detail: 'Approved entries can be exported as a CSV or logged directly to Jira as worklogs.',
  },
]

const faqs = [
  {
    q: 'What is Time Translator?',
    a: 'Time Translator turns calendar time into useful business outputs: timesheets now, with invoice export and more coming next.',
  },
  {
    q: 'Who is it for?',
    a: 'It is for people and small service businesses who already use their calendar to record work, but still waste time rebuilding timesheets or invoices by hand.',
  },
  {
    q: 'What can it do today?',
    a: 'The current version imports a .ics calendar file, matches events to Jira tickets using rules and AI, lets you review and edit entries, then exports CSV or logs approved time directly to Jira.',
  },
  {
    q: 'How do I sign in?',
    a: 'You can sign in with Google, or with an email address and password. If you forget your password, use the Forgot password link on the sign-in form to receive a reset email. A magic link option is also available as a fallback.',
  },
  {
    q: 'How do I reset my password?',
    a: 'On the sign-in form, enter your email address and click Forgot password. You will receive an email with a link to set a new password.',
  },
  {
    q: 'Do I need Jira?',
    a: 'No. Jira is one output option for timesheet users. You can use Time Translator with CSV export only. The broader product direction is calendar in, useful outputs out.',
  },
  {
    q: 'How do I connect Jira?',
    a: 'Go to Settings and enter your Jira base URL, account email, and API token. You can generate an API token at id.atlassian.com under Security. Use the Test connection button to confirm it is working before importing.',
  },
  {
    q: 'What .ics file do I need?',
    a: 'For Google Calendar, go to Settings, then Import & Export, then Export. Upload the .ics file for the calendar you want to process. Files must be under 4 MB and imports are limited to 200 events per run.',
  },
  {
    q: 'Can I connect Google Calendar instead of uploading a file?',
    a: 'Yes. In Settings, you can connect your Google Calendar directly so your events are pulled in automatically without a manual .ics upload. Time Translator requests read-only access and never creates, edits, or deletes calendar events. You can disconnect at any time from Settings.',
  },
  {
    q: 'What are mapping rules and ignore rules?',
    a: 'Mapping rules let you tell the app that a specific calendar event title always maps to a specific Jira ticket. Ignore rules let you permanently skip events such as lunch breaks or out-of-office entries. Both are configured in Settings.',
  },
  {
    q: 'What does AI do?',
    a: 'AI helps match ambiguous calendar events to Jira tickets when no exact rule or key is found. Explicit Jira keys and saved mapping rules always take priority over AI. Every AI suggestion shows a confidence level and reason, and you review it before anything is logged.',
  },
  {
    q: 'Will I still review the result?',
    a: 'Yes. Nothing is exported or logged without your review. The app removes repetitive admin, then gives you a clean review step before anything leaves the app.',
  },
  {
    q: 'What are ignored and skipped entries?',
    a: 'Ignored entries are automatically excluded by rules you have configured, such as recurring lunch events. Skipped entries are manually excluded by you during the review step.',
  },
  {
    q: 'What CSV export is available?',
    a: 'The CSV export maps your reviewed time entries to invoice line items. You can edit fields like contact name, invoice number, due date, and unit amount before exporting.',
  },
  {
    q: 'What data does Time Translator store?',
    a: 'The app stores your account details, Jira connection settings, mapping and ignore rules, and import history. Your .ics file is parsed in memory and not stored. Jira API tokens are encrypted before storage and are never returned to the browser.',
  },
  {
    q: 'How does the free trial work?',
    a: 'New accounts start on a free trial that includes 200 AI matches. When the trial ends, AI matching is paused until you upgrade. CSV export and manual Jira key entry are not affected by AI limits.',
  },
  {
    q: 'What usage limits apply?',
    a: 'The free trial includes 200 AI matches. The paid single-user plan includes 5,000 AI matches per month. A single import can include up to 200 calendar events, .ics uploads can be up to 4 MB, and Jira ticket searches can return up to 2,000 tickets.',
  },
  {
    q: 'Why are there rate limits?',
    a: 'Rate limits protect the service and keep costs predictable. Signed-in users can use up to 200 AI matches per minute. Anonymous traffic is limited more tightly because public pages should only need normal browsing activity.',
  },
  {
    q: 'Is Help public?',
    a: 'Yes. You can read this page before signing up. Upload, review, insights and settings are private workspace pages.',
  },
  {
    id: 'referral-program',
    q: 'How do I refer a friend and get free Pro access?',
    a: 'Love Time Translator? Tell a friend and get rewarded. Give them your account email address — when they sign up, they enter it in the "Referred by" field in their Settings. Once they upgrade to a paid plan, you automatically get 30 days of free Pro access added to your account, no need to ask. There is no limit, so every friend who subscribes earns you another free month.',
  },
]

export default function HelpPage() {
  return (
    <div className="min-h-screen bg-[#FBFBF8] py-10 text-[#26333A]">
      <div className="mx-auto max-w-3xl px-4 space-y-8">
        <div>
          <p className="text-sm font-extrabold uppercase tracking-[0.14em] text-[#3F7C85]">Help</p>
          <h1 className="mt-2 text-4xl font-extrabold tracking-[-0.045em] text-[#26333A]">How Time Translator works</h1>
          <p className="mt-3 max-w-2xl text-base leading-7 text-[#66747A]">
            Time Translator is built to remove tedious, repetitive admin from work that is already recorded in your calendar.
          </p>
        </div>

        <section className="rounded-[32px] border border-[#DCEEF5] bg-white/90 p-6 shadow-[0_18px_48px_rgba(38,51,58,0.06)]">
          <h2 className="text-lg font-extrabold tracking-[-0.025em] text-[#26333A]">Quick start</h2>
          <ol className="mt-5 space-y-4">
            {quickStart.map(({ step, detail }) => (
              <li key={step} className="flex gap-4">
                <div className="mt-2 h-2 w-2 flex-shrink-0 rounded-full bg-[#8FD5C3]" />
                <div>
                  <p className="text-sm font-extrabold text-[#26333A]">{step}</p>
                  <p className="mt-1 text-sm leading-6 text-[#66747A]">{detail}</p>
                </div>
              </li>
            ))}
          </ol>
        </section>

        <section className="rounded-[32px] border border-[#DCEEF5] bg-white/90 p-6 shadow-[0_18px_48px_rgba(38,51,58,0.06)]">
          <h2 className="text-lg font-extrabold tracking-[-0.025em] text-[#26333A]">FAQ</h2>
          <dl className="mt-5 space-y-5">
            {faqs.map(({ id, q, a }) => (
              <div key={q} id={id} className={id ? 'scroll-mt-24' : undefined}>
                <dt className="text-sm font-extrabold text-[#26333A]">{q}</dt>
                <dd className="mt-1 text-sm leading-6 text-[#66747A]">{a}</dd>
              </div>
            ))}
          </dl>
        </section>
      </div>
    </div>
  )
}
