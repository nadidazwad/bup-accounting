// Where accepting THE BROKER's offer sends players: BUP Accounting Forum's
// official page. Their old domain (bupaf.com) lapsed and now serves a gambling
// site, so never point back at it. When the forum publishes a dedicated
// registration page, set NEXT_PUBLIC_REGISTRATION_URL at build time.
export const REGISTRATION_URL = process.env.NEXT_PUBLIC_REGISTRATION_URL || "https://www.facebook.com/bupafofficial/";
