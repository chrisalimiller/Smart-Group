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
  Other: "grey",
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
    "google.com/travel", "delta.com", "united.com", "aa.com", "southwest.com",
  ],
  Finance: [
    "paypal.com", "chase.com", "bankofamerica.com", "wellsfargo.com", "fidelity.com",
    "vanguard.com", "schwab.com", "robinhood.com", "coinbase.com", "venmo.com", "capitalone.com",
  ],
};

// Fallback hints when a site isn't in any list.
const KEYWORD_HINTS = [
  [/\b(shop|store|deals?|cart)\b/, "Shopping"],
  [/\bnews\b/, "News"],
  [/\bmail\b/, "Email"],
  [/\b(bank|invest|credit)\b/, "Finance"],
];

if (typeof module !== "undefined") {
  module.exports = { CATEGORY_COLORS, DEFAULT_CATEGORY_SITES, KEYWORD_HINTS };
}
