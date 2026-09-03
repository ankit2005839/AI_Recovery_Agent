import { Customer, InterventionType, LanguagePreference, Transaction } from "./types";

function formatAmount(amount: number, currency: string): string {
  const symbol = currency === "INR" ? "₹" : "$";
  return `${symbol}${amount.toLocaleString("en-IN")}`;
}

function firstName(fullName: string): string {
  return fullName.split(" ")[0];
}

/**
 * Localized/Hinglish-aware message generator. Produces the exact outbound
 * copy for a given intervention type, tailored to the customer's language
 * preference and segment. Templates are intentionally warm and non-coercive
 * — no fear/urgency language, no repeated pressure — to satisfy the
 * anti-harassment compliance bar.
 */
export function generateMessage(
  interventionType: InterventionType,
  customer: Customer,
  transaction: Transaction,
  extra?: { discountPct?: number; promisedDate?: string; newDueDate?: string }
): string {
  const name = firstName(customer.name);
  const amt = formatAmount(transaction.amount, transaction.currency);
  const lang = customer.language;

  const templates: Record<string, (l: LanguagePreference) => string> = {
    SOFT_AUTO_RETRY: () =>
      `[System] Silent auto-retry scheduled for ${amt} on ${transaction.description}. No customer contact generated.`,

    IN_APP_NUDGE: (l) => {
      if (l === "HINGLISH")
        return `Hi ${name}! Aapka cart abhi bhi waiting kar raha hai 🛒 — ${amt} ka order complete karna chahenge? Ek tap mein ho jayega.`;
      if (l === "HINDI")
        return `नमस्ते ${name}, आपकी खरीदारी (${amt}) अभी भी अधूरी है। क्या आप इसे पूरा करना चाहेंगे?`;
      return `Hi ${name}, your cart for ${amt} is still saved. Want to pick up where you left off?`;
    },

    SMS_REMINDER: (l) => {
      if (l === "HINGLISH")
        return `Hi ${name}, aapka payment of ${amt} process nahi ho paya. Koi baat nahi, aap jab convenient ho retry kar sakte hain: [secure-link]. Reply STOP to opt out.`;
      if (l === "HINDI")
        return `नमस्ते ${name}, आपका ${amt} का भुगतान पूरा नहीं हो सका। कृपया सुविधानुसार पुनः प्रयास करें: [secure-link]। बंद करने हेतु STOP लिखें।`;
      return `Hi ${name}, we couldn't process your payment of ${amt}. No rush — retry whenever suits you: [secure-link]. Reply STOP to opt out.`;
    },

    EMAIL_NUDGE: (l) => {
      if (l === "HINGLISH")
        return `Subject: Thoda sa pending hai\n\nHi ${name},\n\nAapka payment of ${amt} (${transaction.description}) abhi complete nahi hua hai. Bas ek chhota sa step baaki hai — jab time mile, complete kar dijiye: [secure-link]\n\nKoi help chahiye toh bataiyega!\n\nDhanyavaad.`;
      return `Subject: A small pending item on your account\n\nHi ${name},\n\nYour payment of ${amt} for ${transaction.description} hasn't gone through yet. It only takes a minute to complete whenever you're ready: [secure-link]\n\nHappy to help if you run into any issues.\n\nThanks!`;
    },

    WHATSAPP_NUDGE: (l) => {
      if (l === "HINGLISH")
        return `Hi ${name} 👋, aapka order (${amt}) abhi bhi pending hai. Complete karne ke liye yahan tap karein: [secure-link]. Reply STOP karke opt-out kar sakte hain.`;
      return `Hi ${name} 👋, your order for ${amt} is still pending. Tap here to complete: [secure-link]. Reply STOP to opt out anytime.`;
    },

    DYNAMIC_DISCOUNT_OFFER: (l) => {
      const pct = extra?.discountPct ?? 10;
      if (l === "HINGLISH")
        return `Hi ${name}, aapke liye special ${pct}% off available hai is order (${amt}) par — sirf agle 48 ghanton ke liye. Complete karein: [secure-link]`;
      return `Hi ${name}, as a thank-you for your patience, here's ${pct}% off your pending order (${amt}) — valid for the next 48 hours: [secure-link]`;
    },

    HINGLISH_VOICE_CALL: (l) => {
      // Voice call script — first-person agent script, read aloud by the voice agent.
      if (l === "HINGLISH" || l === "HINDI")
        return `[Voice Script] "Namaste ${name} ji, main aapke recent payment ${amt} ke baare mein baat karne ke liye call kar raha hoon. Lagta hai payment process nahi ho paaya. Koi problem toh nahi? Main aapki madad kar sakta hoon — chahen toh hum abhi retry kar sakte hain, ya baad mein convenient time set kar sakte hain. Aap batayein, kya theek rahega?"`;
      return `[Voice Script] "Hello ${name}, I'm calling about a recent payment of ${amt} that didn't go through. Is everything alright on your end? I can help retry it now, or we can find a time that works better for you — whatever's easiest."`;
    },

    CARD_UPDATE_REQUEST: (l) => {
      if (l === "HINGLISH")
        return `Hi ${name}, aapka card jo humare records mein hai woh expire ho chuka lagta hai. ${amt} ka payment complete karne ke liye naya card details update kar dein: [secure-card-update-link]`;
      return `Hi ${name}, the card on file appears to have expired. To complete your payment of ${amt}, please update your card details here: [secure-card-update-link]`;
    },

    B2B_ESCALATION_EMAIL: () =>
      `Subject: Overdue Invoice ${transaction.id} — Action Required\n\nDear ${customer.name},\n\nOur records show invoice ${transaction.id} for ${amt} (${transaction.description}) remains unpaid, ${transaction.daysOverdue ?? 0} days past the due date of ${transaction.dueDate}.\n\nWe would appreciate settlement at your earliest convenience, or please reach out if there are any concerns with this invoice so we can resolve them together. If you believe this invoice is in error, please let us know immediately.\n\nRegards,\nAccounts Receivable Team`,

    B2B_PAYMENT_PLAN_OFFER: () =>
      `Subject: Flexible Payment Options for Invoice ${transaction.id}\n\nDear ${customer.name},\n\nWe understand cashflow timing can be tight. Invoice ${transaction.id} (${amt}) is currently overdue, and we'd like to offer a structured installment plan if that would help — for example, splitting the balance across the next 2-3 billing cycles.\n\nLet us know if you'd like to set this up, or if there's anything else we can do to make this easier.\n\nRegards,\nAccounts Receivable Team`,

    HUMAN_ESCALATION: () =>
      `[Internal] Case routed to human agent for manual review. No automated customer-facing message generated.`,

    TERMINATE_NO_ACTION: () =>
      `[Internal] Case terminated per compliance guardrail. No further customer-facing message generated.`,
  };

  const fn = templates[interventionType];
  return fn ? fn(lang) : `[No template available for ${interventionType}]`;
}

/** Non-intrusive P2P soft-reminder copy, distinct (gentler) from standard dunning messages. */
export function generateP2PSoftReminder(customer: Customer, transaction: Transaction, promisedDate: string): string {
  const name = firstName(customer.name);
  const amt = formatAmount(transaction.amount, transaction.currency);
  const date = new Date(promisedDate).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
  if (customer.language === "HINGLISH") {
    return `Hi ${name}, bas ek gentle reminder — aapne ${date} ko ${amt} ka payment karne ka bola tha. Koi change chahiye toh bas reply kar dena, koi tension nahi! 🙂`;
  }
  return `Hi ${name}, just a gentle reminder — you mentioned you'd complete your payment of ${amt} around ${date}. No pressure at all, just reply if that date needs to shift.`;
}
