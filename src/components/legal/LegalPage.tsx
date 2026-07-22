interface LegalSection {
  title: string
  paragraphs: string[]
}

interface Props {
  eyebrow: string
  title: string
  intro: string
  effectiveDate: string
  sections: LegalSection[]
}

export function LegalPage({ eyebrow, title, intro, effectiveDate, sections }: Props) {
  return (
    <main className="min-h-screen bg-[#FBFBF8] py-10 text-[#26333A]">
      <div className="mx-auto max-w-4xl px-4">
<div className="mb-8">
          <p className="text-sm font-extrabold uppercase tracking-[0.14em] text-[#3F7C85]">{eyebrow}</p>
          <h1 className="mt-2 text-4xl font-extrabold tracking-[-0.045em] text-[#26333A]">{title}</h1>
          <p className="mt-3 max-w-3xl text-base leading-7 text-[#66747A]">{intro}</p>
        </div>

        <section className="rounded-[32px] border border-[#DCEEF5] bg-white/90 p-7 shadow-[0_18px_48px_rgba(38,51,58,0.06)]">
          <div className="mb-8 rounded-[24px] bg-[#FBFBF8] px-5 py-4">
            <p className="text-sm font-semibold text-[#26333A]">Entity</p>
            <p className="mt-1 text-sm leading-6 text-[#66747A]">
              GLASGOW, JASMINE LEIGH, sole trader, ABN 67 730 170 835
            </p>
            <p className="mt-3 text-sm font-semibold text-[#26333A]">Contact</p>
            <p className="mt-1 text-sm leading-6 text-[#66747A]">contact@timetranslator.com.au</p>
            <p className="mt-3 text-sm font-semibold text-[#26333A]">Effective date</p>
            <p className="mt-1 text-sm leading-6 text-[#66747A]">{effectiveDate}</p>
          </div>

          <div className="space-y-8">
            {sections.map(section => (
              <section key={section.title}>
                <h2 className="text-xl font-extrabold tracking-[-0.025em] text-[#26333A]">{section.title}</h2>
                <div className="mt-3 space-y-4">
                  {section.paragraphs.map(paragraph => (
                    <p key={paragraph} className="text-sm leading-7 text-[#66747A]">
                      {paragraph}
                    </p>
                  ))}
                </div>
              </section>
            ))}
          </div>
        </section>
      </div>
    </main>
  )
}
