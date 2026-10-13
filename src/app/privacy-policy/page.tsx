import type { Metadata } from 'next'
import Link from 'next/link'
import { ShieldCheck, ArrowLeft } from 'lucide-react'

// Public-facing privacy notice for /privacy-policy.
//
// Internal review markers (the old [PLACEHOLDER]/[CONFIRM] chips) were
// deliberately removed: a published notice must read as a clean policy, and
// unresolved questions do not belong in the patient-facing UI. They are
// tracked off-page in PRIVACY_REVIEW_CHECKLIST.md and must be settled before
// the policy is treated as finally approved. Do not reintroduce review text,
// badges, or coloured boxes into this page.
//
// Statements below are limited to what the application actually does
// (see src/app/api, src/lib, mysql/schema.sql). Nothing here invents a
// retention period, an encryption claim, a backup schedule, a legal approval,
// or a data-sharing arrangement.

export const metadata: Metadata = {
  title: 'Privacy Policy',
  description:
    'How the Bacolod City Health Office Laboratory Appointment System collects, uses, and protects your personal information under Republic Act No. 10173.',
}

function Section({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section id={id} className="scroll-mt-24">
      <h2 className="text-lg sm:text-xl font-bold text-slate-900 tracking-tight mb-3">
        {title}
      </h2>
      <div className="space-y-3 text-[15px] leading-relaxed text-left hyphens-none text-slate-700">{children}</div>
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
            Effective{' '}
            <time dateTime="2026-09-13">September 13, 2026</time>
            {' '}&middot;{' '}Last updated <time dateTime="2026-10-14">October 14, 2026</time>
          </p>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 sm:px-6 pb-16">
        <div className="mt-6 bg-white rounded-3xl border border-slate-200 shadow-[0_1px_3px_rgba(15,23,42,0.06)] p-5 sm:p-8 space-y-9">
          <Section id="purpose" title="1. Purpose of this system">
            <p>
              The Bacolod City Health Office (CHO) Laboratory Appointment System lets
              residents book laboratory appointments online, lets staff register
              walk-in patients, manages daily laboratory capacity, and verifies
              arrivals through a QR code at the laboratory. The system exists to
              reduce queues, schedule patients fairly, and support the City Health
              Office in delivering laboratory services.
            </p>
            <p>
              This Privacy Policy explains what personal information is collected when
              you use this system, why it is collected, how it is protected, and what
              rights you have under Republic Act No. 10173 (the Philippine Data Privacy
              Act of 2012) and its implementing rules and regulations.
            </p>
            <p>
              The City Government of Bacolod is the Personal Information Controller
              for personal information processed through this system, and the City
              Health Office is the service office that operates it.
            </p>
          </Section>

          <Section id="collected" title="2. Personal information we collect">
            <p>When you book an appointment, the system asks for:</p>
            <ul className="list-disc pl-5 space-y-1.5">
              <li>Full name (last name, first name, middle name, if any)</li>
              <li>Date of birth (your age is derived from it)</li>
              <li>Contact number</li>
              <li>Health facility where you were consulted</li>
              <li>PhilHealth YAKAP registration status and, if registered, the YAKAP facility</li>
              <li>Laboratory tests you are requesting</li>
              <li>Your preferred appointment date</li>
            </ul>
            <p>
              When you are assisted in person, authorized staff enter the same
              information into the staff dashboard to create your appointment record.
              The record also stores the appointment status, whether it was booked
              online or registered as a walk-in, the date the record was created, and
              the time you checked in.
            </p>
            <p>
              The system generates an appointment identifier and QR code used to verify
              your arrival. The QR code contains only that appointment identifier.
            </p>
            <p>
              Staff members who use the administrative dashboard provide an e-mail
              address and a password. Only a hashed form of the password is stored, and
              the staff member&apos;s e-mail address is also recorded when they block a
              laboratory date, as an audit trail.
            </p>
            <p>
              Basic technical and security information may also be processed when you
              use the system, such as your internet protocol (IP) address, the time of
              the request, and error details, for example in the operational logs used
              to keep the service available and secure. Your IP address is used for
              rate limiting, abuse prevention, and human verification; it is not
              written into your appointment record.
            </p>
            <p className="text-slate-600">
              The system does <span className="font-semibold">not</span> collect an
              e-mail address, home address, barangay, civil status, government or
              PhilHealth ID number, medical records, or the results of any laboratory
              test. It does not ask for payment details.
            </p>
          </Section>

          <Section id="sensitive" title="3. Sensitive personal information">
            <p>
              Information about the laboratory tests you request, together with your
              date of birth, YAKAP status, and the facility where you were consulted,
              may constitute sensitive personal information because they relate to your
              health. Sensitive information receives a higher level of protection
              under the Data Privacy Act.
            </p>
            <p>
              Only the information needed to schedule, deliver, and account for your
              laboratory visit is collected. The system records which tests you
              request; it does not store test results, diagnoses, prescriptions, or
              other medical records. Please do not put medical records or other health
              details into the name fields, because they are not designed to hold that
              kind of information.
            </p>
          </Section>

          <Section id="basis" title="4. Purposes and lawful basis of processing">
            <p>We process your information to:</p>
            <ul className="list-disc pl-5 space-y-1.5">
              <li>Create and manage your laboratory appointment, online or walk-in;</li>
              <li>Allocate daily laboratory capacity fairly among patients;</li>
              <li>Verify your identity and appointment at the laboratory using the QR code;</li>
              <li>Allow staff to reach you by telephone about your appointment, if needed;</li>
              <li>Generate de-identified counts and reports for laboratory planning and administration;</li>
              <li>Protect the system against spam, abuse, and unauthorized access; and</li>
              <li>
                Meet legal, records-management, audit, and reporting duties that apply
                to the City Health Office.
              </li>
            </ul>
            <p>
              The City Health Office processes this information as part of its mandate
              to deliver public health services. Processing is therefore generally based
              on the performance of a function vested in the City Health Office by law,
              on compliance with a legal obligation, or on matters of public interest,
              rather than on your consent alone. Because the system also processes
              sensitive personal information, the condition for processing sensitive
              information under Section 13 of the Data Privacy Act must likewise be
              established for each activity. Where a specific consent is later
              determined to be required, it will be sought separately.
            </p>
          </Section>

          <Section id="use" title="5. How your information is used">
            <p>
              Your information is used only for the appointment process described
              above: booking, walk-in registration, scheduling, capacity management,
              arrival verification, and administration of the laboratory service.
              Booking statistics shown to the public (for example, how many slots
              remain for a test) are aggregated counts and do not identify any patient.
            </p>
            <p>
              This system does not sell, rent, or trade your personal information. It
              is not used for advertising, marketing, credit scoring, or profiling,
              and it does not send e-mail or SMS notifications.
            </p>
          </Section>

          <Section id="access" title="6. Who may access your information">
            <p>
              Access is limited to authorized City Health Office personnel who need it
              to perform their duties, including laboratory and administrative staff who
              manage appointments and check-ins, and information technology personnel
              who maintain the system. Every staff member signs in with an individual
              account protected by a hashed password and an expiring, httpOnly session
              cookie that is deleted when the staff member signs out. The application
              has a single staff access level: any signed-in staff member can view,
              edit, correct, check in, export, and delete appointment records.
            </p>
            <p>
              Authorized staff can also export appointment lists from the staff
              dashboard, for example as a spreadsheet file downloaded to their own
              device. Such copies remain subject to the City&rsquo;s rules on official
              records and confidentiality.
            </p>
            <p>
              Information may also be disclosed when required by law, valid legal
              process, or the lawful directives of competent authority.
            </p>
            <p>
              Other than the recipients and service providers described in this policy,
              your information is not disclosed to other offices, agencies, or service
              providers through this system.
            </p>
          </Section>

          <Section id="storage" title="7. Data storage and security safeguards">
            <p>
              Records are stored in a MySQL database operated for the City Health
              Office on a server managed in coordination with the City&rsquo;s
              information technology personnel. The database is not published to the
              internet; the website talks to it through the application only.
              The site is served over HTTPS.
            </p>
            <p>The application applies the following safeguards, among others:</p>
            <ul className="list-disc pl-5 space-y-1.5">
              <li>Encrypted connections (HTTPS) between your browser and the server;</li>
              <li>
                Security headers, including HTTP Strict Transport Security, a content
                security policy that restricts which scripts may run, clickjacking
                protection, and a policy that disables browser features the system
                does not need;
              </li>
              <li>Parameterized database queries, so input can never alter database commands;</li>
              <li>Server-side validation of every booking and administrative request;</li>
              <li>
                Hashed staff passwords (scrypt) and opaque, expiring session tokens
                stored only in hashed form, in a cookie that page scripts cannot read;
              </li>
              <li>Rate limiting on login and booking endpoints to slow automated abuse; and</li>
              <li>Human verification (Cloudflare Turnstile) on public booking.</li>
            </ul>
            <p>
              No Internet transmission or storage system can be guaranteed to be
              completely secure. This notice describes the safeguards implemented in
              the application itself. It does not claim additional protections, such as
              encryption of the database at rest or a specific intrusion-prevention
              product, that have not been verified for this service. If a personal data
              breach requiring
              notification occurs, the City Health Office will handle it in accordance
              with the Data Privacy Act and National Privacy Commission requirements.
            </p>
          </Section>

          <Section id="cookies" title="8. Cookies and browser storage">
            <p>
              This system does not use advertising, analytics, or marketing cookies,
              and it does not track you across other websites.
            </p>
            <p>
              The only cookie it sets is the staff sign-in session cookie, which is
              httpOnly (page scripts cannot read it), sent only over HTTPS in
              production, and expires automatically. It exists solely to keep a staff
              member signed in and is removed on sign-out.
            </p>
            <p>
              The page also keeps a small technical marker in your browser&rsquo;s
              session storage so that it can recover once from a script that fails to
              load instead of reloading repeatedly. The marker contains no personal
              information, is visible only to your current browser tab, and is not
              used to track you.
            </p>
          </Section>

          <Section id="thirdparties" title="9. Third-party services and disclosure">
            <p>
              The public booking form uses one external service:{' '}
              <span className="font-semibold">Cloudflare Turnstile</span>, which checks
              that a submission comes from a person rather than a bot. To do this, your
              browser loads a widget from{' '}
              <span className="font-mono text-[13px]">challenges.cloudflare.com</span>,
              and the application sends the resulting verification token, together with
              your IP address, to Cloudflare for verification. Cloudflare may therefore
              process that technical request information under its own terms.
            </p>
            <p>
              The typeface used on this site (Inter) is downloaded when the site is
              built and is served from this site&rsquo;s own servers, so your browser
              does not contact a font service when you open a page.
            </p>
            <p>
              No analytics, advertising, or marketing service is used by this system,
              and no other external service receives your personal information through
              it.
            </p>
            <p>
              This site may link to other websites, such as the National Privacy
              Commission. Those destinations have their own privacy notices, which you
              should review before giving them any personal information.
            </p>
          </Section>

          <Section id="retention" title="10. Retention and secure disposal">
            <p>
              Personal information must not be kept indefinitely without a lawful
              purpose. Records are kept only for as long as needed for the purposes
              stated in this policy, for the retention period required of the City
              Health Office&rsquo;s records, or for legal, audit, and records-management
              obligations. When that period ends, records are securely disposed of,
              anonymized, or archived under applicable government procedures.
            </p>
            <p>
              The application itself has no automated job that purges records:
              appointment records are removed only when authorized staff delete them
              through the staff dashboard. Technical sign-in session records are deleted
              automatically when they expire or when a staff member signs out, and
              rate-limit counters are held only in the server&rsquo;s memory and cleared
              when it restarts.
            </p>
            <p>
              A specific retention period for appointment records, staff account
              records, audit records, and database backups has not yet been published
              for this system. Until the City Health Office and the City&rsquo;s
              records-management personnel issue the applicable schedule, records are
              kept only for as long as the purposes stated in this policy require.
            </p>
          </Section>

          <Section id="incidents" title="11. Security incidents and personal data breaches">
            <p>
              If you believe there has been unauthorized access to, disclosure of, loss
              of, or damage to personal information held by this system, report it
              promptly to the City Health Office using the contact details in
              Section 13, or to the City Government&apos;s Data Protection Officer.
            </p>
            <p>
              The responsible offices assess and handle incidents under the City&rsquo;s
              incident-response and breach-management procedures and comply with any
              applicable National Privacy Commission and data-subject notification
              requirements.
            </p>
            <p className="text-sm text-slate-600">
              Please do not include patient details in public bug reports, ordinary
              chat messages, or unsecured screenshots.
            </p>
          </Section>

          <Section id="rights" title="12. Your rights as a data subject">
            <p>
              Under the Data Privacy Act of 2012, you have the right to be informed
              about how your information is processed; to access your personal data; to
              object to processing; to have inaccurate data corrected; to have data
              erased or blocked where the law provides; to data portability where
              applicable; to claim damages for violations; and to complain to the
              National Privacy Commission (NPC).
            </p>
            <p>
              To exercise these rights, contact the City Health Office using the
              details in Section 13. The office may ask for reasonable proof of
              identity before acting on a request. Some requests may be limited by
              legal duties to preserve official health or government records. If a
              request cannot be resolved internally, you may file a complaint with the
              National Privacy Commission at{' '}
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

          <Section id="contact" title="13. Contact details and complaints">
            <p className="font-semibold text-slate-900">
              Personal Information Controller
            </p>
            <p>
              City Government of Bacolod
              <br />
              Bacolod Government Center, Negros Occidental, Philippines
            </p>
            <p className="font-semibold text-slate-900">
              Responsible service office
            </p>
            <p>
              City Health Office (CHO), Bacolod City
              <br />
              Bacolod City, Negros Occidental, Philippines
              <br />
              Telephone: <a href="tel:+63344313673" className="text-sky-700 font-semibold underline underline-offset-2 hover:text-sky-900">+63 34 431 3673</a>
            </p>
            <p className="font-semibold text-slate-900">
              Data Protection Officer
            </p>
            <p>
              The City Government of Bacolod publishes the following privacy contact on
              its website:
              <br />
              <span className="font-semibold text-slate-900">Atty. Karol Joseph Chiu</span>
              <br />
              Data Protection Officer, City Government of Bacolod
              <br />
              E-mail:{' '}
              <a
                href="mailto:dataprotectionofficer@bacolodcity.gov.ph"
                className="text-sky-700 font-semibold underline underline-offset-2 hover:text-sky-900 break-all"
              >
                dataprotectionofficer@bacolodcity.gov.ph
              </a>
            </p>
            <p>
              If you believe your privacy rights have been violated, you may also seek
              guidance from or lodge a complaint with the National Privacy Commission
              through its official channels at{' '}
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

          <Section id="updates" title="14. Changes to this policy">
            <p>
              This policy may be updated from time to time to reflect changes in the
              system, the City Health Office&rsquo;s practices, or the law. The
              current version will always be posted on this page together with its
              date of last update. Material changes will be reviewed through the
              City&rsquo;s approved privacy and governance process and announced
              through the channels the City Health Office uses for public information.
            </p>
          </Section>

          <Section id="effectivity" title="15. Effectivity">
            <p>
              This policy takes effect on{' '}
              <time dateTime="2026-09-13">September 13, 2026</time>.
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
