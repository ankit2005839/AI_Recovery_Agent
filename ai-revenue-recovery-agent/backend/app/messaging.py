"""
Hinglish & Localization Voice/SMS Generator.

Produces the exact message text the agent would send/say for a given
intervention, localized to the customer's preferred language and tailored
to their segment (tone shifts for premium/enterprise vs mass-market, and
softens automatically for irate customers). Templates are parameterized,
deterministic, and fully auditable -- exactly what was sent is logged
verbatim in the InterventionLog / audit trail.
"""

from __future__ import annotations

from .models import (
    RecoveryCase, InterventionType, Language, CustomerSegment, Channel,
)


def _first_name(full_name: str) -> str:
    return full_name.split(" ")[0]


def _fmt_amount(amount: float, currency: str = "INR") -> str:
    symbol = "₹" if currency == "INR" else currency + " "
    return f"{symbol}{amount:,.0f}"


def _tone_softener(case: RecoveryCase) -> bool:
    return case.customer.is_irate


TEMPLATES = {
    # ---- FAILED SUBSCRIPTION / CARD RETRY ----
    (InterventionType.SMART_RETRY_SCHEDULED, Language.ENGLISH): lambda c, t: (
        None  # silent, no customer-facing text
    ),
    (InterventionType.UPDATE_PAYMENT_METHOD_LINK, Language.HINGLISH): lambda c, t: (
        f"Hi {_first_name(c.customer.name)}, aapka card ({t.product_name}) expire ho gaya hai "
        f"isliye {_fmt_amount(t.amount, t.currency)} ka payment process nahi ho paya. "
        f"Please apna naya card yahan update karein: pay.example.com/update/{c.case_id[-6:]} "
        f"— 2 minute ka kaam hai. Koi dikkat ho toh reply karein."
    ),
    (InterventionType.UPDATE_PAYMENT_METHOD_LINK, Language.ENGLISH): lambda c, t: (
        f"Hi {_first_name(c.customer.name)}, we couldn't process your {_fmt_amount(t.amount, t.currency)} "
        f"payment for {t.product_name} because your card appears to be expired or invalid. "
        f"Update your payment method securely here: pay.example.com/update/{c.case_id[-6:]}"
    ),
    (InterventionType.HINGLISH_VOICE_CALL, Language.HINGLISH): lambda c, t: (
        f"[VOICE SCRIPT] Namaste {_first_name(c.customer.name)} ji, main aapki "
        f"{t.product_name} service ki taraf se baat kar raha hoon. Humein pata chala ki "
        f"aapka {_fmt_amount(t.amount, t.currency)} ka payment complete nahi ho paaya "
        f"{'— koi baat nahi, aisa hota hai' if _tone_softener(c) else ''}. "
        f"Kya aap chahenge ki hum ise dobara try karein, ya koi aur convenient tareeka batayein? "
        f"Agar abhi possible nahi hai toh aap bata sakte hain kab tak convenient rahega, "
        f"hum us hisaab se ek gentle reminder bhej denge, bas."
    ),
    (InterventionType.HINGLISH_VOICE_CALL, Language.HINDI): lambda c, t: (
        f"[VOICE SCRIPT] Namaste {_first_name(c.customer.name)} ji, aapki {t.product_name} "
        f"ka {_fmt_amount(t.amount, t.currency)} ka bhugtaan safal nahi ho saka. "
        f"Kripya bataiye ki hum dobara prayas karein ya aap khud bhugtaan karna chahenge."
    ),
    (InterventionType.EMAIL_REMINDER, Language.ENGLISH): lambda c, t: (
        f"Subject: Action needed — payment for {t.product_name}\n\n"
        f"Hi {_first_name(c.customer.name)},\n\n"
        f"We noticed your recent payment of {_fmt_amount(t.amount, t.currency)} for "
        f"{t.product_name} didn't go through. "
        f"{'No worries at all — this happens.' if _tone_softener(c) else ''} "
        f"You can complete it anytime here: pay.example.com/retry/{c.case_id[-6:]}. "
        f"If there's a better time for us to check back, just reply and let us know.\n\n"
        f"Thanks,\nTeam Support"
    ),
    (InterventionType.EMAIL_REMINDER, Language.HINGLISH): lambda c, t: (
        f"Subject: {t.product_name} ka payment pending hai\n\n"
        f"Hi {_first_name(c.customer.name)},\n\n"
        f"Aapka {_fmt_amount(t.amount, t.currency)} ka payment abhi tak complete nahi hua hai. "
        f"Yahan se aasani se kar sakte hain: pay.example.com/retry/{c.case_id[-6:]}. "
        f"Koi problem ho toh bas reply kar dijiye, hum madad kar denge.\n\n"
        f"Dhanyavaad,\nTeam Support"
    ),
    (InterventionType.SMS_REMINDER, Language.HINGLISH): lambda c, t: (
        f"Hi {_first_name(c.customer.name)}, aapka {_fmt_amount(t.amount, t.currency)} ka "
        f"payment {t.product_name} ke liye pending hai. Complete karein: "
        f"pay.example.com/r/{c.case_id[-6:]} Reply STOP to opt out."
    ),
    (InterventionType.SMS_REMINDER, Language.ENGLISH): lambda c, t: (
        f"Hi {_first_name(c.customer.name)}, your {_fmt_amount(t.amount, t.currency)} payment "
        f"for {t.product_name} is pending. Complete it here: pay.example.com/r/{c.case_id[-6:]} "
        f"Reply STOP to opt out."
    ),
    (InterventionType.DYNAMIC_DISCOUNT_OFFER, Language.HINGLISH): lambda c, t: (
        f"Hi {_first_name(c.customer.name)}, aapke liye special: {t.product_name} complete "
        f"karein aur paayein 10% off — sirf aapke liye, agle 48 ghante ke liye valid. "
        f"pay.example.com/offer/{c.case_id[-6:]}"
    ),
    (InterventionType.DYNAMIC_DISCOUNT_OFFER, Language.ENGLISH): lambda c, t: (
        f"Hi {_first_name(c.customer.name)}, as a valued customer here's 10% off to "
        f"complete your {t.product_name} — valid for the next 48 hours: "
        f"pay.example.com/offer/{c.case_id[-6:]}"
    ),
    # ---- B2B ----
    (InterventionType.B2B_ESCALATION_EMAIL, Language.ENGLISH): lambda c, t: (
        f"Subject: Overdue invoice {t.invoice_number} — {_fmt_amount(t.amount, t.currency)}\n\n"
        f"Dear {c.customer.name} Accounts Team,\n\n"
        f"Invoice {t.invoice_number} for {_fmt_amount(t.amount, t.currency)} remains unpaid "
        f"past its due date. Please arrange payment or share an expected payment date at "
        f"your earliest convenience via pay.example.com/b2b/{c.case_id[-6:]}. "
        f"Our finance team (finance@example.com) is copied and happy to help with any queries.\n\n"
        f"Regards,\nAccounts Receivable"
    ),
    (InterventionType.B2B_ACCOUNT_MANAGER_HANDOFF, Language.ENGLISH): lambda c, t: (
        f"[INTERNAL HANDOFF NOTE] Invoice {t.invoice_number} ({_fmt_amount(t.amount, t.currency)}) "
        f"for {c.customer.name} has crossed the automated-collections threshold. "
        f"Routed to named account manager with full context and audit trail for a "
        f"relationship-preserving, human-led conversation."
    ),
    # ---- P2P ----
    (InterventionType.P2P_SOFT_REMINDER, Language.HINGLISH): lambda c, t: (
        f"Hi {_first_name(c.customer.name)}, bas ek gentle reminder — aapne "
        f"{_fmt_amount(t.amount, t.currency)} ka payment "
        f"{c.p2p.promised_date.strftime('%d %b') if c.p2p.promised_date else 'jald hi'} "
        f"tak karne ka promise kiya tha. Koi help chahiye toh batayein!"
    ),
    (InterventionType.P2P_SOFT_REMINDER, Language.ENGLISH): lambda c, t: (
        f"Hi {_first_name(c.customer.name)}, just a gentle reminder about the "
        f"{_fmt_amount(t.amount, t.currency)} payment you mentioned for "
        f"{c.p2p.promised_date.strftime('%d %b') if c.p2p.promised_date else 'soon'}. "
        f"Let us know if you need anything on our end."
    ),
}


def generate_message(case: RecoveryCase, intervention_type: InterventionType) -> tuple[str, str]:
    """Returns (template_id, message_text). message_text is '' for silent
    system-only actions (e.g. SILENT_AUTO_RETRY, SMART_RETRY_SCHEDULED,
    HUMAN_ESCALATION where no direct customer text is generated)."""
    lang = case.customer.preferred_language
    key = (intervention_type, lang)

    if key not in TEMPLATES:
        # graceful fallback chain: requested language -> English -> silent
        key = (intervention_type, Language.ENGLISH)
    if key not in TEMPLATES:
        return f"{intervention_type.value}_silent", ""

    text = TEMPLATES[key](case, case.transaction)
    template_id = f"{intervention_type.value}_{lang.value}"
    return template_id, (text or "")
