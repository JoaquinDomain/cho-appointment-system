# Privacy Policy — Outstanding Confirmations (internal)

Companion to `src/app/privacy-policy/page.tsx` (`/privacy-policy`).
**This file is not rendered to patients.** The published page deliberately
contains no `[PLACEHOLDER]`, `[CONFIRM]`, badges, or coloured review boxes; the
open questions below are tracked here instead.

Status: content finalized for review — **not** an approved policy until the City
Health Office (CHO) and the City Government's Data Protection Officer (DPO)
confirm the items marked **CHO** / **DPO**.

## Supplied and used as-is

| Item | Value used in the page |
| --- | --- |
| Office | City Health Office (CHO), Bacolod City |
| Telephone | +63 34 431 3673 |
| Policy effectivity date | September 13, 2026 |
| Last updated | October 14, 2026 |
| DPO (public) | Atty. Karol Joseph Chiu, `dataprotectionofficer@bacolodcity.gov.ph` — reproduced from the City Government privacy notice, worded as the City's published contact only; **no approval by the DPO is claimed anywhere on the page.** |

## Open items before the policy is treated as approved

1. **Official service name — CHO.** The page says "CHO Laboratory Appointment
   System". Internal drafts called it an "Appointment & Enrollment System"; no
   enrollment workflow exists in the code, so the page describes appointment
   booking and walk-in registration only.
2. **Personal Information Controller designation — DPO.** The page states the
   City Government of Bacolod is the PIC. The City's published notice states its
   controller clause for the *Bacolod G App* / City website, not for this system.
   Confirm the designation covers this service, and whether CHO must be named
   separately.
3. **DPO channel — DPO.** Confirm `dataprotectionofficer@bacolodcity.gov.ph` is
   the correct channel for requests concerning this system, and confirm whether
   the DPO approves this policy (the page does not claim approval).
   The City notice also lists an office (City Legal Office) that the page omits —
   add it only if confirmed.
4. **CHO postal address — CHO.** Page shows "Bacolod City, Negros Occidental,
   Philippines" only. Add street/building if the office has an official address.
5. **Telephone +63 34 431 3673 — CHO.** Confirm this is the correct public line
   for privacy requests (the City switchboard numbers were removed).
6. **Effectivity date September 13, 2026 — CHO/DPO.** Confirm this is the
   approved date; the page also shows "Last updated: October 14, 2026".
7. **Lawful basis wording — DPO/legal.** Section 4 states public-interest /
   legal-obligation bases and the Section 13 Data Privacy Act condition for
   sensitive personal information. No documented DPO/legal approval of this
   wording exists in the repository.
8. **Retention schedule — CHO + records management + DPO.** Page states, and the
   code confirms, that there is **no automated purge job** and **no published
   retention period**. Issue the schedule and disposal method for appointment,
   staff-account, audit, and backup records, then replace that sentence.
9. **Data recipients — CHO/DPO.** Page states no other offices, agencies, or
   service providers receive data through the system beyond those described.
   Confirm there is no off-system sharing or data-sharing agreement.
10. **Cloudflare Turnstile — DPO + technical.** Page describes the widget origin,
    token verification, and IP transmission. Confirm the data flow, lawful basis,
    and provider terms.
11. **Server logging — technical.** Page claims only that IP/timestamps/error
    details are processed (e.g. in operational logs) and that IP is used for rate
    limiting, Turnstile verification, and is **not** stored in the appointment
    record. Confirm what web-server access/error logs actually contain and how
    long they are kept; adjust Section 2 if needed.
12. **Backups — technical + records management.** `DEPLOY.md` documents a nightly
    `mysqldump` cron. The page mentions backups only as "records … and database
    backups" with no period. Decide whether to disclose the backup arrangement
    and on what retention.
13. **Incident reporting — CHO/DPO.** Page directs reports to the CHO/DPO
    contacts in Section 13. Confirm the City's formal incident-reporting and
    breach-response channel and name it if it differs.
14. **Staff roles and access review — CHO.** Page states a single staff access
    level (any signed-in staff member can view, edit, check in, export, and
    delete records) — accurate to `requireAdmin` in the code. Confirm this is the
    approved model, that all account holders are authorized, and whether
    clearance/access-review requirements apply.

## Statements the page makes because they are verifiable in code

- Fields collected: name parts, birthdate/age, contact number, consultation
  facility, YAKAP status/facility, requested tests, appointment date, status,
  source, check-in time, created time (`mysql/schema.sql`, `src/lib/validation.ts`).
- Not collected: e-mail, address, barangay, civil status, ID numbers, test
  results, medical records, payment details.
- Staff contact with patients is **by telephone only** — the app sends no e-mail
  or SMS.
- Security: HTTPS, security headers/CSP (`next.config.ts`), parameterized
  queries, scrypt password hashing, hashed expiring session tokens in an
  httpOnly cookie, rate limiting, Turnstile (`src/lib`).
- Cookies/storage: only the `cho_admin_session` cookie and a one-shot
  `sessionStorage` reload marker (`src/app/layout.tsx`); no analytics or
  tracking.
- No encryption-at-rest, backup-schedule, or third-party analytics claim is made,
  because none is verified.
