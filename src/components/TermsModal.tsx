/**
 * Scrollable Terms & Conditions modal, opened from the signup agreement
 * checkbox. A modal (not a route) so the half-filled signup form is preserved.
 * Backdrop tap or Close dismisses it. Layered above other content (z-[2000]),
 * matching the app's other modals.
 *
 * NOTE: this is starter/placeholder copy describing MotoQueue's actual model
 * (a dispatch layer over TODA-franchised drivers, ₱30/mo subscription, cash
 * fares). Have it reviewed and finalized by the operator / legal counsel before
 * launch — it is not legal advice.
 */
export function TermsModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  if (!open) return null

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Terms and Conditions"
      className="fixed inset-0 z-[2000] flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
    >
      <div
        className="flex max-h-[85vh] w-full max-w-md flex-col rounded-2xl bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="border-b px-5 py-4">
          <h2 className="text-lg font-bold text-gray-800">Terms &amp; Conditions</h2>
          <p className="text-xs text-gray-400">MotoQueue · Effective July 2026</p>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4 text-sm leading-relaxed text-gray-600">
          <section>
            <h3 className="font-semibold text-gray-800">1. About MotoQueue</h3>
            <p>
              MotoQueue is a dispatch platform that connects commuters with TODA-franchised
              tricycle and motorcycle drivers within the subdivision. MotoQueue is not a
              transport operator and does not provide rides itself — rides are provided by
              independent, franchised drivers.
            </p>
          </section>

          <section>
            <h3 className="font-semibold text-gray-800">2. Eligibility &amp; account</h3>
            <p>
              You must provide accurate information and may hold only one account, identified by
              your phone number. Keep your device secure — you are responsible for activity on
              your account. Only one device may be signed in at a time; logging in elsewhere
              signs out the previous device.
            </p>
          </section>

          <section>
            <h3 className="font-semibold text-gray-800">3. Subscription &amp; fares</h3>
            <p>
              Access to booking requires an active subscription (₱30 per month). Ride fares are
              agreed between the rider and driver and paid in cash; MotoQueue does not process
              or collect ride payments. Subscription fees are non-refundable except where
              required by law.
            </p>
          </section>

          <section>
            <h3 className="font-semibold text-gray-800">4. Conduct</h3>
            <p>
              Use MotoQueue lawfully and respectfully. Provide accurate pickup and destination
              details, do not harass other users, and do not misuse the service. Abuse may lead
              to suspension.
            </p>
          </section>

          <section>
            <h3 className="font-semibold text-gray-800">5. Rides &amp; safety</h3>
            <p>
              Drivers are independent franchise holders responsible for their own vehicles and
              compliance with traffic laws. Wear a helmet and follow safety rules. MotoQueue is
              only a dispatch facilitator and is not responsible for the conduct, acts, or
              omissions of drivers or riders. You use the service at your own risk.
            </p>
          </section>

          <section>
            <h3 className="font-semibold text-gray-800">6. Cancellations</h3>
            <p>
              Either party may cancel a ride through the in-app flow. Repeated or abusive
              cancellations may result in account suspension.
            </p>
          </section>

          <section>
            <h3 className="font-semibold text-gray-800">7. Data &amp; privacy</h3>
            <p>
              We collect your name, phone number, location during active rides, and ride history
              to operate the service. Location is used only to match you with a driver and to
              track an active ride. We do not sell your personal data.
            </p>
          </section>

          <section>
            <h3 className="font-semibold text-gray-800">8. Limitation of liability</h3>
            <p>
              The service is provided “as is.” To the maximum extent permitted by law, MotoQueue
              is not liable for indirect or consequential damages, service interruptions, or the
              acts of drivers or riders.
            </p>
          </section>

          <section>
            <h3 className="font-semibold text-gray-800">9. Changes to these terms</h3>
            <p>
              We may update these terms from time to time. Continued use of MotoQueue after an
              update means you accept the revised terms.
            </p>
          </section>
        </div>

        <div className="border-t px-5 py-4">
          <button
            type="button"
            onClick={onClose}
            className="w-full rounded-lg bg-brand py-2.5 font-semibold text-white transition hover:bg-brand-dark"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  )
}
