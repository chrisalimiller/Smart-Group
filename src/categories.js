// Built-in categories and the sites that belong to them.
// Users can add their own rules on the settings page; those win over these.

const CATEGORY_COLORS = {
  Shopping: "orange",
  Social: "pink",
  Video: "red",
  Music: "purple",
  News: "grey",
  Email: "cyan",
  Work: "blue",
  Dev: "green",
  AI: "purple",
  Reference: "yellow",
  Travel: "cyan",
  Finance: "green",
  Miscellaneous: "grey",
};

const DEFAULT_CATEGORY_SITES = {
  Shopping: [
    "amazon.com", "amazon.co.uk", "amazon.ca", "ebay.com", "etsy.com", "walmart.com",
    "target.com", "bestbuy.com", "aliexpress.com", "temu.com", "shein.com", "costco.com",
    "homedepot.com", "lowes.com", "ikea.com", "wayfair.com", "newegg.com", "shopify.com",
  ],
  Social: [
    "facebook.com", "instagram.com", "x.com", "twitter.com", "reddit.com", "linkedin.com",
    "tiktok.com", "pinterest.com", "threads.net", "bsky.app", "mastodon.social",
    "tumblr.com", "discord.com", "snapchat.com", "quora.com",
  ],
  Video: [
    "youtube.com", "netflix.com", "twitch.tv", "vimeo.com", "hulu.com", "disneyplus.com",
    "max.com", "primevideo.com", "tv.apple.com", "crunchyroll.com", "peacocktv.com",
  ],
  Music: ["spotify.com", "soundcloud.com", "music.apple.com", "bandcamp.com", "music.youtube.com", "pandora.com"],
  News: [
    "nytimes.com", "cnn.com", "bbc.com", "bbc.co.uk", "theguardian.com", "reuters.com",
    "apnews.com", "washingtonpost.com", "wsj.com", "foxnews.com", "npr.org", "bloomberg.com",
    "news.google.com", "news.yahoo.com", "axios.com", "politico.com", "theverge.com",
  ],
  Email: ["mail.google.com", "outlook.live.com", "outlook.office.com", "mail.yahoo.com", "mail.proton.me", "fastmail.com"],
  Work: [
    "docs.google.com", "drive.google.com", "calendar.google.com", "notion.so", "slack.com",
    "trello.com", "asana.com", "atlassian.net", "figma.com", "zoom.us", "office.com",
    "teams.microsoft.com", "airtable.com", "miro.com", "monday.com", "dropbox.com",
  ],
  Dev: [
    "github.com", "gitlab.com", "bitbucket.org", "stackoverflow.com", "stackexchange.com",
    "developer.mozilla.org", "npmjs.com", "pypi.org", "docs.python.org", "localhost",
  ],
  AI: ["claude.ai", "chatgpt.com", "chat.openai.com", "gemini.google.com", "perplexity.ai", "copilot.microsoft.com"],
  Reference: ["wikipedia.org", "wiktionary.org", "britannica.com", "dictionary.com", "merriam-webster.com"],
  Travel: [
    "booking.com", "airbnb.com", "expedia.com", "kayak.com", "tripadvisor.com", "hotels.com",
    "google.com/travel", "google.com/maps", "maps.google.com", "delta.com", "united.com", "aa.com",
    "southwest.com", "vrbo.com", "skyscanner.com", "uber.com", "lyft.com",
  ],
  Finance: [
    "paypal.com", "chase.com", "bankofamerica.com", "wellsfargo.com", "fidelity.com",
    "vanguard.com", "schwab.com", "robinhood.com", "coinbase.com", "venmo.com", "capitalone.com",
  ],
};

// The name of the group for sites that don't fit any category.
const MISC_CATEGORY = "Miscellaneous";

// Fallback hints for sites that aren't in any list, checked in order.
// First against the site's address, then against the page title.
const KEYWORD_HINTS = [
  [/\b(shop|shopping|store|cart|checkout|deals?|sale|outlet|buy)\b/, "Shopping"],
  [/\b(mail|inbox|webmail)\b/, "Email"],
  [/\b(news|breaking|headlines|times|herald|gazette|tribune|post)\b/, "News"],
  [/\b(bank|banking|invest|investing|credit|loan|mortgage|stocks?|crypto|finance|insurance)\b/, "Finance"],
  [/\b(flights?|hotels?|travel|airlines?|vacation|trip|resort|cruise)\b/, "Travel"],
  [/\b(music|album|playlist|songs?|lyrics|radio|podcasts?)\b/, "Music"],
  [/\b(video|videos|watch|episode|movies?|stream|streaming|tv)\b/, "Video"],
  [/\b(forum|community|social|followers)\b/, "Social"],
  [/\b(api|sdk|developer|developers|documentation|github|repository|npm|code)\b/, "Dev"],
  [/\b(ai|chatbot|assistant|gpt|llm)\b/, "AI"],
  [/\b(wiki|encyclopedia|dictionary|definition|glossary)\b/, "Reference"],
  [/\b(dashboard|calendar|meeting|project|workspace|docs|spreadsheet|slides)\b/, "Work"],
];

// Fallback by top-level domain, for things like universities and government sites.
const TLD_HINTS = { edu: "Reference", gov: "Reference", mil: "Reference" };

if (typeof module !== "undefined") {
  module.exports = { CATEGORY_COLORS, DEFAULT_CATEGORY_SITES, KEYWORD_HINTS, TLD_HINTS, MISC_CATEGORY };
}
