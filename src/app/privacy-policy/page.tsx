import type { Metadata } from 'next'
import Link from 'next/link'
import { ShieldCheck, ArrowLeft } from 'lucide-react'

// ============================================================================
// REVIEW NOTE — placeholders that must be confirmed by the City Health Office
// (CHO) or its authorized privacy personnel BEFORE production publication.
// Each one appears below between square brackets, e.g. [PLACEHOLDER — ...].
//
//  1. Data Protection Officer (DPO) / privacy contact — full name and position
//  2. Privacy inquiry e-mail address
//  3. Privacy / CHO telephone number
//  4. Full postal address of the City Health Office (street/building details)
//  5. Exact retention period for appointment records and how disposal is done
//  6. Any authorized data-sharing or disclosure arrangements beyond what the
//     law already requires (currently stated as none — confirm)
//  7. Date of effectivity once approved by the CHO
//
// Do not publish this page with any of these brackets unresolved. Filling a
// bracket with invented information is worse than leaving it marked.
// ============================================================================

export const metadata: Metadata = {
  title: 'Privacy Policy',
  description:
    'How the Bacolod City Health Office Laboratory Appointment System collects, uses, and protects your personal information — Republic Act No. 10173.',
}

function Placeholder({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-block rounded-md bg-amber-50 border border-amber-300 px-1.5 py-0.5 text-[13px] font-semibold text-amber-900">
      {children}
    </span>
  )
}

function Section({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section id={id} className="scroll-mt-24">
      <h2 className="text-lg sm:text-xl font-bold text-slate-900 tracking-tight mb-3">
        {title}
      </h2>
      <div className="space-y-3 text-[15px] leading-relaxed text-slate-700">{children}</div>
    </section>
  )
}

export default function PrivacyPolicyPage() {
  return (
    <div className="min-h-screen bg-slate-50">
      <header className="relative overflow-hidden bg-gradient-to-br from-sky-950 via-sky-800 to-cyan-700 text-white">
        <div className="absolute inset-0 bg-dot-grid" />
        <div className="absolute -top-24 -left-24 w-72 h-72 bg-cyan-400/25 rounded-full blur-3xl" />
        <div className="relative max-w-3xl mx-auto px-4 sm:px-6 pt-10 sm:pt-12 pb-8 sm:pb-10 text-center">
          <p className="inline-flex items-center gap-1.5 text-[11px] sm:text-xs font-semibold uppercase tracking-[0.18em] text-cyan-200 bg-white/10 border border-white/15 rounded-full px-3.5 py-1.5">
            City Health Office &middot; Bacolod City
          </p>
          <div className="mx-auto w-14 h-14 rounded-2xl bg-white/15 backdrop-blur border border-white/20 flex items-center justify-center mt-5 mb-4 shadow-xl">
            <ShieldCheck className="w-7 h-7" />
          </div>
          <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight drop-shadow-sm">
            Privacy Policy
          </h1>
          <p className="mt-3 text-sm sm:text-base text-cyan-50/90 max-w-xl mx-auto">
            CHO Laboratory Appointment System &middot; Republic Act No. 10173,
            the Data Privacy Act of 2012
          </p>
          <p className="mt-4 text-xs text-cyan-100/80">
            Last updated:{' '}
            <time dateTime="2026-10-11">October 11, 2026</time> (draft &mdash; pending
            review and approval by the City Health Office)
          </p>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 sm:px-6 pb-16">
        <div className="mt-6 bg-white rounded-3xl border border-slate-200 shadow-[0_1px_3px_rgba(15,23,42,0.06)] p-5 sm:p-8 space-y-9">
          <Section id="purpose" title="1. Purpose of this system">
            <p>
              The Bacolod City Health Office (CHO) Laboratory Appointment System lets
              residents book laboratory appointments online, manage daily laboratory
              capacity, and verify arrivals through a QR code at the laboratory. The
              system exists to reduce queues, schedule patients fairly, and support the
              City Health Office in delivering laboratory services.
            </p>
            <p>
              This Privacy Policy explains what personal information is collected when
              you use this system, why it is collected, how it is protected, and what
              rights you have under Republic Act No. 10173 (the Philippine Data Privacy
              Act of 2012) and its implementing rules and regulations.
            </p>
          </Section>

          <Section id="collected" title="2. Personal information we collect">
            <p>When you book an appointment, the system asks for:</p>
            <ul className="list-disc pl-5 space-y-1.5">
              <li>Full name (last name, first name, middle name, if any)</li>
              <li>Date of birth</li>
              <li>Contact number</li>
              <li>Health facility where you were consulted</li>
              <li>PhilHealth YAKAP registration status and, if registered, the YAKAP facility</li>
              <li>Laboratory tests you are requesting</li>
              <li>Your preferred appointment date</li>
            </ul>
            <p>
              The system also generates an appointment identifier and QR code used to
              verify your arrival. Basic technical information such as your internet
              protocol (IP) address may be processed temporarily for security purposes
              such as rate limiting and abuse prevention.
            </p>
          </Section>

          <Section id="sensitive" title="3. Sensitive personal information">
            <p>
              Information about the laboratory tests you request, together with your
              date of birth and YAKAP status, may constitute sensitive personal
              information because they relate to your health. Sensitive information
              receives a higher level of protection under the Data Privacy Act.
            </p>
            <p>
              Only the information needed to schedule, deliver, and account for your
              laboratory visit is collected. Please do not include medical records or
              other health details in the name or note fields of this system — they are
              not designed to hold that kind of information.
            </p>
          </Section>

          <Section id="basis" title="4. Purposes and lawful basis of processing">
            <p>We process your information to:</p>
            <ul className="list-disc pl-5 space-y-1.5">
              <li>Create and manage your laboratory appointment;</li>
              <li>Allocate daily laboratory capacity fairly among patients;</li>
              <li>Verify your identity and appointment at the laboratory using the QR code;</li>
              <li>Contact you about your appointment, if needed;</li>
              <li>Generate de-identified counts and reports for laboratory planning and administration; and</li>
              <li>Protect the system against spam, abuse, and unauthorized access.</li>
            </ul>
            <p>
              The City Health Office processes this information as part of its mandate
              to deliver public health services. Processing is therefore generally based
              on the performance of a function vested in the City Health Office by law
              and on legitimate interests related to that function, rather than on your
              consent alone. Where a specific consent is later determined to be
              required, it will be sought separately.{' '}
              <Placeholder>
                [PLACEHOLDER &mdash; lawful basis wording to be confirmed by the CHO or
                its Data Protection Officer]
              </Placeholder>
            </p>
          </Section>

          <Section id="use" title="5. How your information is used">
            <p>
              Your information is used only for the appointment process described
              above: booking, scheduling, capacity management, arrival verification,
              and administration of the laboratory service. Booking statistics shown
              to the public (for example, how many slots remain for a test) are
              aggregated counts and do not identify any patient.
            </p>
            <p>
              This system does not sell, rent, or trade your personal information.
            </p>
          </Section>

          <Section id="access" title="6. Who may access your information">
            <p>
              Access is limited to authorized City Health Office personnel who need it
              to perform their duties, including laboratory and administrative staff who
              manage appointments and check-ins, and information technology personnel
              who maintain the system. Admin accounts are individually issued and
              protected by hashed passwords and expiring session tokens.
            </p>
            <p>
              Information may also be disclosed when required by law, valid legal
              process, or the lawful directives of competent authority.
            </p>
            <p>
              Other authorized recipients or data-sharing arrangements:{' '}
              <Placeholder>
                [PLACEHOLDER &mdash; confirm with CHO whether any other offices or
                agencies receive this data; if none, state &ldquo;none&rdquo;]
              </Placeholder>
            </p>
          </Section>

          <Section id="storage" title="7. Data storage and security safeguards">
            <p>
              Records are stored in a MySQL database operated for the City Health
              Office and reachable only by the application server — the website never
              exposes the database directly. The application applies the following
              safeguards, among others:
            </p>
            <ul className="list-disc pl-5 space-y-1.5">
              <li>Encrypted connections (HTTPS) between your browser and the server;</li>
              <li>Parameterized database queries, so input can never alter database commands;</li>
              <li>Server-side validation of every booking and administrative request;</li>
              <li>Hashed admin passwords (scrypt) and opaque, expiring session tokens stored only in hashed form;</li>
              <li>Rate limiting on login and booking endpoints to slow automated abuse; and</li>
              <li>Human verification (Cloudflare Turnstile) on public booking.</li>
            </ul>
            <p>
              No Internet transmission or storage system can be guaranteed to be
              completely secure. If a personal data breach requiring notification
              occurs, the City Health Office will handle it in accordance with the Data
              Privacy Act and National Privacy Commission requirements.
            </p>
          </Section>

          <Section id="retention" title="8. Retention and secure disposal">
            <p>
              Appointment records are kept only for as long as needed for the purposes
              stated in this policy and for the retention period required of the City
              Health Office&rsquo;s records. When the retention period ends, records
              are disposed of securely so they cannot be recovered or reconstructed.
            </p>
            <p>
              Specific retention periods and the disposal method for appointment
              records:{' '}
              <Placeholder>
                [PLACEHOLDER &mdash; exact retention period and disposal practice to be
                confirmed by the CHO]
              </Placeholder>
            </p>
          </Section>

          <Section id="rights" title="9. Your rights as a data subject">
            <p>
              Under the Data Privacy Act of 2012, you have the right to be informed
              about how your information is processed; to object to processing; to
              access your personal data; to have inaccurate data corrected; to data
              portability where applicable; to claim damages for violations; and to
              complain to the National Privacy Commission (NPC).
            </p>
            <p>
              To exercise these rights, contact the City Health Office using the
              details in Section 10. The office may ask for reasonable proof of
              identity before acting on a request. If a request cannot be resolved
              internally, you may file a complaint with the National Privacy
              Commission at{' '}
              <a
                href="https://privacy.gov.ph"
                target="_blank"
                rel="noopener noreferrer"
                className="text-sky-700 font-semibold underline underline-offset-2 hover:text-sky-900"
              >
                privacy.gov.ph
              </a>
              .
            </p>
          </Section>

          <Section id="contact" title="10. Contact details">
            <p className="font-semibold text-slate-900">
              City Health Office (CHO) &mdash; Bacolod City
            </p>
            <p>
              Address:{' '}
              <Placeholder>
                [PLACEHOLDER &mdash; full official postal address of the CHO to be
                confirmed]
              </Placeholder>
              <br />
              (Bacolod City, Negros Occidental)
            </p>
            <p>
              Data Protection Officer / authorized privacy contact:{' '}
              <Placeholder>
                [PLACEHOLDER &mdash; name and position of the DPO or privacy contact to
                be confirmed]
              </Placeholder>
              <br />
              E-mail:{' '}
              <Placeholder>
                [PLACEHOLDER &mdash; official privacy e-mail address to be confirmed]
              </Placeholder>
              <br />
              Telephone:{' '}
              <Placeholder>
                [PLACEHOLDER &mdash; official contact number to be confirmed]
              </Placeholder>
            </p>
          </Section>

          <Section id="updates" title="11. Changes to this policy">
            <p>
              This policy may be updated from time to time to reflect changes in the
              system, the City Health Office&rsquo;s practices, or the law. The
              current version will always be posted on this page together with its
              date of last update. Material changes will be announced through the
              channels the City Health Office uses for public information.
            </p>
          </Section>

          <Section id="effectivity" title="12. Effectivity">
            <p>
              This policy takes effect upon approval by the City Health Office and
              publication on this website:{' '}
              <Placeholder>
                [PLACEHOLDER &mdash; date of effectivity after CHO approval]
              </Placeholder>
              .
            </p>
            <p className="text-sm text-slate-500 italic">
              Note: publishing this policy supports transparency under Republic Act
              No. 10173. It does not, by itself, certify that every requirement of the
              Act and its implementing rules has been fully complied with; that
              assessment remains with the City Health Office and its authorized privacy
              personnel.
            </p>
          </Section>

          <div className="pt-2 border-t border-slate-100">
            <Link
              href="/"
              className="inline-flex items-center gap-1.5 text-sm font-semibold text-sky-700 hover:text-sky-900 underline-offset-2 hover:underline"
            >
              <ArrowLeft className="w-4 h-4" />
              Back to appointment booking
            </Link>
          </div>
        </div>
      </main>
    </div>
  )
}
