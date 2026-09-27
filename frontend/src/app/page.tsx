import { ApiStatus } from '@/components/api-status';

const foundations = [
  'Next.js and TypeScript frontend',
  'Express and TypeScript API',
  'MySQL-ready architecture',
];

export default function Home() {
  return (
    <main className="min-h-screen bg-page text-body">
      <header className="border-b border-default bg-navbar">
        <div className="mx-auto flex w-full max-w-[1600px] items-center justify-between px-5 py-4 sm:px-8 lg:px-12">
          <a
            className="text-xl font-bold tracking-tight text-heading"
            href="#top"
          >
            PRODORA
          </a>
          <span className="rounded-full border border-primary-border bg-primary-soft px-3 py-1 text-xs font-semibold text-primary">
            Foundation phase
          </span>
        </div>
      </header>

      <section
        id="top"
        className="mx-auto grid w-full max-w-[1600px] gap-10 px-5 py-14 sm:px-8 sm:py-20 lg:grid-cols-[minmax(0,1.25fr)_minmax(320px,0.75fr)] lg:items-center lg:px-12 lg:py-28"
      >
        <div className="max-w-3xl">
          <p className="mb-4 text-sm font-semibold uppercase tracking-[0.18em] text-primary">
            Digital Product Lifecycle Passport
          </p>
          <h1 className="text-balance text-4xl font-bold leading-tight tracking-[-0.035em] text-heading sm:text-5xl lg:text-6xl">
            Trustworthy post-sale laptop records, supported by evidence.
          </h1>
          <p className="mt-6 max-w-2xl text-base leading-7 text-secondary sm:text-lg sm:leading-8">
            Prodora is a technical prototype emerging from secondary research
            into evidence-based trust evaluation for product lifecycle data.
          </p>

          <div className="mt-9 flex flex-wrap gap-3">
            {foundations.map((foundation) => (
              <span
                className="rounded-lg border border-default bg-card px-3 py-2 text-sm text-body shadow-sm"
                key={foundation}
              >
                {foundation}
              </span>
            ))}
          </div>
        </div>

        <aside className="rounded-2xl border border-default bg-card p-6 shadow-[0_18px_60px_rgba(37,33,34,0.08)] sm:p-8">
          <div className="mb-6 flex items-start justify-between gap-4">
            <div>
              <p className="text-sm font-semibold text-primary">
                Development status
              </p>
              <h2 className="mt-1 text-2xl font-semibold text-heading">
                Foundation in progress
              </h2>
            </div>
            <span
              className="mt-1 h-3 w-3 shrink-0 rounded-full bg-warning"
              aria-hidden="true"
            />
          </div>
          <p className="leading-7 text-secondary">
            The project workspace and application foundations are being
            established. Product features will be added only in their approved
            phases.
          </p>
          <div className="my-6 h-px bg-divider" />
          <ApiStatus />
        </aside>
      </section>

      <footer className="border-t border-divider px-5 py-6 text-center text-sm text-muted sm:px-8">
        Proposed technical solution supporting the MCA secondary-research study.
      </footer>
    </main>
  );
}
