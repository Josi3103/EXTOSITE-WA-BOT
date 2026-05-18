import pkg from "wa-sticker-formatter";
const { Sticker, StickerTypes } = pkg;
import { downloadMediaMessage } from "@whiskeysockets/baileys";

import makeWASocket, {
    useMultiFileAuthState,
    DisconnectReason
} from "@whiskeysockets/baileys";

import P from "pino";
import qrcode from "qrcode-terminal";
import fs from "fs";

// ========================================
// 🤖 EXTOSITE BOT
// ========================================
let warnings = {};
const PREFIX = "!";
const sessionFolder = "./session";
let botMode = "public";

// Economy tuning (change these to adjust gamble luck)
const GAMBLE_BASE_CHANCE = 0.47; // base probability to win in !gamble
const GAMBLE_TICKET_BONUS = 0.05; // additional chance if user owns a ticket
// ========================================
// 👑 OWNER + VIP
// ========================================

const OWNER_NUMBERS = [
    "42155489915095",
    "173358519951588"
];

let vipUsers = [
    "42155489915095",//Main
    "242085898776627",
    "69428364488911",
    "207426200563894",
    "105364540416182",
    "241588185878616",
    "970830405633" ,
    "29871615004746" ,
    "69428364488911",
    "45329470767319"
];

function isOwner(jid) {

    if (!jid) return false;

    // nur zahlen extrahieren
    const clean = jid.replace(/\D/g, "");

    return OWNER_NUMBERS.some(owner =>
        clean.includes(owner)
    );
}
function isVip(jid) {

    const clean =
        jid.split("@")[0];

    return vipUsers.some(v =>
        v.split("@")[0] === clean
    ) || isOwner(jid);
}

// ========================================
// 🔇 MUTED DATABASE
// ========================================

let mutedUsers = {};

if (fs.existsSync("./muted.json")) {
    try {
        mutedUsers = JSON.parse(
            fs.readFileSync("./muted.json")
        );
    } catch {
        mutedUsers = {};
    }
}

function saveMutedUsers() {
    fs.writeFileSync(
        "./muted.json",
        JSON.stringify(mutedUsers, null, 2)
    );
}

const dbFile = "./database.json";
let dbData = {
    economy: {},
    warnings: {},
    groups: {},
    daily: {},
    drugLog: []
};

if (fs.existsSync(dbFile)) {
    try {
        dbData = JSON.parse(fs.readFileSync(dbFile));
    } catch {
        dbData = {
            economy: {},
            warnings: {},
            groups: {},
            daily: {}
        };
    }
}

const economy = (dbData.economy = dbData.economy || {});
warnings = (dbData.warnings = dbData.warnings || {});
const groups = (dbData.groups = dbData.groups || {});
const dailyClaims = (dbData.daily = dbData.daily || {});
const drugLog = (dbData.drugLog = dbData.drugLog || []);
const drugOffers = (dbData.drugOffers = dbData.drugOffers || []);

function saveDatabase() {
    fs.writeFileSync(
        dbFile,
        JSON.stringify(dbData, null, 2)
    );
}

if (!fs.existsSync("./saved_images")) {
    fs.mkdirSync("./saved_images", { recursive: true });
}

function ensureEconomy(userId) {
    if (!economy[userId]) {
        economy[userId] = {};
    }

    const account = economy[userId];
    account.wallet = account.wallet ?? 0;
    account.bank = account.bank ?? 0;
    account.job = account.job || "unemployed";
    account.lastWork = account.lastWork ?? 0;
    account.lastRob = account.lastRob ?? 0;
    account.lastInvest = account.lastInvest ?? 0;
    account.lastSearch = account.lastSearch ?? 0;
    account.lastTask = account.lastTask ?? 0;
    account.lastCollect = account.lastCollect ?? 0;
    account.lastBust = account.lastBust ?? 0;
    account.lastPlant = account.lastPlant ?? 0;
    account.lastPrisonCheck = account.lastPrisonCheck ?? 0;
    account.inventory = account.inventory || {};
    account.drugInventory = account.drugInventory || {};
    account.crops = account.crops || {};
    account.role = account.role || "citizen";
    account.drugStats = account.drugStats || {
        seedsBought: 0,
        materialsBought: 0,
        grown: 0,
        harvested: 0,
        sold: 0,
        bought: 0,
        spent: 0,
        offersCreated: 0,
        offersCanceled: 0,
        consumed: 0,
        busts: 0,
        arrests: 0,
        profit: 0
    };
    account.jailRelease = account.jailRelease ?? 0;
    account.roleLevel = account.roleLevel ?? 1;
    account.roleExp = account.roleExp ?? 0;
    account.level = account.level ?? 1;
    account.exp = account.exp ?? 0;
    account.completedMissions = account.completedMissions ?? [];
    account.stocks = account.stocks || {};
    account.businesses = account.businesses || {};
    account.businessSlots = account.businessSlots ?? 3;
    account.businessWallets = account.businessWallets || {};
    account.lastMission = account.lastMission ?? 0;

    return account;
}

function ensureGroup(groupId) {
    if (!groups[groupId]) {
        groups[groupId] = {
            antiLink: false,
            welcome: false
        };
    }
    return groups[groupId];
}

function getDrugUserName(userId) {
    return userId?.split("@")[0] || "unknown";
}

function formatDrugLogEntry(entry) {
    return `• [${new Date(entry.time).toLocaleString("de-DE")}] ${getDrugUserName(entry.userId)}: ${entry.type} ${entry.details || ""}`;
}

function logDrugEvent(userId, type, details) {
    dbData.drugLog = dbData.drugLog || [];
    dbData.drugLog.push({
        time: Date.now(),
        userId,
        type,
        details
    });
    saveDatabase();
}

function brandText(text) {
    return `╔════════════════════════╗\n║   EXTOSITE BOT        ║\n╚════════════════════════╝\n\n${text}\n\n-----EXTOSITE BOT-----`;
}

function sendBotMessage(to, text, extra = {}) {
    return sock.sendMessage(to, {
        text: brandText(text),
        ...extra
    });
}

function getDrugEffectOutcome(drugKey) {
    const outcomes = {
        weed: [
            { text: "Du fühlst dich entspannt und bekommst +25₽ als Plötzliches Trinkgeld.", wallet: 25 },
            { text: "Dein Kopf wird klarer, du bekommst +20 EXP.", exp: 20 },
            { text: "Du wirst müde und verschwendest 15₽.", wallet: -15 },
            { text: "Leichte Paranoia trifft dich, aber du bleibst unauffällig.", exp: 10 }
        ],
        coke: [
            { text: "Du bist voller Energie. Du findest 50₽ auf der Straße.", wallet: 50 },
            { text: "Dein Fokus steigt, du erhältst +30 EXP.", exp: 30 },
            { text: "Dein Herz rast, du verlierst 25₽ beim Schwarzmarkt.", wallet: -25 },
            { text: "Du fühlst dich nervös und hast weniger Glück beim nächsten Raub.", badLuck: true }
        ],
        heroin: [
            { text: "Schwere Entspannung. Du sparst später 30₽ bei einer Transaktion.", wallet: 30 },
            { text: "Du schwebst einen Moment, +15 EXP für die Erfahrung.", exp: 15 },
            { text: "Das Gefühl schlägt dir auf den Magen, du verlierst 40₽.", wallet: -40 },
            { text: "Du schläfst fast ein und verpasst eine Chance.", badLuck: true }
        ]
    };
    const pool = outcomes[drugKey] || [{ text: "Der Konsum fühlt sich anders an.", exp: 10 }];
    return pool[Math.floor(Math.random() * pool.length)];
}

function getDrugLeaderboard() {
    return Object.entries(economy)
        .map(([userId, account]) => ({
            userId,
            profit: account.drugStats?.profit || 0,
            sold: account.drugStats?.sold || 0,
            harvested: account.drugStats?.harvested || 0
        }))
        .sort((a, b) => b.profit - a.profit)
        .slice(0, 10);
}

const missions = {
    daily_work: { label: "Tägliche Arbeit", reward: 500, exp: 50 },
    gamble_lucky: { label: "Glücksspiel Gewinn", reward: 800, exp: 75 },
    rob_success: { label: "Erfolgreicher Raub", reward: 1200, exp: 100 },
    invest_gain: { label: "Investition erfolgreich", reward: 1000, exp: 80 }
};

const businesses = {
    shop: { price: 5000, income: 100, label: "Kleiner Shop" },
    bakery: { price: 8000, income: 140, label: "Bäckerei" },
    garage: { price: 10000, income: 160, label: "Autowerkstatt" },
    restaurant: { price: 18000, income: 320, label: "Restaurant" },
    factory: { price: 25000, income: 500, label: "Fabrik" },
    nightclub: { price: 30000, income: 420, label: "Nachtclub" },
    warehouse: { price: 20000, income: 280, label: "Lagerhalle" },
    farm: { price: 12000, income: 180, label: "Bauernhof" },
    pharmacy: { price: 14000, income: 200, label: "Apotheke" },
    tech_startup: { price: 50000, income: 800, label: "Tech Startup" },
    casino: { price: 75000, income: 1000, label: "Casino" },
    car_dealer: { price: 40000, income: 450, label: "Autohaus" }
};

const shopItems = {
    energy: {
        label: "Energydrink",
        price: 150,
        sellPrice: 120,
        description: "Erhöht deinen Arbeitsbonus."
    },
    tool: {
        label: "Werkzeug",
        price: 350,
        sellPrice: 280,
        description: "Erhöht die Belohnung bei Arbeit."
    },
    laptop: {
        label: "Laptop",
        price: 700,
        sellPrice: 560,
        description: "Erhöht Job-Gewinne deutlich."
    },
    ticket: {
        label: "Glücksticket",
        price: 100000,
        sellPrice: 80000,
        description: "Verbessert deine Gamble-Chancen."
    },
    gem: {
        label: "Seltenes Juwel",
        price: 1200,
        sellPrice: 900,
        description: "Wertvolles Sammlerstück."
    },
    pet: {
        label: "Exotisches Haustier",
        price: 5000,
        sellPrice: 3000,
        description: "Ein luxuriöses Haustier, das Status zeigt."
    },
    car: {
        label: "Sportwagen",
        price: 25000,
        sellPrice: 16000,
        description: "Ein schneller Wagen für mehr Style."
    },
    yacht: {
        label: "Yacht",
        price: 100000,
        sellPrice: 70000,
        description: "Ein besonderes Schiff für die Reichen."
    },
    mansion: {
        label: "Villa",
        price: 250000,
        sellPrice: 180000,
        description: "Ein eigenes Anwesen zum Angeben."
    }
};

const roles = {
    citizen: {
        label: "Zivilist",
        description: "Standardrolle ohne spezielle Vorteile.",
        sellBonus: 0,
        growBonus: 0,
        policeAvoid: 0
    },
    dealer: {
        label: "Dealer",
        description: "Verkaufe Drogen zu besseren Preisen.",
        sellBonus: 0.20,
        growBonus: 0,
        policeAvoid: 0.05
    },
    grower: {
        label: "Grower",
        description: "Erzielt höhere Ernten beim Anbau.",
        sellBonus: 0,
        growBonus: 0.25,
        policeAvoid: 0
    },
    smuggler: {
        label: "Schmuggler",
        description: "Reduziert das Risiko bei illegalem Handel.",
        sellBonus: 0.05,
        growBonus: 0.1,
        policeAvoid: 0.12
    },
    cop: {
        label: "Polizist",
        description: "Kann andere festnehmen und hat niedriges Haft-Risiko.",
        sellBonus: 0,
        growBonus: 0,
        policeAvoid: 0.25
    }
};

const drugMarket = {
    weed_seed: { label: "Cannabis Samen", price: 150, description: "Zum Anbau von Weed." },
    keto_chem: { label: "Keto Chemikalien", price: 500, description: "Basis für starke Drogen." },
    heroin_kit: { label: "Heroin Kit", price: 900, description: "Ausrüstung für die Herstellung von Heroin." },
    fertilizer: { label: "Dünger", price: 120, description: "Verbessert den Ertrag beim Anbau." },
    stash_box: { label: "Versteckbox", price: 400, description: "Reduziert das Risiko bei Drogenverkäufen." }
};

const drugs = {
    weed: { label: "Weed", baseSell: 120, baseConsume: 25, harvestRate: 1.2 },
    coke: { label: "Kokain", baseSell: 420, baseConsume: 70, harvestRate: 0.9 },
    heroin: { label: "Heroin", baseSell: 900, baseConsume: 160, harvestRate: 0.7 }
};

const drugEffects = {
    weed: "Entspannt dich und schenkt dir ein ruhiges Gefühl.",
    coke: "Bringt einen Energieschub und erhöht deinen Fokus.",
    heroin: "Bewirkt starke Betäubung und lähmt deine Sinne.",
};

// Job definitions used by !jobs, !job and !work
const jobs = {
    miner: { label: "Miner", min: 20, max: 40 },
    farmer: { label: "Farmer", min: 15, max: 35 },
    programmer: { label: "Programmierer", min: 40, max: 75 },
    guard: { label: "Wächter", min: 18, max: 40 },
    driver: { label: "Fahrer", min: 15, max: 40 },
};

function formatMoney(value) {
    const amount = Number(value) || 0;
    return `${amount.toLocaleString("de-DE")}₽`;
}

function parseAmount(value) {
    const amount = parseInt(value, 10);
    return Number.isNaN(amount) || amount <= 0 ? null : amount;
}

function getRandomElement(array) {
    return array[Math.floor(Math.random() * array.length)];
}

function isRedNumber(number) {
    const redNumbers = [1,3,5,7,9,12,14,16,18,19,21,23,25,27,30,32,34,36];
    return redNumbers.includes(number);
}

function formatCasinoGameLine(symbols) {
    return symbols.join(" |");
}

function isInJail(account) {
    return Date.now() < (account.jailRelease || 0);
}

function jailRemaining(account) {
    const remaining = (account.jailRelease || 0) - Date.now();
    return remaining > 0 ? Math.ceil(remaining / 60000) : 0;
}

function getDrugArrestChance(account, baseRisk) {
    const role = roles[account.role] || roles.citizen;
    const reduced = Math.max(0, baseRisk - role.policeAvoid);
    return Math.min(0.95, reduced);
}

function checkDrugArrest(account, baseRisk) {
    const chance = getDrugArrestChance(account, baseRisk);
    return Math.random() < chance;
}

function roleLabel(account) {
    return roles[account.role]?.label || roles.citizen.label;
}

function roleDescription(roleKey) {
    return roles[roleKey]?.description || "Unbekannte Rolle.";
}

// ========================================
// 🌍 STATE
// ========================================

let sock;
let isConnected = false;
let reconnecting = false;
let lastIncomingMessage = null;

// ========================================
// 🚀 START BOT
// ========================================

async function startBot() {

    const { state, saveCreds } =
        await useMultiFileAuthState(sessionFolder);

    sock = makeWASocket({
        auth: state,
        printQRInTerminal: true,
        logger: P({ level: "silent" }),
        browser: ["ExtositeBOT", "Chrome", "1.0.0"]
    });

    const originalSendMessage = sock.sendMessage.bind(sock);
    sock.sendMessage = async (jid, message, options = {}) => {
        const shouldQuote = lastIncomingMessage && lastIncomingMessage.key?.remoteJid === jid;
        if (shouldQuote && message && typeof message === "object" && !message.quoted && !Object.prototype.hasOwnProperty.call(message, "delete")) {
            message = { ...message, quoted: lastIncomingMessage };
        }
        return originalSendMessage(jid, message, options);
    };

    sock.ev.on("creds.update", saveCreds);

    // ========================================
    // 📡 CONNECTION
    // ========================================

    sock.ev.on("connection.update", (update) => {

        const {
            connection,
            lastDisconnect,
            qr
        } = update;

        if (qr) {
            console.log("📲 QR CODE:");
            qrcode.generate(qr, {
                small: true
            });
        }

        if (connection === "open") {

            console.log("✅ Verbunden");
            isConnected = true;
            reconnecting = false;
        }

        if (connection === "close") {

            isConnected = false;

            const code =
                lastDisconnect?.error?.output?.statusCode;

            console.log("❌ Disconnected:", code);

            if (
                code === DisconnectReason.loggedOut
            ) {
                console.log(
                    "🚨 Session abgelaufen → neu scannen"
                );
                return;
            }

            if (reconnecting) return;

            reconnecting = true;

            setTimeout(() => {
                console.log("🔄 Reconnect...");
                startBot();
            }, 5000);
        }
    });

    // ========================================
    // 💬 MESSAGES
    // ========================================

    sock.ev.on(
        "messages.upsert",
        async ({ messages }) => {

            const msg = messages[0];

            try {

                if (!msg.message) return;
                if (!isConnected) return;

                lastIncomingMessage = msg;

                const from = msg.key.remoteJid;

               const sender =
    msg.key.participant?? 
    msg.key.remoteJid;

                // ========================================
                // 🔇 AUTO-DELETE MUTED MESSAGES
                // ========================================
                if (mutedUsers[from]?.includes(sender)) {
                    try {
                        await sock.sendMessage(from, {
                            delete: msg.key
                        });
                    } catch (e) {
                        console.log("Delete failed:", e?.message);
                    }
                    return;
                }
                 
                // ========================================
                // 📝 TEXT
                // ========================================

                const text =
                    msg.message?.conversation ||
                    msg.message?.extendedTextMessage?.text ||
                    msg.message?.imageMessage?.caption ||
                    "";

                const cleanText = text.trim();
                const groupSettings = ensureGroup(from);

                if (
                    from.endsWith("@g.us") &&
                    groupSettings.antiLink &&
                    /https?:\/\/|chat\.whatsapp\.com/i.test(cleanText) &&
                    !cleanText.startsWith(PREFIX)
                ) {
                    if (!isOwner(sender) && !isVip(sender)) {
                        await sock.sendMessage(from, {
                            text:
                                "❌ Anti-Link ist aktiv. Keine Links in dieser Gruppe!"
                        });
                        return;
                    }
                }

                if (!cleanText.startsWith(PREFIX))
                    return;

                const args =
                    cleanText
                        .slice(PREFIX.length)
                        .trim()
                        .split(/ +/);

                let command =
                    args.shift()?.toLowerCase();

                const commandAliases = {
                    invenrory: "inventory",
                    inv: "inventory",
                    store: "shop",
                    buyitem: "buy",
                    sellitem: "sell",
                    investment: "invest",
                    rapper: "rob",
                    lvl: "level",
                    exp: "level",
                    mission: "mission",
                    missionen: "mission",
                    biz: "business",
                    buybiz: "buybiz",
                    businessmenu: "business",
                    wirtschaft: "economymenu",
                    groups: "groupmenu",
                    groupinfo: "groupstats",
                    stats2: "groupstats",
                    ping: "pinglive",
                    buydrugs: "buydrug",
                    selldrugs: "selldrug",
                    druginv: "druginventory",
                    offer: "offerdrug",
                    selloffer: "offerdrug",
                    asksell: "offerdrug"
                };

                command = commandAliases[command] || command;

                const validCommands = new Set([
                    "menu",
                    "test",
                    "warn",
                    "warnings",
                    "arda",
                    "sticker",
                    "pinglive",
                    "say",
                    "bank",
                    "bal",
                    "depositall",
                    "withdrawall",
                    "pay",
                    "gift",
                    "donate",
                    "lottery",
                    "spend",
                    "luxury",
                    "daily",
                    "leaderboard",
                    "jobs",
                    "job",
                    "work",
                    "search",
                    "task",
                    "collect",
                    "shop",
                    "buy",
                    "sell",
                    "inventory",
                    "gamble",
                    "role",
                    "setrole",
                    "drugmenu",
                    "druglog",
                    "drugboard",
                    "drugstats",
                    "druginventory",
                    "offers",
                    "offerdrug",
                    "buyoffer",
                    "canceloffer",
                    "buysamen",
                    "buyseed",
                    "buydrug",
                    "grow",
                    "plant",
                    "harvest",
                    "selldrug",
                    "consume",
                    "jailstatus",
                    "bail",
                    "bust",
                    "casino",
                    "rob",
                    "invest",
                    "level",
                    "mission",
                    "business",
                    "biz",
                    "buybiz",
                    "mybiz",
                    "profile",
                    "profil",
                    "economymenu",
                    "stats",
                    "groupstats",
                    "groupmenu",
                    "hidetag",
                    "mode",
                    "del",
                    "status",
                    "link",
                    "fact",
                    "love",
                    "promote",
                    "demote",
                    "listmuted",
                    "goonen",
                    "bot",
                    "saveimg",
                    "savedlist",
                    "restart",
                    "shutdown",
                    "help",
                    "owner",
                    "runtime",
                    "uptime",
                    "vip",
                    "dice",
                    "coinflip",
                    "joke",
                    "rate",
                    "8ball",
                    "ship",
                    "fakehack",
                    "addvip",
                    "delvip",
                    "resetmoney",
                    "setmoney",
                    "addmoney",
                    "takemoney",
                    "tagall",
                    "admins",
                    "stats",
                    "groupstats",
                    "groupinfo",
                    "close",
                    "open",
                    "setname",
                    "setdesc",
                    "welcome",
                    "antilink",
                    "resetwarns",
                    "kick",
                    "mute",
                    "unmute"
                ]);

                if (!command || !validCommands.has(command)) {
                    return;
                }
                // ========================================
// 🔒 PRIVATE MODE CHECK
// ========================================

if (
    botMode === "private" &&
    !isOwner(sender) &&
    !isVip(sender)
) {
    return;
}
                console.log(
                    `⚡ COMMAND: ${command}`
                );
                console.log(msg.key);
console.log("SENDER =", sender);

                // ========================================
                // 🔇 MUTE CHECK
                // ========================================

                if (
                    mutedUsers[from]?.includes(sender)
                ) {
                    return;
                }

                // ========================================
                // 📋 MENU
                // ========================================
                //20 striche
if (command === "menu") {

    return sock.sendMessage(from, {

        image: fs.readFileSync("./menu.png"),

        caption: `
╔══════════════════════════╗
║      EXTOSITE BOT
╚══════════════════════════╝

[ SYSTEM ]
--------------------
] Prefix    : !
[ Version   : 1.3
] Mode      : Multi Device
[ Runtime   : ${Math.floor(process.uptime())}s
--------------------

[ GENERAL ]
--------------------
]_!menu
[_!economymenu
]_!ping
[_!runtime
]_!uptime
[_!owner
]_!vip
[_!help
[_!bank
--------------------

[ GROUP ]
--------------------
]_!tagall
[_!admins
]_!groupstats
[_!close
]_!open
[_!setname <text>
]_!setdesc <text>
[_!welcome on/off
]_!welcome message <text>
[_!kick @user
]_!mute @user
[_!unmute @user
]_!hidetag
[_!warn @user
]_!warnings
[_!antilink on/off
]_!promote @user
[_!demote @user
]_!link
--------------------

[ MODERATION ]
--------------------
]_!del
[_!resetwarns
]_!listmuted
--------------------

[ FUN ]
--------------------
[_!dice
]_!coinflip
[_!ship
]_!8ball
[_!rate
]_!say
[_!bank
]_!bal
[_!daily
]_!pay
]_!leaderboard
[_!job
]_!jobs
]_!work
]_!shop
]_!buy
]_!sell
]_!inventory
]_!gamble
]_!rob
]_!invest
]_!level
]_!mission
]_!business
]_!buybiz
]_!mybiz
]_!profile
[_!joke
]_!fakehack
[_!goonen
[_!arda
]_!love
[_!fact
--------------------
[ OWNER ]
--------------------
]_!addvip
[_!delvip
]_!setmoney @user <betrag>
]_!addmoney @user <betrag>
[_!takemoney @user <betrag>
]_!resetmoney @user
]_!restart
[_!shutdown
]_!pinglive
[_!mode
]_!status
[_!ownermode 
]_!stats
--------------------

EXTOSITE • DARK CORE
`
    });
}
  
                // ========================================
                // ⚡ BASIC
                // ========================================

                if (command === "test") {

                    return sock.sendMessage(from, {
                        text: `╔════════════════╗
║   Test Command   ║
╚════════════════╝

Command funktioniert einwandfrei!

-----EXTOSITE BOT-----
`,
                    });
                }
                if (command === "warn") {

    if (!from.endsWith("@g.us")) return;

    const user =
        msg.message?.extendedTextMessage
        ?.contextInfo?.mentionedJid?.[0];

    if (!user) {

        return sock.sendMessage(from, {
            text: "markiere user"
        });
    }

    if (!warnings[from]) {
        warnings[from] = {};
    }

    if (!warnings[from][user]) {
        warnings[from][user] = 0;
    }

    warnings[from][user]++;

    const count =
        warnings[from][user];

    await sock.sendMessage(from, {
        text:
`╔════════════════╗
║  Warning  ║
╚════════════════╝

WARNING

User:
@${user.split("@")[0]}

Warnings:
${count}/3`,
        mentions: [user]
    });

    if (count >= 3) {

        await sock.groupParticipantsUpdate(
            from,
            [user],
            "remove"
        );

        delete warnings[from][user];

        await sock.sendMessage(from, {
            text: "User erfolgreich gekickt!"
        });
    }
}
if (command === "warnings") {

    if (!warnings[from]) {

        return sock.sendMessage(from, {
            text: `---------------
            Keine Warnings Vorhanden
            ---------------`
        });
    }

    let text =
` ╔════════════════╗
║   Warning List
╚════════════════╝

WARNINGS:

`;

    for (const user in warnings[from]) {

        text +=
`@${user.split("@")[0]}
→ ${warnings[from][user]}

`;
    }

    return sock.sendMessage(from, {
        text,
        mentions: Object.keys(warnings[from])
    });
}

if (command === "arda") {
                    return sock.sendMessage(from, {
                        image: fs.readFileSync("./ar.png"),
                        caption: 
    `╔════════════════╗
║   Arda Zitat
╚════════════════╝
„Es lohnt sich immer nach den Sternen zu greifen, 
auch wenn es nicht immer perfekt klappt. Haltet eurem Traum in eurem Herzen.
 Vergleicht euch niemals mit jemand anderem. 
 Und was am Ende dabei herauskommt, weiß man eh erst am Ende 
 und steht in den Sternen geschrieben. Aber greift danach!“
 -Arda cyborg saatci
`
 });
}

if (command === "sticker") {

    const quoted = msg.message?.extendedTextMessage?.contextInfo;

    const mediaMsg =
        quoted?.quotedMessage?.imageMessage ||
        msg.message?.imageMessage;

    if (!mediaMsg) {
        return sock.sendMessage(from, {
            text: "❌ Bitte Bild senden oder antworten"
        });
    }

    try {

        const buffer = await downloadMediaMessage(
            msg,
            "buffer",
            {},
            { logger: P({ level: "silent" }) }
        );

        if (!buffer) {
            return sock.sendMessage(from, {
                text: "❌ Kein Bild erkannt"
            });
        }

        const sticker = new Sticker(buffer, {
            pack: "EXTOSITE",
            author: "BOT",
            type: StickerTypes.FULL
        });

        const result = await sticker.toBuffer();

        await sock.sendMessage(from, {
            sticker: result
        });

    } catch (err) {

        console.log(err);

        await sock.sendMessage(from, {
            text: "❌ Sticker Fehler"
        });
    }
}
  

                if (command === "pinglive") {
    const start = Date.now();

    const m = await sock.sendMessage(from, { text: "IN PROGRESS..." });

    const end = Date.now();

    return sock.sendMessage(from, {
        text: `╔════════════════╗
║   Ping live 
╚════════════════╝
        
        Ping: ${end - start}ms`
    });
}
if (command === "say") {
    const text = args.join(" ");
    if (!text) return sock.sendMessage(from, { text: "❌ Text fehlt" });

    return sock.sendMessage(from, { text });
}
if (command === "bank") {
    const account = ensureEconomy(sender);
    const action = args[0]?.toLowerCase();
    const amount = parseAmount(args[1] || args[0]);

    if (action === "deposit" || action === "einzahlen") {
        if (!amount) return sock.sendMessage(from, { text: "❌ Gib einen Betrag an: !bank deposit 100" });
        if (account.wallet < amount) return sock.sendMessage(from, { text: "❌ Nicht genug Geld in der Tasche" });

        account.wallet -= amount;
        account.bank += amount;
        saveDatabase();

        return sock.sendMessage(from, {
            text: `✅ ${formatMoney(amount)} eingezahlt.
Tasche: ${formatMoney(account.wallet)}
Bank: ${formatMoney(account.bank)}`
        });
    }

    if (action === "withdraw" || action === "abheben") {
        if (!amount) return sock.sendMessage(from, { text: "❌ Gib einen Betrag an: !bank withdraw 100" });
        if (account.bank < amount) return sock.sendMessage(from, { text: "❌ Nicht genug Geld auf der Bank" });

        account.bank -= amount;
        account.wallet += amount;
        saveDatabase();

        return sock.sendMessage(from, {
            text: `✅ ${formatMoney(amount)} abgehoben.
Tasche: ${formatMoney(account.wallet)}
Bank: ${formatMoney(account.bank)}`
        });
    }

    return sock.sendMessage(from, {
        text:
`╔════════════════╗
║   BANK SYSTEM   ║
╚════════════════╝

Job: ${account.job}
Tasche: ${formatMoney(account.wallet)}
Bank: ${formatMoney(account.bank)}

Befehle:
!bank deposit <betrag>
!bank withdraw <betrag>
!balance
!depositall
!withdrawall
!pay @user <betrag>
!daily
!leaderboard
!jobs
!job <name>
!work
!shop
!buy <item> <anzahl>
!sell <item> <anzahl>
!inventory
!gamble <betrag>
!rob @user
!invest <betrag>
!level
!mission
!business / !buybiz
!mybiz
!profile

-----EXTOSITE BOT-----
`
    });
}

if (command === "bal" || command === "bal") {
    const account = ensureEconomy(sender);

    return sock.sendMessage(from, {
        text:
`╔════════════════╗
║   DEIN GELD     ║
╚════════════════╝

Tasche: ${formatMoney(account.wallet)}
Bank: ${formatMoney(account.bank)}
Job: ${account.job}

-----EXTOSITE BOT-----`
    });
}

if (command === "depositall") {
    const account = ensureEconomy(sender);

    if (account.wallet <= 0) {
        return sock.sendMessage(from, { text: "❌ Du hast kein Geld in der Tasche." });
    }

    account.bank += account.wallet;
    account.wallet = 0;
    saveDatabase();

    return sock.sendMessage(from, {
        text: `✅ Alles eingezahlt.
Tasche: ${formatMoney(account.wallet)}
Bank: ${formatMoney(account.bank)}

-----EXTOSITE BOT-----`
    });
}

if (command === "withdrawall") {
    const account = ensureEconomy(sender);

    if (account.bank <= 0) {
        return sock.sendMessage(from, { text: "❌ Dein Bankkonto ist leer." });
    }

    account.wallet += account.bank;
    account.bank = 0;
    saveDatabase();

    return sock.sendMessage(from, {
        text: `✅ Alles abgehoben.
Tasche: ${formatMoney(account.wallet)}
Bank: ${formatMoney(account.bank)}
-----EXTOSITE BOT-----`
    });
}

if (command === "pay") {
    const mentioned = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid?.[0];
    const targetId = mentioned || args[0];
    const amount = parseAmount(args[mentioned ? 1 : 1]);

    if (!targetId || !amount) {
        return sock.sendMessage(from, { text: "❌ Nutze: !pay @user <betrag>" });
    }

    const account = ensureEconomy(sender);
    if (account.wallet < amount) {
        return sock.sendMessage(from, { text: "❌ Nicht genug Geld in der Tasche." });
    }

    const receiver = ensureEconomy(targetId);
    account.wallet -= amount;
    receiver.wallet += amount;
    saveDatabase();

    return sock.sendMessage(from, {
        text: `✅ ${formatMoney(amount)} an @${targetId.split("@")[0]} gesendet.
Tasche: ${formatMoney(account.wallet)}
-----EXTOSITE BOT-----`,
        mentions: [targetId]
    });
}

if (command === "gift" || command === "donate") {
    const mentioned = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid?.[0];
    const targetId = mentioned || args[0];
    const amount = parseAmount(args[mentioned ? 1 : 1]);

    if (!targetId || !amount) {
        return sock.sendMessage(from, { text: "❌ Nutze: !gift @user <betrag>" });
    }

    const account = ensureEconomy(sender);
    if (account.wallet < amount) {
        return sock.sendMessage(from, { text: "❌ Nicht genug Geld in der Tasche." });
    }

    const receiver = ensureEconomy(targetId);
    account.wallet -= amount;
    receiver.wallet += amount;
    saveDatabase();

    return sock.sendMessage(from, {
        text: `🎁 Du hast @${targetId.split("@")[0]} ${formatMoney(amount)} geschenkt.
Tasche: ${formatMoney(account.wallet)}
-----EXTOSITE BOT-----`,
        mentions: [targetId]
    });
}

if (command === "lottery") {
    const account = ensureEconomy(sender);
    const amount = parseAmount(args[0]);
    if (!amount) {
        return sock.sendMessage(from, { text: "❌ Nutze: !lottery <betrag>" });
    }
    if (account.wallet < amount) {
        return sock.sendMessage(from, { text: "❌ Nicht genug Geld in der Tasche." });
    }

    const draw = Math.floor(Math.random() * 100) + 1;
    let payout = 0;
    let resultText = "";

    if (draw === 1) {
        payout = amount * 20;
        resultText = `🎉 Mega-Jackpot! Du hast die richtige Nummer erwischt (${draw}).`;
    } else if (draw <= 5) {
        payout = amount * 5;
        resultText = `🎉 Guter Treffer! Deine Nummer war ${draw}.`;
    } else if (draw <= 20) {
        payout = amount * 2;
        resultText = `🙂 Kleiner Gewinn mit Nummer ${draw}.`;
    } else {
        payout = 0;
        resultText = `😢 Nummer ${draw} hat leider verloren.`;
    }

    account.wallet = account.wallet - amount + payout;
    saveDatabase();

    return sock.sendMessage(from, {
        text: `╔════════════════╗
║   LOTTERIE     ║
╚════════════════╝

${resultText}
Einsatz: ${formatMoney(amount)}
Gewinn: ${formatMoney(payout)}
Tasche: ${formatMoney(account.wallet)}

-----EXTOSITE BOT-----`
    });
}

if (command === "spend" || command === "luxury") {
    return sock.sendMessage(from, {
        text: `╔════════════════╗
║   LUXUS SHOP   ║
╚════════════════╝

Du kannst Geld hier ausgeben:
!buy car <anzahl>
!buy yacht <anzahl>
!buy mansion <anzahl>
!buy pet <anzahl>
!buy gem <anzahl>
!lottery <betrag>
!casino - Casino Menü
!gift @user <betrag>

-----EXTOSITE BOT-----`
    });
}

if (command === "daily") {
    const account = ensureEconomy(sender);
    const now = Date.now();
    const wait = 12 * 60 * 60 * 1000;
    const last = dailyClaims[sender] || 0;

    if (now - last < wait) {
        const remaining = wait - (now - last);
        const hours = Math.ceil(remaining / 3600000);
        return sock.sendMessage(from, { text: `⏳ Du kannst dein nächstes Daily in ${hours} Stunden claimen.` });
    }

    const reward = Math.floor(Math.random() * 101) + 100;
    account.wallet += reward;
    dailyClaims[sender] = now;
    saveDatabase();

    return sock.sendMessage(from, {
        text: `╔════════════════╗
║   DAILY BONUS  ║
╚════════════════╝

Du erhältst ${formatMoney(reward)}.
Tasche: ${formatMoney(account.wallet)}

-----EXTOSITE BOT-----`
    });
}

if (command === "leaderboard") {
    const leaderboard = Object.entries(economy)
        .map(([id, account]) => ({ id, total: account.wallet + account.bank }))
        .sort((a, b) => b.total - a.total)
        .slice(0, 10);

    const medals = ["🥇", "🥈", "🥉"];
    let text = `╔════════════════════════╗\n║   TOP 10 REICHSTE      ║\n╚════════════════════════╝\n\n`;

    for (let i = 0; i < leaderboard.length; i++) {
        const entry = leaderboard[i];
        const name = getDrugUserName(entry.id);
        const medal = medals[i] || `${i + 1}.`;
        text += `${medal} @${name.split("@")[0]} → ${formatMoney(entry.total)}\n`;
    }

    return sendBotMessage(from, text, {
        mentions: leaderboard.map(entry => entry.id)
    });
}

if (command === "jobs") {
    let text = `╔════════════════╗
║   available jobs ║
╚════════════════╝\n\n`;

    for (const [key, value] of Object.entries(jobs)) {
        text += `• ${value.label} (${key}) → ${value.min}-${value.max}₽\n`;
    }

    text += `\nWähle mit: !job <name>
    
    -----EXTOSITE BOT-----
    `;

    return sock.sendMessage(from, { text });
}

if (command === "job") {
    const choice = args[0]?.toLowerCase();
    const account = ensureEconomy(sender);

    if (!choice) {
        return sock.sendMessage(from, {
            text:
`╔════════════════╗
║   JOB STATUS    ║
╚════════════════╝

Aktueller Job: ${account.job}

Verfügbare Jobs:
!jobs

-----EXTOSITE BOT-----`});
    }

    if (!jobs[choice]) {
        return sock.sendMessage(from, { text: "❌ Job nicht gefunden. Nutze !jobs für die Liste." });
    }

    account.job = choice;
    saveDatabase();

    return sock.sendMessage(from, {
        text: `✅ Du arbeitest jetzt als ${jobs[choice].label}.
Verdienst: ${jobs[choice].min}-${jobs[choice].max}₽ pro !work

-----EXTOSITE BOT-----`});
}

if (command === "work") {
    const account = ensureEconomy(sender);
    const now = Date.now();
    const cooldown = 45 * 60 * 1000;
    const remaining = account.lastWork + cooldown - now;

    if (account.job === "unemployed") {
        return sock.sendMessage(from, { text: "❌ Du bist arbeitslos. Wähle zuerst einen Job mit !job <name>." });
    }

    if (remaining > 0) {
        const minutes = Math.ceil(remaining / 60000);
        return sock.sendMessage(from, { text: `⏳ Warte noch ${minutes} Minuten bis zur nächsten Arbeit.

-----EXTOSITE BOT-----` });
    }

    const jobData = jobs[account.job] || jobs.farmer;
    let earned = Math.floor(Math.random() * (jobData.max - jobData.min + 1)) + jobData.min;

    const toolCount = account.inventory.tool || 0;
    const laptopCount = account.inventory.laptop || 0;
    if (toolCount > 0) {
        earned += Math.floor(earned * 0.05 * Math.min(toolCount, 3));
    }
    if (laptopCount > 0) {
        earned += Math.floor(earned * 0.08 * Math.min(laptopCount, 2));
    }

    account.wallet += earned;
    account.lastWork = now;
    saveDatabase();

    return sock.sendMessage(from, {
        text: `╔════════════════╗
║   ARBEITEN     ║
╚════════════════╝

Du hast als ${jobData.label} gearbeitet und ${formatMoney(earned)} verdient.
Tasche: ${formatMoney(account.wallet)}
Bank: ${formatMoney(account.bank)}

-----EXTOSITE BOT-----`
    });
}

if (command === "search") {
    const account = ensureEconomy(sender);
    const now = Date.now();
    const cooldown = 30 * 60 * 1000;

    if (account.lastSearch + cooldown > now) {
        const minutes = Math.ceil((account.lastSearch + cooldown - now) / 60000);
        return sock.sendMessage(from, { text: `⏳ Du kannst in ${minutes} Minuten erneut suchen.` });
    }

    const roll = Math.random();
    let reward = 0;
    let resultText = "Du hast nichts gefunden.";

    if (roll < 0.25) {
        reward = 0;
    } else if (roll < 0.7) {
        reward = Math.floor(Math.random() * 31) + 30;
        resultText = "Du findest kleine Vorräte.";
    } else if (roll < 0.9) {
        reward = Math.floor(Math.random() * 31) + 60;
        resultText = "Du findest einen guten Fund.";
    } else {
        reward = Math.floor(Math.random() * 41) + 110;
        resultText = "Du findest einen wertvollen Fund.";
    }

    account.wallet += reward;
    account.lastSearch = now;
    saveDatabase();

    return sock.sendMessage(from, {
        text: `╔════════════════╗
║   ERKUNDUNG    ║
╚════════════════╝

${resultText}
Ertrag: ${formatMoney(reward)}
Tasche: ${formatMoney(account.wallet)}

-----EXTOSITE BOT-----`
    });
}

if (command === "task") {
    const account = ensureEconomy(sender);
    const now = Date.now();
    const cooldown = 60 * 60 * 1000;

    if (account.lastTask + cooldown > now) {
        const minutes = Math.ceil((account.lastTask + cooldown - now) / 60000);
        return sock.sendMessage(from, { text: `⏳ Du kannst in ${minutes} Minuten erneut eine Aufgabe starten.` });
    }

    const success = Math.random() < 0.7;
    let reward = 0;
    let resultText = "Die Aufgabe war nicht erfolgreich.";

    if (success) {
        reward = Math.floor(Math.random() * 31) + 80;
        account.wallet += reward;
        resultText = "Aufgabe abgeschlossen.";
    } else {
        const loss = Math.min(account.wallet, 15);
        account.wallet -= loss;
        resultText = `Aufgabe fehlgeschlagen. Du verlierst ${formatMoney(loss)}.`;
    }

    account.lastTask = now;
    saveDatabase();

    return sock.sendMessage(from, {
        text: `╔════════════════╗
║   AUFGABE      ║
╚════════════════╝

${resultText}
Ertrag: ${formatMoney(reward)}
Tasche: ${formatMoney(account.wallet)}

-----EXTOSITE BOT-----`
    });
}

if (command === "collect") {
    const account = ensureEconomy(sender);
    const now = Date.now();
    const cooldown = 8 * 60 * 60 * 1000;

    const totalIncome = Object.entries(account.businesses || {})
        .reduce((sum, [key, qty]) => sum + (businesses[key]?.income || 0) * qty, 0);

    if (totalIncome <= 0) {
        return sock.sendMessage(from, { text: "Du besitzt keine Geschäfte zum Einsammeln." });
    }

    if (account.lastCollect + cooldown > now) {
        const hours = Math.ceil((account.lastCollect + cooldown - now) / 3600000);
        return sock.sendMessage(from, { text: `⏳ Du kannst in ${hours} Stunden erneut Einnahmen einsammeln.` });
    }

    const collected = Math.max(0, Math.floor(totalIncome * 0.3));
    if (collected <= 0) {
        return sock.sendMessage(from, { text: "Du sammelst gerade nichts ein." });
    }

    let distributed = 0;
    const addedPerBiz = [];
    for (const [key, qty] of Object.entries(account.businesses || {})) {
        const bizIncome = (businesses[key]?.income || 0) * qty;
        if (!bizIncome) continue;
        const share = Math.floor(collected * (bizIncome / totalIncome));
        account.businessWallets[key] = (account.businessWallets[key] || 0) + share;
        distributed += share;
        if (share > 0) addedPerBiz.push(`• ${businesses[key]?.label}: ${formatMoney(share)}`);
    }

    const remainder = collected - distributed;
    if (remainder > 0) {
        account.wallet += remainder;
    }

    account.lastCollect = now;
    saveDatabase();

    const addedText = addedPerBiz.length ? addedPerBiz.join("\n") + `\n\nRest in Tasche: ${formatMoney(remainder)}` : `Rest in Tasche: ${formatMoney(remainder)}`;

    return sock.sendMessage(from, {
        text: `╔════════════════╗
║   EINSAMMELN   ║
╚════════════════╝

Du sammelst Einnahmen aus deinen Geschäften.
${addedText}
Tasche: ${formatMoney(account.wallet)}

-----EXTOSITE BOT-----`
    });
}

if (command === "shop") {
    let text = `╔════════════════╗
║   SHOP          ║
╚════════════════╝

`;

    for (const key of Object.keys(shopItems)) {
        const item = shopItems[key];
        text += `• ${item.label} (${key})
  Preis: ${formatMoney(item.price)}
  ${item.description}

`;
    }

    text += `Nutze: !buy <item> <anzahl>
!sell <item> <anzahl>
!inventory
-----EXTOSITE BOT-----`;

    return sock.sendMessage(from, { text });
}

if (command === "buy") {
    const account = ensureEconomy(sender);
    const itemKey = args[0]?.toLowerCase();
    const amount = parseAmount(args[1]) || 1;

    if (!itemKey || !shopItems[itemKey]) {
        return sock.sendMessage(from, { text: "❌ Nutze: !buy <item> <anzahl>" });
    }

    const item = shopItems[itemKey];
    const totalPrice = item.price * amount;

    if (account.wallet < totalPrice) {
        return sock.sendMessage(from, { text: `❌ Du brauchst ${formatMoney(totalPrice)}, aber hast nur ${formatMoney(account.wallet)}.` });
    }

    account.wallet -= totalPrice;
    account.inventory[itemKey] = (account.inventory[itemKey] || 0) + amount;
    saveDatabase();

    return sock.sendMessage(from, {
        text: `✅ Du hast ${amount}x ${item.label} gekauft.
Tasche: ${formatMoney(account.wallet)}
${item.label}: ${account.inventory[itemKey]} Stück

-----EXTOSITE BOT-----`
    });
}

if (command === "sell") {
    const account = ensureEconomy(sender);
    const itemKey = args[0]?.toLowerCase();
    const amount = parseAmount(args[1]) || 1;

    if (!itemKey || !shopItems[itemKey]) {
        return sock.sendMessage(from, { text: "❌ Nutze: !sell <item> <anzahl>" });
    }

    const have = account.inventory[itemKey] || 0;
    if (have < amount) {
        return sock.sendMessage(from, { text: `❌ Du besitzt nur ${have}x ${shopItems[itemKey].label}.` });
    }

    const sellValue = shopItems[itemKey].sellPrice * amount;
    account.inventory[itemKey] = have - amount;
    account.wallet += sellValue;
    saveDatabase();

    return sock.sendMessage(from, {
        text: `✅ Du hast ${amount}x ${shopItems[itemKey].label} verkauft und ${formatMoney(sellValue)} erhalten.
Tasche: ${formatMoney(account.wallet)}

-----EXTOSITE BOT-----`
    });
}

if (command === "inventory") {
    const account = ensureEconomy(sender);
    const items = Object.entries(account.inventory)
        .filter(([, qty]) => qty > 0)
        .map(([key, qty]) => `• ${shopItems[key]?.label || key}: ${qty}`)
        .join("\n") || "Keine Gegenstände vorhanden.";

    return sock.sendMessage(from, {
        text: `╔════════════════╗
║  INVENTAR       ║
╚════════════════╝

${items}

Tasche: ${formatMoney(account.wallet)}
Bank: ${formatMoney(account.bank)}

-----EXTOSITE BOT-----`
    });
}

if (command === "gamble") {
    const account = ensureEconomy(sender);
    const rawAmount = args[0]?.toLowerCase();
    const amount = rawAmount === "all" || rawAmount === "allin" ? account.wallet : parseAmount(rawAmount);
    if (!amount) {
        return sock.sendMessage(from, { text: "❌ Nutze: !gamble <betrag|all>" });
    }

    if (account.wallet < amount) {
        return sock.sendMessage(from, { text: "❌ Nicht genug Geld in der Tasche." });
    }

    const ticketBonus =
    account.inventory.ticket > 0
        ? GAMBLE_TICKET_BONUS
        : 0;

// nur 1 ticket abziehen
     if (account.inventory.ticket > 0) {
    account.inventory.ticket -= 1;
    saveDatabase();}
    const chance = Math.random();
    let resultText = "";

    if (chance < GAMBLE_BASE_CHANCE + ticketBonus) {
        const win = amount * (Math.random() < 0.25 ? 2 : 1.5);
        account.wallet += win;
        resultText = `🎉 Glückwunsch! Du gewinnst ${formatMoney(win)}. Gut gemacht!Spiel weiter für mehr!`;
    } else {
        account.wallet -= amount;
        resultText = `Schade, du verlierst ${formatMoney(amount)}. Versuch es noch einmal und vielleicht hast du mehr Glück!`;
    }

    saveDatabase();
    return sock.sendMessage(from, {
        text: `╔════════════════╗
║   CASINO PLAY   ║
╚════════════════╝

${resultText}
Tasche: ${formatMoney(account.wallet)}

-----EXTOSITE BOT-----`
    });
}

if (command === "role") {
    const account = ensureEconomy(sender);
    const sub = args[0]?.toLowerCase();

    if (sub === "choose") {
        const choice = args[1]?.toLowerCase();
        if (!choice || !roles[choice]) {
            return sock.sendMessage(from, { text: "❌ Rolle nicht gefunden. Nutze: !role choose <dealer|grower|smuggler|cop>" });
        }
        if (account.role === choice) {
            return sock.sendMessage(from, { text: `Du bist bereits ${roles[choice].label}.` });
        }
        account.role = choice;
        saveDatabase();
        return sock.sendMessage(from, { text: `Rolle gesetzt auf ${roles[choice].label}.` });
    }

    let text = `╔════════════════╗\n║   ROLLEN      ║\n╚════════════════╝\n\nAktuelle Rolle: ${roleLabel(account)}\n\nVerfügbare Rollen:\n`;
    for (const key of Object.keys(roles)) {
        text += `• ${roles[key].label} (${key}) - ${roles[key].description}\n`;
    }
    text += `\nNutze: !role choose <role> oder !drugmenu für Drogenbefehle.`;
    return sock.sendMessage(from, { text });
}

if (command === "setrole") {
    if (!isOwner(sender)) return sock.sendMessage(from, { text: "❌ Nur Owner." });
    const user = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid?.[0];
    const roleKey = args[1]?.toLowerCase();
    if (!user || !roleKey || !roles[roleKey]) {
        return sock.sendMessage(from, { text: "❌ Nutze: !setrole @user <role>" });
    }
    const target = ensureEconomy(user);
    target.role = roleKey;
    saveDatabase();
    return sock.sendMessage(from, { text: `Rolle von @${user.split("@")[0]} gesetzt auf ${roles[roleKey].label}.`, mentions: [user] });
}

if (command === "drugmenu") {
    const text = `╔════════════════╗\n║   DROGENMENU   ║\n╚════════════════╝\n\n[ ANBAU ]\n!buysamen <weed|coke|heroin> <anzahl> - Samen kaufen\n!grow <weed|coke|heroin> <anzahl> - Anbauen\n!harvest <weed|coke|heroin> - Ernte einfahren\n\n[ HANDEL ]\n!buydrug <item> <anzahl> - Drogenbedarf kaufen\n!selldrug <weed|coke|heroin> <anzahl> - Verkaufen\n!offerdrug <weed|coke|heroin> <anzahl> <preis> - Eigene Angebote erstellen\n!offers - Aktuelle Angebot anzeigen\n!buyoffer <id> - Angebot kaufen\n!canceloffer <id> - Eigenes Angebot zurückziehen\n!druginventory - Dein Drogeninventar anzeigen\n\n[ KONSUM ]\n!consume <weed|coke|heroin> <anzahl> - Konsumieren (Effekte & Risiko)\n\n[ INFOS ]\n!druglog - Letzte Drogenprotokolle anzeigen\n!drugboard - Drug-Leaderboard anzeigen\n!drugstats - Deine Drug-Statistiken anzeigen\n!jailstatus - Haftstatus prüfen\n!bail <betrag> - Kaution zahlen\n\n!role - Rollen anzeigen\n!role choose <role> - Rolle wählen\n!setrole @user <role> - Owner kann Rolle setzen\n!bust @user - Polizist kann jemanden festnehmen\n\nAchtung: Konsum kann zu Überdosis oder Arrest führen.`;
    return sendBotMessage(from, text);
}

if (command === "druglog") {
    const recent = (dbData.drugLog || []).slice(-8).reverse();
    if (!recent.length) {
        return sendBotMessage(from, "Keine Drogenprotokolle vorhanden.");
    }
    const text = recent.map(formatDrugLogEntry).join("\n");
    return sendBotMessage(from, `╔════════════════╗\n║   DROGENPROTOKOLL   ║\n╚════════════════╝\n\n${text}`);
}

if (command === "drugboard") {
    const board = getDrugLeaderboard();
    if (!board.length) {
        return sendBotMessage(from, "Keine Drug-Daten für das Leaderboard gefunden.");
    }
    const medals = ["🥇", "🥈", "🥉"];
    let text = `╔════════════════════════╗\n║   TOP 10 DRUG DEALER   ║\n╚════════════════════════╝\n\n`;
    
    for (let i = 0; i < board.length; i++) {
        const entry = board[i];
        const name = getDrugUserName(entry.userId);
        const medal = medals[i] || `${i + 1}.`;
        text += `${medal} @${name.split("@")[0]}\n   💰 Profit: ${formatMoney(entry.profit)} | 📦 Verkauft: ${entry.sold}\n\n`;
    }
    
    return sendBotMessage(from, text, {
        mentions: board.map(entry => entry.userId)
    });
}

if (command === "offers") {
    if (!drugOffers.length) {
        return sendBotMessage(from, "Keine aktuellen Drogenangebote vorhanden.");
    }
    const text = drugOffers.map((offer, index) => `#${index + 1} ID: ${offer.id}\n   Verkäufer: @${getDrugUserName(offer.seller)}\n   ${offer.amount}x ${drugs[offer.drug]?.label || offer.drug} für ${formatMoney(offer.price)}`).join("\n\n");
    return sendBotMessage(from, `╔════════════════════════╗\n║   DROGENMARKT         ║\n╚════════════════════════╝\n\n${text}` , {
        mentions: drugOffers.map((offer) => offer.seller)
    });
}

if (command === "offerdrug") {
    const account = ensureEconomy(sender);
    const drugKey = args[0]?.toLowerCase();
    const amount = parseAmount(args[1]);
    const price = parseAmount(args[2]);
    if (!drugKey || !drugs[drugKey] || !amount || !price) {
        return sendBotMessage(from, "❌ Nutze: !offerdrug <weed|coke|heroin> <anzahl> <preis>");
    }
    const stock = account.drugInventory[drugKey] || 0;
    if (stock < amount) {
        return sendBotMessage(from, `❌ Du hast nur ${stock}x ${drugs[drugKey].label}.`);
    }
    account.drugInventory[drugKey] -= amount;
    account.drugStats.offersCreated += 1;
    const offerId = `${Date.now().toString(36).slice(-3)}${Math.random().toString(36).slice(2, 5)}`.toUpperCase();
    const offer = {
        id: offerId,
        seller: sender,
        drug: drugKey,
        amount,
        price,
        time: Date.now()
    };
    drugOffers.push(offer);
    saveDatabase();
    return sendBotMessage(from, `Dein Angebot wurde erstellt:\nID: ${offer.id}\n${offer.amount}x ${drugs[offer.drug].label} für ${formatMoney(offer.price)}`);
}

if (command === "buyoffer") {
    const buyer = ensureEconomy(sender);
    let offerId = args[0];
    if (!offerId) {
        return sendBotMessage(from, "❌ Nutze: !buyoffer <angebot-id|nummer>");
    }
    offerId = offerId.replace(/^#/, "").toUpperCase();
    const index = drugOffers.findIndex((offer, idx) => offer.id === offerId || String(idx + 1) === offerId);
    if (index === -1) {
        return sendBotMessage(from, "❌ Angebot nicht gefunden.");
    }
    const offer = drugOffers[index];
    if (offer.seller === sender) {
        return sendBotMessage(from, "❌ Du kannst dein eigenes Angebot nicht kaufen.");
    }
    if (buyer.wallet < offer.price) {
        return sendBotMessage(from, `❌ Du brauchst ${formatMoney(offer.price)}, hast aber nur ${formatMoney(buyer.wallet)}.`);
    }
    const seller = ensureEconomy(offer.seller);
    buyer.wallet -= offer.price;
    seller.wallet += offer.price;
    buyer.drugInventory[offer.drug] = (buyer.drugInventory[offer.drug] || 0) + offer.amount;
    seller.drugStats.sold += offer.amount;
    seller.drugStats.profit += offer.price;
    buyer.drugStats.bought += offer.amount;
    buyer.drugStats.spent += offer.price;
    drugOffers.splice(index, 1);
    saveDatabase();
    logDrugEvent(sender, "buy_offer", `${offer.amount}x ${drugs[offer.drug].label} von ${getDrugUserName(offer.seller)} gekauft für ${formatMoney(offer.price)}`);
    return sendBotMessage(from, `✅ Angebot gekauft:\n${offer.amount}x ${drugs[offer.drug].label} für ${formatMoney(offer.price)}\nVerkäufer: @${getDrugUserName(offer.seller)}`, {
        mentions: [offer.seller]
    });
}

if (command === "canceloffer") {
    let offerId = args[0];
    if (!offerId) {
        return sendBotMessage(from, "❌ Nutze: !canceloffer <angebot-id|nummer>");
    }
    offerId = offerId.replace(/^#/, "").toUpperCase();
    const index = drugOffers.findIndex((offer, idx) => (offer.id === offerId || String(idx + 1) === offerId) && offer.seller === sender);
    if (index === -1) {
        return sendBotMessage(from, "❌ Angebot nicht gefunden oder gehört nicht dir.");
    }
    const offer = drugOffers.splice(index, 1)[0];
    const account = ensureEconomy(sender);
    account.drugInventory[offer.drug] = (account.drugInventory[offer.drug] || 0) + offer.amount;
    account.drugStats.offersCanceled += 1;
    saveDatabase();
    return sendBotMessage(from, `Dein Angebot wurde zurückgezogen und ${offer.amount}x ${drugs[offer.drug].label} wurde deinem Inventar zurückgegeben.`);
}

if (command === "drugstats") {
    const account = ensureEconomy(sender);
    const stats = account.drugStats;
    const drugInventory = Object.entries(account.drugInventory || {})
        .map(([key, qty]) => `• ${drugs[key]?.label || key}: ${qty}`)
        .join("\n") || "Keine Drogen im Inventar.";

    return sendBotMessage(from, `╔════════════════╗\n║   DRUG STATISTIK   ║\n╚════════════════╝\n\nSamen gekauft: ${stats.seedsBought}\nMaterial gekauft: ${stats.materialsBought}\nGepflanzt: ${stats.grown}\nGeerntet: ${stats.harvested}\nVerkauft: ${stats.sold}\nGekauft: ${stats.bought}\nAusgegeben: ${formatMoney(stats.spent)}\nAngebote erstellt: ${stats.offersCreated}\nAngebote storniert: ${stats.offersCanceled}\nKonsumiert: ${stats.consumed}\nProfit: ${formatMoney(stats.profit)}\nFestnahmen: ${stats.busts}\nVerhaftungen: ${stats.arrests}\n\nDrogeninventar:\n${drugInventory}`);
}

if (command === "druginventory") {
    const account = ensureEconomy(sender);
    const drugInventory = Object.entries(account.drugInventory || {})
        .map(([key, qty]) => `• ${drugs[key]?.label || key}: ${qty}`)
        .join("\n") || "Keine Drogen im Inventar.";
    const seedInventory = Object.entries({
        weed_seed: account.inventory.weed_seed || 0,
        keto_chem: account.inventory.keto_chem || 0,
        heroin_kit: account.inventory.heroin_kit || 0,
        fertilizer: account.inventory.fertilizer || 0,
        stash_box: account.inventory.stash_box || 0
    })
        .filter(([, qty]) => qty > 0)
        .map(([key, qty]) => `• ${drugMarket[key]?.label || key}: ${qty}`)
        .join("\n") || "Keine Materialien oder Samen.";

    return sendBotMessage(from, `╔════════════════╗\n║   DROGENINVENTAR   ║\n╚════════════════╝\n\nDrogen:\n${drugInventory}\n\nSamen & Materialien:\n${seedInventory}`);
}

if (command === "buysamen" || command === "buyseed") {
    const account = ensureEconomy(sender);
    const drugKey = args[0]?.toLowerCase();
    const amount = parseAmount(args[1]) || 1;
    const seedMap = { weed: "weed_seed", coke: "keto_chem", heroin: "heroin_kit" };
    const seedKey = seedMap[drugKey];
    if (!drugKey || !seedKey || !drugMarket[seedKey]) {
        return sendBotMessage(from, "❌ Nutze: !buysamen <weed|coke|heroin> <anzahl>");
    }
    const item = drugMarket[seedKey];
    const price = item.price * amount;
    if (account.wallet < price) {
        return sendBotMessage(from, `❌ Du brauchst ${formatMoney(price)}, hast aber nur ${formatMoney(account.wallet)}.`);
    }
    account.wallet -= price;
    account.inventory[seedKey] = (account.inventory[seedKey] || 0) + amount;
    account.drugStats.seedsBought += amount;
    logDrugEvent(sender, "buy_seeds", `${amount}x ${item.label} für ${formatMoney(price)}`);
    saveDatabase();
    return sendBotMessage(from, `Du hast ${amount}x ${item.label} gekauft. Verbleibend: ${formatMoney(account.wallet)}.`);
}

if (command === "buydrug") {
    const account = ensureEconomy(sender);
    const itemKey = args[0]?.toLowerCase();
    const amount = parseAmount(args[1]) || 1;
    if (!itemKey || !drugMarket[itemKey]) {
        return sendBotMessage(from, "❌ Nutze: !buydrug <item> <anzahl>");
    }
    const item = drugMarket[itemKey];
    const price = item.price * amount;
    if (account.wallet < price) {
        return sendBotMessage(from, `❌ Du brauchst ${formatMoney(price)}, hast aber nur ${formatMoney(account.wallet)}.`);
    }
    account.wallet -= price;
    account.inventory[itemKey] = (account.inventory[itemKey] || 0) + amount;
    if (itemKey === "fertilizer" || itemKey === "stash_box") {
        account.drugStats.materialsBought += amount;
    }
    logDrugEvent(sender, "buy_drug_item", `${amount}x ${item.label} für ${formatMoney(price)}`);
    saveDatabase();
    return sendBotMessage(from, `Du hast ${amount}x ${item.label} gekauft. Verbleibend: ${formatMoney(account.wallet)}.`);
}

if (command === "grow" || command === "plant") {
    const account = ensureEconomy(sender);
    if (isInJail(account)) {
        return sendBotMessage(from, `Du bist im Gefängnis. Warte ${jailRemaining(account)} Minuten.`);
    }
    const drugKey = args[0]?.toLowerCase();
    const amount = parseAmount(args[1]) || 1;
    const seedMap = { weed: "weed_seed", coke: "keto_chem", heroin: "heroin_kit" };
    const seedKey = seedMap[drugKey];
    if (!drugKey || !drugs[drugKey] || !seedKey) {
        return sendBotMessage(from, "❌ Nutze: !grow <weed|coke|heroin> <anzahl>");
    }
    if (!account.inventory[seedKey] || account.inventory[seedKey] < amount) {
        return sendBotMessage(from, `❌ Du hast nicht genug ${drugMarket[seedKey].label}.`);
    }
    account.inventory[seedKey] -= amount;
    account.crops[drugKey] = (account.crops[drugKey] || 0) + amount;
    account.lastPlant = Date.now();
    account.drugStats.grown += amount;
    logDrugEvent(sender, "grow", `${amount}x ${drugs[drugKey].label} gepflanzt`);
    saveDatabase();
    return sendBotMessage(from, `Du hast ${amount}x ${drugs[drugKey].label} gepflanzt. Ernte bereit in 20 Minuten.`);
}

if (command === "harvest") {
    const account = ensureEconomy(sender);
    if (isInJail(account)) {
        return sendBotMessage(from, `Du bist im Gefängnis. Warte ${jailRemaining(account)} Minuten.`);
    }
    const drugKey = args[0]?.toLowerCase();
    const planted = account.crops[drugKey] || 0;
    if (!drugKey || !drugs[drugKey] || !planted) {
        return sendBotMessage(from, "❌ Nutze: !harvest <weed|coke|heroin> (du musst zuvor gepflanzt haben)");
    }
    const now = Date.now();
    const wait = 20 * 60 * 1000;
    if (account.lastPlant + wait > now) {
        const minutes = Math.ceil((account.lastPlant + wait - now) / 60000);
        return sendBotMessage(from, `⏳ Die Pflanzen sind noch nicht reif. Warte ${minutes} Minuten.`);
    }
    const roleBonus = roles[account.role]?.growBonus || 0;
    const fertilizer = Math.min(account.inventory.fertilizer || 0, planted);
    const fertBonus = fertilizer * 0.02;
    const baseYield = Math.floor(planted * drugs[drugKey].harvestRate * (1 + roleBonus + fertBonus));
    account.drugInventory[drugKey] = (account.drugInventory[drugKey] || 0) + baseYield;
    account.crops[drugKey] = 0;
    account.inventory.fertilizer = (account.inventory.fertilizer || 0) - fertilizer;
    account.lastPlant = now;
    account.drugStats.harvested += baseYield;
    logDrugEvent(sender, "harvest", `${baseYield}x ${drugs[drugKey].label} geerntet`);
    saveDatabase();
    return sendBotMessage(from, `Ernte abgeschlossen: ${formatMoney(baseYield)} ${drugs[drugKey].label} erhalten.`);
}

if (command === "selldrug") {
    const account = ensureEconomy(sender);
    if (isInJail(account)) {
        return sendBotMessage(from, `Du bist im Gefängnis. Warte ${jailRemaining(account)} Minuten.`);
    }
    const drugKey = args[0]?.toLowerCase();
    const amount = parseAmount(args[1]);
    if (!drugKey || !drugs[drugKey] || !amount) {
        return sendBotMessage(from, "❌ Nutze: !selldrug <weed|coke|heroin> <anzahl>");
    }
    const stock = account.drugInventory[drugKey] || 0;
    if (stock < amount) {
        return sendBotMessage(from, `❌ Du hast nur ${stock}x ${drugs[drugKey].label}.`);
    }
    const stashBonus = account.inventory.stash_box ? 0.03 : 0;
    const role = roles[account.role] || roles.citizen;
    const marketFactor = 0.9 + Math.random() * 0.2;
    const price = Math.floor(drugs[drugKey].baseSell * amount * (1 + role.sellBonus + stashBonus) * marketFactor);
    const arrestRisk = Math.max(0, Math.min(0.25 + amount * 0.0 - stashBonus, 1));
    const arrested = checkDrugArrest(account, arrestRisk);
    account.drugInventory[drugKey] -= amount;
    if (arrested) {
        const jailTime = 20 * 60 * 1000 + Math.floor(Math.random() * 20 * 60 * 1000);
        account.jailRelease = Date.now() + jailTime;
        account.drugStats.arrests += 1;
        logDrugEvent(sender, "sell_arrest", `${amount}x ${drugs[drugKey].label} verkauft und erwischt`);
        saveDatabase();
        return sendBotMessage(from, `❌ Beim Verkauf wurdest du von der Polizei erwischt und bist für ${Math.ceil(jailTime / 60000)} Minuten im Gefängnis.`);
    }
    account.wallet += price;
    account.drugStats.sold += amount;
    account.drugStats.profit += price;
    logDrugEvent(sender, "sell", `${amount}x ${drugs[drugKey].label} verkauft für ${formatMoney(price)}`);
    saveDatabase();
    return sendBotMessage(from, `Verkauf erfolgreich: ${formatMoney(price)} erhalten. Verbleibendes ${drugs[drugKey].label}: ${account.drugInventory[drugKey]}.`);
}

if (command === "consume") {
    const account = ensureEconomy(sender);
    if (isInJail(account)) {
        return sendBotMessage(from, `Du bist im Gefängnis. Warte ${jailRemaining(account)} Minuten.`);
    }
    const drugKey = args[0]?.toLowerCase();
    const amount = parseAmount(args[1]) || 1;
    if (!drugKey || !drugs[drugKey] || !amount) {
        return sendBotMessage(from, "❌ Nutze: !consume <weed|coke|heroin> <anzahl>");
    }
    const stock = account.drugInventory[drugKey] || 0;
    if (stock < amount) {
        return sendBotMessage(from, `❌ Du hast nur ${stock}x ${drugs[drugKey].label}.`);
    }
    const effect = drugs[drugKey].label;
    const effectText = drugEffects[drugKey] || "Du spürst eine Wirkung.";
    account.drugInventory[drugKey] -= amount;
    const overdoseRisk = 0.03 * amount + (drugKey === "heroin" ? 0.08 : 0);
    if (Math.random() < overdoseRisk) {
        const loss = Math.min(account.wallet, 200);
        account.wallet -= loss;
        account.drugStats.consumed += amount;
        logDrugEvent(sender, "consume_overdose", `${amount}x ${drugs[drugKey].label} konsumiert und überdosiert`);
        saveDatabase();
        return sendBotMessage(from, `❌ Überdose! Du verlierst ${formatMoney(loss)} und musst dich erholen.`);
    }
    const arrestRisk = 0.08 + amount * 0.02;
    if (checkDrugArrest(account, arrestRisk)) {
        account.jailRelease = Date.now() + 20 * 60 * 1000;
        account.drugStats.consumed += amount;
        account.drugStats.arrests += 1;
        logDrugEvent(sender, "consume_arrest", `${amount}x ${drugs[drugKey].label} konsumiert und erwischt`);
        saveDatabase();
        return sendBotMessage(from, `❌ Beim Konsum wurdest du erwischt. Gefängnis für 20 Minuten.`);
    }
    const outcome = getDrugEffectOutcome(drugKey);
    if (outcome.wallet) {
        account.wallet += outcome.wallet;
    }
    if (outcome.exp) {
        account.exp += outcome.exp;
    }
    account.drugStats.consumed += amount;
    logDrugEvent(sender, "consume", `${amount}x ${drugs[drugKey].label} konsumiert`);
    saveDatabase();

    let resultText = `✅ Du konsumierst ${amount}x ${effect}.\n${effectText}`;
    if (outcome.wallet) {
        resultText += `\n${outcome.wallet > 0 ? `+${formatMoney(outcome.wallet)}` : `${formatMoney(outcome.wallet)}`} auf dein Wallet.`;
    }
    if (outcome.exp) {
        resultText += `\n+${outcome.exp} EXP.`;
    }
    resultText += `\n${outcome.text}`;

    return sendBotMessage(from, resultText);
}

if (command === "jailstatus") {
    const account = ensureEconomy(sender);
    if (!isInJail(account)) {
        return sendBotMessage(from, "Du bist nicht im Gefängnis.");
    }
    return sendBotMessage(from, `Gefängniszeit verbleibend: ${jailRemaining(account)} Minuten.`);
}

if (command === "bail") {
    const account = ensureEconomy(sender);
    if (!isInJail(account)) {
        return sendBotMessage(from, "Du bist nicht im Gefängnis.");
    }
    const amount = parseAmount(args[0]);
    if (!amount) {
        return sendBotMessage(from, "❌ Nutze: !bail <betrag>");
    }
    if (account.wallet < amount) {
        return sendBotMessage(from, "❌ Nicht genug Geld für Kaution.");
    }
    const remaining = jailRemaining(account);
    const cost = 10000000;
    if (amount < cost) {
        return sendBotMessage(from, `❌ Du brauchst mindestens ${formatMoney(cost)} für eine Freilassung.`);
    }
    account.wallet -= cost;
    account.jailRelease = Date.now();
    saveDatabase();
    return sendBotMessage(from, `Kaution bezahlt. Du bist frei.`);
}

if (command === "bust") {
    const account = ensureEconomy(sender);
    if (account.role !== "cop") {
        return sock.sendMessage(from, { text: "Nur Polizisten dürfen diesen Befehl nutzen." });
    }
    const now = Date.now();
    const cooldown = 10 * 60 * 1000;
    if (account.lastBust + cooldown > now) {
        const remaining = Math.ceil((account.lastBust + cooldown - now) / 60000);
        return sock.sendMessage(from, { text: `⏳ Du kannst in ${remaining} Minuten erneut bust versuchen.` });
    }
    const targetId = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid?.[0] || args[0];
    if (!targetId) {
        return sock.sendMessage(from, { text: "❌ Markiere eine Zielperson." });
    }
    account.lastBust = now;
    const targetAccount = ensureEconomy(targetId);
    if (isInJail(targetAccount)) {
        return sock.sendMessage(from, { text: "Zielperson ist bereits im Gefängnis." });
    }
    const hasDrugs = Object.values(targetAccount.drugInventory || {}).some(q => q > 0) || Object.values(targetAccount.crops || {}).some(q => q > 0);
    if (!hasDrugs) {
        return sock.sendMessage(from, { text: "Zielperson hat keine Drogenaktivität." });
    }
    const success = Math.random() < 0.6;
    if (!success) {
        return sock.sendMessage(from, { text: "Der Zugriff ist fehlgeschlagen. Ziel konnte entkommen." });
    }
    targetAccount.jailRelease = Date.now() + 25 * 60 * 1000;
    account.drugStats.busts += 1;
    targetAccount.drugStats.arrests += 1;
    logDrugEvent(sender, "bust", `@${targetId.split("@")[0]} festgenommen`);
    const reward = 300;
    account.wallet += reward;
    saveDatabase();
    return sock.sendMessage(from, { text: `Festnahme erfolgreich. Du erhältst ${formatMoney(reward)}.` });
}

if (command === "casino") {
    const account = ensureEconomy(sender);
    const subcommand = args[0]?.toLowerCase();

    if (!subcommand) {
        return sock.sendMessage(from, {
            text: `╔════════════════╗
║   CASINO MENU  ║
╚════════════════╝

!casino slots <betrag|all>
!casino roulette <betrag|all> <zahl|rot|schwarz>
!casino blackjack <betrag|all>

Bonus: !gamble <betrag> für schnellen Einsatz

-----EXTOSITE BOT-----`
        });
    }

    if (subcommand === "slots") {
        const rawAmount = args[1];
        const amount = rawAmount?.toLowerCase() === "all" || rawAmount?.toLowerCase() === "allin" ? account.wallet : parseAmount(rawAmount);
        if (!amount) {
            return sock.sendMessage(from, { text: "❌ Nutze: !casino slots <betrag|all>" });
        }
        if (account.wallet < amount) {
            return sock.sendMessage(from, { text: "❌ Nicht genug Geld in der Tasche." });
        }

        const symbols = ["🍒", "🍋", "🍇", "⭐", "7️⃣", "🔔"];
        const result = [getRandomElement(symbols), getRandomElement(symbols), getRandomElement(symbols)];
        let multiplier = 0;
        let resultText = "";

        if (result[0] === result[1] && result[1] === result[2]) {
            if (result[0] === "7️⃣") multiplier = 10;
            else if (result[0] === "⭐") multiplier = 7;
            else multiplier = 5;
            resultText = `🎉 JACKPOT! Dreifach ${result[0]}!`;
        } else if (result[0] === result[1] || result[1] === result[2] || result[0] === result[2]) {
            multiplier = 2;
            resultText = `✨ Zwei Symbole stimmen überein!`;
        } else {
            multiplier = 0;
            resultText = `😢 Leider verloren.`;
        }

        const payout = Math.floor(amount * multiplier);
        account.wallet = account.wallet - amount + payout;
        saveDatabase();

        return sock.sendMessage(from, {
            text: `╔════════════════╗
║     SLOTS      ║
╚════════════════╝

${formatCasinoGameLine(result)}

${resultText}
Einsatz: ${formatMoney(amount)}
Gewinn: ${formatMoney(payout)}
Tasche: ${formatMoney(account.wallet)}

-----EXTOSITE BOT-----`
        });
    }

    if (subcommand === "roulette") {
        const rawAmount = args[1];
        const amount = rawAmount?.toLowerCase() === "all" || rawAmount?.toLowerCase() === "allin" ? account.wallet : parseAmount(rawAmount);
        const betChoice = args[2]?.toLowerCase();

        if (!amount || !betChoice) {
            return sock.sendMessage(from, { text: "❌ Nutze: !casino roulette <betrag|all> <zahl|rot|schwarz>" });
        }
        if (account.wallet < amount) {
            return sock.sendMessage(from, { text: "❌ Nicht genug Geld in der Tasche." });
        }

        const spin = Math.floor(Math.random() * 37);
        const color = spin === 0 ? "grün" : isRedNumber(spin) ? "rot" : "schwarz";
        let payout = 0;
        let resultText = `🎯 Die Kugel landete auf ${spin} (${color}).`;

        if (betChoice === color) {
            payout = amount * 2;
            resultText += " Du hast auf die richtige Farbe gesetzt!";
        }
        else if (!isNaN(Number(betChoice)) && Number(betChoice) === spin) {
            payout = amount * 35;
            resultText += " Volltreffer auf die richtige Zahl!";
        } else {
            payout = 0;
            resultText += " Du hast verloren.";
        }

        account.wallet = account.wallet - amount + payout;
        saveDatabase();

        return sock.sendMessage(from, {
            text: `╔════════════════╗
║    ROULETTE    ║
╚════════════════╝

${resultText}
Einsatz: ${formatMoney(amount)}
Gewinn: ${formatMoney(payout)}
Tasche: ${formatMoney(account.wallet)}

-----EXTOSITE BOT-----`
        });
    }

    if (subcommand === "blackjack") {
        const rawAmount = args[1];
        const amount = rawAmount?.toLowerCase() === "all" || rawAmount?.toLowerCase() === "allin" ? account.wallet : parseAmount(rawAmount);
        if (!amount) {
            return sock.sendMessage(from, { text: "❌ Nutze: !casino blackjack <betrag|all>" });
        }
        if (account.wallet < amount) {
            return sock.sendMessage(from, { text: "❌ Nicht genug Geld in der Tasche." });
        }

        const drawCard = () => Math.floor(Math.random() * 10) + 2;
        const playerTotal = drawCard() + drawCard();
        const dealerTotal = drawCard() + drawCard();
        let payout = 0;
        let resultText = "";

        if (playerTotal > 21) {
            resultText = `😢 Du bist übergespielt mit ${playerTotal}.`;
        } else if (dealerTotal > 21) {
            payout = amount * 2;
            resultText = `🎉 Dealer bustet mit ${dealerTotal}!`;
        } else if (playerTotal > dealerTotal) {
            payout = amount * 2;
            resultText = `🎉 Du gewinnst mit ${playerTotal} gegen ${dealerTotal}!`;
        } else if (playerTotal === dealerTotal) {
            payout = amount;
            resultText = `🤝 Unentschieden: ${playerTotal} gegen ${dealerTotal}.`;
        } else {
            resultText = `😢 Dealer gewinnt mit ${dealerTotal} gegen ${playerTotal}.`;
        }

        account.wallet = account.wallet - amount + payout;
        saveDatabase();

        return sock.sendMessage(from, {
            text: `╔════════════════╗
║   BLACKJACK    ║
╚════════════════╝

Dein Blatt: ${playerTotal}
Dealer Blatt: ${dealerTotal}

${resultText}
Einsatz: ${formatMoney(amount)}
Gewinn: ${formatMoney(payout)}
Tasche: ${formatMoney(account.wallet)}

-----EXTOSITE BOT-----`
        });
    }

    return sock.sendMessage(from, {
        text: `❌ Unbekanntes Casino-Spiel.
Nutze: !casino
Verfügbare Spiele: slots, roulette, blackjack`}
    );
}

if (command === "rob") {
    const account = ensureEconomy(sender);
    const mentionedTarget = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid?.[0];
    const rawTarget = args[0]?.replace(/\D/g, "");
    const target = mentionedTarget || (rawTarget ? `${rawTarget}@s.whatsapp.net` : null);

    if (!target) {
        return sock.sendMessage(from, { text: "❌ Markiere einen Nutzer oder gib seine Nummer an, den du ausrauben willst." });
    }

    if (isOwner(target) || target === sender) {
        return sock.sendMessage(from, { text: "❌ Dieser Nutzer kann nicht ausgeraubt werden." });
    }

    const now = Date.now();
    const cooldown = 60 * 60 * 1000;
    if (account.lastRob + cooldown > now) {
        const minutes = Math.ceil((account.lastRob + cooldown - now) / 60000);
        return sock.sendMessage(from, { text: `⏳ Du kannst noch in ${minutes} Minuten wieder ausrauben.` });
    }

    const targetAccount = ensureEconomy(target);
    const stealAmount = Math.floor(Math.random() * (targetAccount.wallet * 0.3)) + 50;
    const success = Math.random() < 0.45;

    if (!success) {
        account.wallet = Math.max(0, account.wallet - 100);
        account.lastRob = now;
        saveDatabase();

        return sock.sendMessage(from, {
            text: `❌ Überfall fehlgeschlagen. Du verlierst 100₽ als Strafe.
Tasche: ${formatMoney(account.wallet)}`
        });
    }

    const actualSteal = Math.min(targetAccount.wallet, stealAmount);
    if (actualSteal <= 0) {
        return sock.sendMessage(from, { text: "❌ Ziel hat kein Geld." });
    }

    targetAccount.wallet -= actualSteal;
    account.wallet += actualSteal;
    account.lastRob = now;
    saveDatabase();

    return sock.sendMessage(from, {
        text: `✅ Du hast @${target.split("@")[0]} ${formatMoney(actualSteal)} gestohlen.
Tasche: ${formatMoney(account.wallet)}

-----EXTOSITE BOT-----`,
        mentions: [target]
    });
}

if (command === "invest") {
    const account = ensureEconomy(sender);
    const amount = parseAmount(args[0]);
    const now = Date.now();
    const cooldown = 2 * 60 * 60 * 1000;

    if (!amount) {
        return sock.sendMessage(from, { text: "❌ Nutze: !invest <betrag>" });
    }

    if (account.wallet < amount) {
        return sock.sendMessage(from, { text: "❌ Nicht genug Geld in der Tasche." });
    }

    if (account.lastInvest + cooldown > now) {
        const hours = Math.ceil((account.lastInvest + cooldown - now) / 3600000);
        return sock.sendMessage(from, { text: `⏳ Du kannst in ${hours} Stunden wieder investieren.` });
    }

    const gain = Math.floor(amount * (0.1 + Math.random() * 0.25));
    account.wallet -= amount;
    account.wallet += amount + gain;
    account.lastInvest = now;
    account.exp += 80;
    saveDatabase();

    return sock.sendMessage(from, {
        text: `╔════════════════╗
║   INVESTMENT   ║
╚════════════════╝

Du erhältst ${formatMoney(amount + gain)} zurück.
Gewinn: ${formatMoney(gain)}
Tasche: ${formatMoney(account.wallet)}
+80 EXP

-----EXTOSITE BOT-----`
    });
}

if (command === "level" || command === "exp") {
    const account = ensureEconomy(sender);
    const nextLevelExp = account.level * 500;
    const expPercent = Math.floor((account.exp / nextLevelExp) * 100);

    return sock.sendMessage(from, {
        text: `╔════════════════╗
║   LEVEL INFO    ║
╚════════════════╝

Level: ${account.level}
EXP: ${account.exp} / ${nextLevelExp}
Progress: ${"█".repeat(Math.floor(expPercent / 10))}${"░".repeat(10 - Math.floor(expPercent / 10))} ${expPercent}%

-----EXTOSITE BOT-----`
    });
}

if (command === "mission") {
    const account = ensureEconomy(sender);
    const now = Date.now();
    const missionCooldown = 12 * 60 * 60 * 1000;
    const missionList = Object.entries(missions).map(([k, v]) => `• ${v.label} (+${v.reward}₽, +${v.exp}XP)`).join("\n");

    if (account.lastMission + missionCooldown > now) {
        const hours = Math.ceil((account.lastMission + missionCooldown - now) / 3600000);
        return sock.sendMessage(from, { text: `⏳ Du kannst die nächste Mission in ${hours} Stunden starten.` });
    }

    const missionKeys = Object.keys(missions);
    const randomMission = missionKeys[Math.floor(Math.random() * missionKeys.length)];
    const mission = missions[randomMission];

    account.wallet += mission.reward;
    account.exp += mission.exp;
    account.completedMissions = account.completedMissions || [];
    account.completedMissions.push(randomMission);
    account.lastMission = now;
    saveDatabase();

    return sock.sendMessage(from, {
        text: `✅ Mission abgeschlossen: ${mission.label}
+${formatMoney(mission.reward)}
+${mission.exp} EXP

Tasche: ${formatMoney(account.wallet)}

-----EXTOSITE BOT-----`
    });
}

if (command === "business" || command === "biz") {
    let text = `╔════════════════╗
║   BUSINESSES    ║
╚════════════════╝

`;
    
    for (const [key, biz] of Object.entries(businesses)) {
        text += `• ${biz.label} (${key})\n  Preis: ${formatMoney(biz.price)}\n  Einkommen: ${formatMoney(biz.income)}/Tag\n\n`;
    }

    text += `Nutze: !buybiz <type>\nAktive Geschäfte: !mybiz

-----EXTOSITE BOT-----`;

    return sock.sendMessage(from, { text });
}

if (command === "buybiz") {
    const account = ensureEconomy(sender);
    const bizType = args[0]?.toLowerCase();

    if (!bizType || !businesses[bizType]) {
        return sock.sendMessage(from, { text: "❌ Nutze: !buybiz <type>" });
    }

    const biz = businesses[bizType];
    const businessCount = Object.values(account.businesses || {}).reduce((a, b) => a + (Number(b) || 0), 0);
    if (businessCount >= (account.businessSlots || 3)) {
        return sock.sendMessage(from, { text: `❌ Du hast keine freien Business-Slots. (${businessCount}/${account.businessSlots})` });
    }

    if (account.wallet < biz.price) {
        return sock.sendMessage(from, { text: `❌ Du brauchst ${formatMoney(biz.price)}, aber hast nur ${formatMoney(account.wallet)}.` });
    }

    account.wallet -= biz.price;
    account.businesses[bizType] = (account.businesses[bizType] || 0) + 1;
    account.businessWallets[bizType] = account.businessWallets[bizType] || 0;
    account.exp += 200;
    saveDatabase();

    return sock.sendMessage(from, {
        text: `✅ Du hast ${biz.label} gekauft!
Tasche: ${formatMoney(account.wallet)}
+200 EXP

-----EXTOSITE BOT-----`
    });
}

if (command === "mybiz") {
    const account = ensureEconomy(sender);
    const bizList = Object.entries(account.businesses || {})
        .filter(([, qty]) => qty > 0)
        .map(([key, qty]) => `• ${businesses[key]?.label}: ${qty}x (${formatMoney(businesses[key]?.income * qty)}/Tag) — Geld: ${formatMoney(account.businessWallets?.[key]||0)}`)
        .join("\n") || "Keine Geschäfte.";

    const dailyIncome = Object.entries(account.businesses || {})
        .reduce((sum, [key, qty]) => sum + (businesses[key]?.income * qty || 0), 0);

    const businessCount = Object.values(account.businesses || {}).reduce((a, b) => a + (Number(b) || 0), 0);
    const slots = account.businessSlots || 3;
    const now = Date.now();
    const nextCollectIn = Math.max(0, Math.ceil(((account.lastCollect || 0) + 8 * 60 * 60 * 1000 - now) / 3600000));

    return sock.sendMessage(from, {
        text: `╔════════════════╗
║   MEINE BIZZEN  ║
╚════════════════╝

${bizList}

Tägliches Einkommen: ${formatMoney(dailyIncome)}
Aktive Geschäfte: ${businessCount}/${slots}
Nächste Einsammlung in: ${nextCollectIn} Stunden

-----EXTOSITE BOT-----`
    });
}

if (command === "withdrawbiz") {
    const account = ensureEconomy(sender);
    const target = args[0]?.toLowerCase();

    if (!target) {
        return sock.sendMessage(from, { text: "❌ Nutze: !withdrawbiz <type|all> [anzahl]" });
    }

    if (target === 'all') {
        const total = Object.values(account.businessWallets || {}).reduce((a, b) => a + (Number(b) || 0), 0);
        if (total <= 0) return sock.sendMessage(from, { text: "❌ Du hast keine Einnahmen in deinen Businesses." });
        for (const k of Object.keys(account.businessWallets || {})) account.businessWallets[k] = 0;
        account.wallet += total;
        saveDatabase();
        return sock.sendMessage(from, { text: `✅ Du hast ${formatMoney(total)} von allen Businesses abgehoben. Tasche: ${formatMoney(account.wallet)}` });
    }

    if (!account.businessWallets[target] || account.businessWallets[target] <= 0) {
        return sock.sendMessage(from, { text: "❌ Keine Einnahmen für dieses Business verfügbar." });
    }

    const amount = parseAmount(args[1]) || account.businessWallets[target];
    const withdraw = Math.min(amount, account.businessWallets[target]);
    account.businessWallets[target] -= withdraw;
    account.wallet += withdraw;
    saveDatabase();

    return sock.sendMessage(from, { text: `✅ Du hast ${formatMoney(withdraw)} von ${businesses[target]?.label || target} abgehoben. Tasche: ${formatMoney(account.wallet)}` });
}

if (command === "profile" || command === "profil") {
    const account = ensureEconomy(sender);
    const username = sender.split("@")[0];
    const totalWealth = (account.wallet || 0) + (account.bank || 0);
    const businessCount = Object.values(account.businesses || {}).reduce((a, b) => a + (Number(b) || 0), 0);
    const inventoryCount = Object.values(account.inventory || {}).reduce((a, b) => a + (Number(b) || 0), 0);

    return sock.sendMessage(from, {
        text: `╔════════════════╗
║   PROFIL       ║
╚════════════════╝

Nutzer: @${username}
Level: ${account.level || 1}
EXP: ${account.exp || 0}
Job: ${account.job || 'unemployed'}

💰 Vermögen: ${formatMoney(totalWealth)}
  Tasche: ${formatMoney(account.wallet)}
  Bank: ${formatMoney(account.bank)}

🏢 Geschäfte: ${businessCount}
📦 Inventar: ${inventoryCount} Items

-----EXTOSITE BOT-----`,
        quoted: msg
    });
}

if (command === "economymenu") {
    return sock.sendMessage(from, {
        text: `╔════════════════════════╗
║   ECONOMY MENU          ║
╚════════════════════════╝

[ GRUNDLAGEN ]
!bal - Geld anzeigen
!bank deposit <betrag>
!bank withdraw <betrag>
!pay @user <betrag>

[ VERDIENEN ]
!work - Arbeiten (45min cooldown)
!daily - Daily Reward
!search - Suche nach Verdienstquellen (30min cooldown)
!task - Erfülle eine Aufgabe (60min cooldown)
!collect - Einnahmen aus Geschäften einsammeln (8h cooldown)
!job <name> - Job wechseln
!jobs - Alle Jobs anzeigen

[ SPIELEN ]
!casino - Casino Menü
!casino slots <betrag>
!casino roulette <betrag> <zahl|rot|schwarz>
!casino blackjack <betrag>
!gamble <betrag> - Glücksspiel
!lottery <betrag> - Lotterie spielen
!gift @user <betrag> - Geld verschenken
!rob @user - Ausrauben
!invest <betrag> - Investieren

[ SHOPPING ]
!shop - Shop öffnen
!buy <item> <anzahl> - Kaufen
!sell <item> <anzahl> - Verkaufen
!inventory - Inventar anzeigen

[ DROGEN & ROLLEN ]
!drugmenu - Drogenmenü öffnen
!buydrug <item> <anzahl> - Drogenbedarf kaufen
!buysamen <weed|coke|heroin> <anzahl> - Samen für den Anbau kaufen
!grow <weed|coke|heroin> <anzahl> - Anbauen
!harvest <weed|coke|heroin> - Ernte einfahren
!selldrug <weed|coke|heroin> <anzahl> - Verkaufen
!consume <weed|coke|heroin> <anzahl> - Konsumieren
!druglog - Letzte Drogenprotokolle anzeigen
!drugboard - Drug-Leaderboard anzeigen
!drugstats - Deine Drug-Statistiken anzeigen
!druginventory - Dein Drogeninventar anzeigen
!role - Rollen anzeigen
!role choose <role> - Rolle wählen
!jailstatus - Haftstatus prüfen
!bail <betrag> - Kaution zahlen
!bust @user - Festnahme als Cop

[ LEVEL SYSTEM ]
!level - Level & EXP anzeigen
!profile - Dein Profil

[ QUESTS & BUSINESS ]
!mission - Tägliche Mission
!business - Geschäfte anzeigen
!buybiz <type> - Geschäft kaufen
!mybiz - Deine Geschäfte

[ SONSTIGES ]
!leaderboard - Rangliste

-----EXTOSITE BOT-----`
    });
}

if (command === "groupmenu") {
    return sock.sendMessage(from, {
        text: `╔════════════════════════╗
║   GROUP MENU            ║
╚════════════════════════╝

[ ADMIN COMMANDS ]
!tagall - Alle taggen
!kick @user - User kicken
!mute @user - User stummschalten
!unmute @user - Stummschaltung aufheben
!promote @user - Admin machen
!demote @user - Admin entfernen
!warn @user - Verwarnung
!warnings - Verwarnungen anzeigen
!resetwarns @user - Verwarnungen löschen

[ EINSTELLUNGEN ]
!setname <text> - Gruppennamen ändern
!setdesc <text> - Gruppenbeschreibung ändern
!open - Gruppe öffnen
!close - Gruppe schließen
!link - Gruppe Link
!welcome on/off - Willkommensnachrichten

[ INFO ]
!admins - Admin Liste
!groupstats - Gruppen Statistiken
!listmuted - Stumme User

[ ANTI SPAM ]
!antilink on/off - Anti-Link aktivieren

-----EXTOSITE BOT-----`
    });
}

if (command === "hidetag") {

    const meta =
        await sock.groupMetadata(from);

    const mentions =
        meta.participants.map(
            p => p.id
        );

    return sock.sendMessage(from, {
        text: args.join(":---Hidetag---:") || ":---Hidetag---:",
        mentions
    });
}


// ========================================
// MODE COMMAND
// ========================================

if (command === "mode") {

    // nur owner
    if (!isOwner(sender)) {
        return sock.sendMessage(from, {
            text: "❌ Nur Owner"
        });
    }

    const mode = args[0]?.toLowerCase();

    // kein argument
    if (!mode) {
        return sock.sendMessage(from, {
            text:
`╔════════════╗
║ BOT MODE
╚════════════╝

Aktuell:
${botMode}

Commands:
!mode public
!mode private

-----EXTOSITE BOT-----`
        });
    }

    // PUBLIC
    if (mode === "public") {

        botMode = "public";

        return sock.sendMessage(from, {
            text:
`╔════════════╗
║ BOT MODE
╚════════════╝

 Modus: PUBLIC

Jeder kann Commands nutzen

-----EXTOSITE BOT-----`
        });
    }

    // PRIVATE
    if (mode === "private") {

        botMode = "private";

        return sock.sendMessage(from, {
            text:
`╔════════════╗
║ BOT MODE
╚════════════╝

Modus: PRIVATE

Nur Owner + VIPs können Commands nutzen

-----EXTOSITE BOT-----`
        });
    }

    // falscher mode
    return sock.sendMessage(from, {
        text: "❌ Nutze: !mode public/private"
    });
}
if (command === "del") {

    if (!msg.message?.extendedTextMessage?.contextInfo?.stanzaId) {
        return sock.sendMessage(from, {
            text: "❌ Antworte auf eine Nachricht, die gelöscht werden soll"
        });
    }

    const quoted = msg.message.extendedTextMessage.contextInfo;

    const key = {
        remoteJid: from,
        id: quoted.stanzaId,
        participant: quoted.participant
    };

    try {
        await sock.sendMessage(from, {
            delete: key
        });

        return sock.sendMessage(from, {
            text: `╔════════════════╗
║   EXTOSITE BOT
╚════════════════╝
        
Müll erfolgreich entfernt!

-----EXTOSITE BOT-----`
        });

    } catch (err) {
        console.log(err);
        return sock.sendMessage(from, {
            text: "❌ Löschen fehlgeschlagen (keine Rechte oder zu alt)"
        });
    }
}
if (command === "status") {

    return sock.sendMessage(from, {
        text:
`🤖 BOT STATUS

• Uptime: ${Math.floor(process.uptime())}s
• Node: ${process.version}
• Plattform: ${process.platform}
• Status: Online

-----EXTOSITE BOT-----`
    });
}
if (command === "link") {

    if (!from.endsWith("@g.us")) return;

    const code = await sock.groupInviteCode(from);

    return sock.sendMessage(from, {
        text: `🔗 https://chat.whatsapp.com/${code}
        
        -----EXTOSITE BOT-----`
    });
}
if (command === "fact") {

    const facts = [
        "Bienen können Menschen erkennen.",
        "Das Gehirn verbraucht ~20% Energie.",
        "Es gibt mehr Sterne als Sandkörner.",
        "Wale schlafen halbseitig."
    ];

    return sock.sendMessage(from, {
        text: "🧠 " + facts[Math.floor(Math.random() * facts.length)]
    });
}

if (command === "love") {

    const percent = Math.floor(Math.random() * 101);

    let text = "💘 Liebe zwischen euch: " + percent + "%";

    if (percent > 80) text += "\n🔥 Perfekt Match!";
    else if (percent > 50) text += "\n🙂 Passt gut";
    else text += "\n💀 Schwierig...";

    return sock.sendMessage(from, { text });
}
if (command === "promote") {

    const user =
        msg.message?.extendedTextMessage
        ?.contextInfo?.mentionedJid?.[0];

    if (!user) return;

    await sock.groupParticipantsUpdate(
        from,
        [user],
        "promote"
    );

    return sock.sendMessage(from, {
        text: "user promoted"
    });
}
if (command === "demote") {

    const user =
        msg.message?.extendedTextMessage
        ?.contextInfo?.mentionedJid?.[0];

    if (!user) return;

    await sock.groupParticipantsUpdate(
        from,
        [user],
        "demote"
    );

    return sock.sendMessage(from, {
        text: "user demoted"
    });
}
if (command === "listmuted") {

    if (!mutedUsers[from]?.length) {

        return sock.sendMessage(from, {
            text: "keine muted user"
        });
    }

    let text =
`╔════════════════╗
║   EXTOSITE BOT
╚════════════════╝

MUTED USERS:
`;

    for (const user of mutedUsers[from]) {

        text +=
`• @${user.split("@")[0]}

-----EXTOSITE BOT-----
`;
    }

    return sock.sendMessage(from, {
        text,
        mentions: mutedUsers[from]
    });
}
if (command === "goonen") {

    await sock.sendMessage(from, {
        text: `╔════════════════╗
║   EXTOSITE BOT
╚════════════════╝
Gründe für Goonen:
Intensiverer Orgasmus: Maximale sexuelle Energie durch langes Hinauszögern.
Tranceartige Entspannung: Meditativer, fokussierter Geisteszustand durch Monotonie.
Hohe Dopaminausschüttung: Dauerhafte Aktivierung des körpereigenen Belohnungssystems.
Bessere Körperkontrolle: Genaues Kennenlernen der eigenen Erregungskurven.
Erhöhte Ausdauer: Training des Stehvermögens für den Paarsex.
Effektiver Stressabbau: Starke Ablenkung und Reduzierung von Cortisol.
Ausgiebige „Me-Time“: Bewusste, stundenlange Beschäftigung mit sich selbst.
Prostatagesundheit: Fördert Durchblutung und regelmäßige sexuelle Aktivität.
Beckenbodentraining: Stärkung und anschließende Entspannung der Muskulatur.
Tiefes Fantasie-Erleben: Zeit für das intensive Ausleben sexueller Gedanken.

-----EXTOSITE BOT-----
`,
    });

}
if (command === "bot") {

    await sock.sendMessage(from, {
        text: `╔════════════════╗
║   EXTOSITE BOT
╚════════════════╝
Started programming:14.05.26
Zeilen code:1200
Commands: 38

-----EXTOSITE BOT-----
`,
    });

}

if (["pp", "profile", "avatar"].includes(command)) {

    const user =
        msg.message?.extendedTextMessage?.contextInfo?.mentionedJid?.[0]
        || sender;

    try {

        const pp = await sock.profilePictureUrl(user, "image");

        await sock.sendMessage(from, {
            image: { url: pp },
            caption: `Profilbild`
        });

    } catch (err) {

        await sock.sendMessage(from, {
            text: "Kein Profilbild gefunden"
        });
    }
}
if (command === "saveimg") {
    const mediaMsg =
        msg.message?.imageMessage ||
        msg.message?.extendedTextMessage?.contextInfo?.quotedMessage?.imageMessage;

    if (!mediaMsg) {
        return sock.sendMessage(from, {
            text: "Bitte sende ein Bild oder antworte auf ein Bild."
        });
    }

    try {
        const buffer = await downloadMediaMessage(
            msg,
            "buffer",
            {},
            { logger: P({ level: "silent" }) }
        );

        const fileName = `saved_images/img_${Date.now()}.jpg`;
        fs.writeFileSync(fileName, buffer);

        return sock.sendMessage(from, {
            text: `Bild gespeichert als ${fileName}`
        });
    } catch (err) {
        console.log(err);
        return sock.sendMessage(from, {
            text: "Fehler beim Speichern des Bildes"
        });
    }
}
if (command === "savedlist") {
    const folder = "./saved_images";
    const files = fs.existsSync(folder)
        ? fs.readdirSync(folder)
        : [];

    if (!files.length) {
        return sock.sendMessage(from, {
            text: "Keine gespeicherten Bilder gefunden."
        });
    }

    return sock.sendMessage(from, {
        text: `Gespeicherte Bilder:\n${files.join("\n")}`
    });
}
if (command === "restart") {

    if (!isOwner(sender)) return;

    await sock.sendMessage(from, {
        text: "restarting..."
    });

    process.exit();
}
if (command === "shutdown") {

    if (!isOwner(sender)) return;

    await sock.sendMessage(from, {
        text: "shutdown..."
    });

    process.exit();
}

                if (command === "help") {

                    return sock.sendMessage(from, {
                        text:
                            "Mach !menu"
                    });
                }

                if (command === "owner") {

                    return sock.sendMessage(from, {
                        text:
                            " Owner: Extosite (Josias)"
                    });
                }

                if (command === "runtime") {

                    return sock.sendMessage(from, {
                        text:
`╔════════════════╗
║   EXTOSITE BOT
╚════════════════╝
        
Runtime:

Node.js: ${process.version}
Platform: ${process.platform}

-----EXTOSITE BOT-----`
                    });
                }

                if (command === "uptime") {

                    return sock.sendMessage(from, {
                        text:
`╔════════════════╗
║   EXTOSITE BOT
╚════════════════╝
        
 Uptime:
${Math.floor(process.uptime())} Sekunden

-----EXTOSITE BOT-----`
                    });
                }

                if (command === "vip") {

                    return sock.sendMessage(from, {
                        text: isVip(sender)
                            ? " Du bist VIP.Glückwunsch!"
                            : "Kein VIP.Wenn du willst --> Bettel"
                    });
                }

                // ========================================
                // 🎲 FUN
                // ========================================

                if (command === "dice") {

                    return sock.sendMessage(from, {
                        text:
`╔════════════════╗
║   EXTOSITE BOT
╚════════════════╝

Ergebnis:
${Math.floor(Math.random() * 6) + 1}

-----EXTOSITE BOT-----`
                    });
                }

                if (command === "coinflip") {

                    return sock.sendMessage(from, {
                        text:
                            Math.random() < 0.5
                                ? "🪙 Kopf"
                                : "🪙 Zahl"
                    });
                }

                if (command === "joke") {

                    const jokes = [
                        "Warum Computer? Virus 😂",
                        "Geister lügen nie 👻",
                        "Piraten können kein Pi fahren 🏴‍☠️",
                        "JavaScript liebt Fehler 😭"
                    ];

                    return sock.sendMessage(from, {
                        text:
                            jokes[
                                Math.floor(
                                    Math.random() *
                                    jokes.length
                                )
                            ]
                    });
                }

                if (command === "rate") {

                    return sock.sendMessage(from, {
                        text:
`╔════════════════╗
║   EXTOSITE BOT
╚════════════════╝
Rating:
${Math.floor(Math.random() * 101)}%`
                    });
                }

                if (command === "8ball") {

                    const answers = [
                        "Ja",
                        "Nein",
                        "Vielleicht",
                        "Definitiv",
                        "Sehr wahrscheinlich",
                        "Das was Josias sagt"
                    ];

                    return sock.sendMessage(from, {
                        image: fs.readFileSync("./8ball.png"),
                        caption:
`
🎱 ${answers[
    Math.floor(
        Math.random() *
        answers.length
    )
]}`
                    });
                }

                if (command === "ship") {

                    return sock.sendMessage(from, {
                        text:
`╔════════════════╗
║   EXTOSITE BOT
╚════════════════╝
    
❤️ Ship:
${Math.floor(Math.random() * 101)}%

-----EXTOSITE BOT-----`
                    });
                }

                if (command === "fakehack") {

                    return sock.sendMessage(from, {
                        text:
`╔════════════════╗
║   EXTOSITE BOT
╚════════════════╝

💻 Hacke Pentagon...

███████░░░ 70%

❌ Zugriff verweigert`
                    });
                }

                // ========================================
                // 👑 OWNER COMMANDS
                // ========================================
              
                if (command === "addvip") {

                    if (!isOwner(sender)) {

                        return sock.sendMessage(from, {
                            text:
                                "❌ Nur Owner"
                        });
                    }

                    const user =
                        msg.message
                            ?.extendedTextMessage
                            ?.contextInfo
                            ?.mentionedJid?.[0];

                    if (!user) {

                        return sock.sendMessage(from, {
                            text:
                                "❌ Markiere User"
                        });
                    }

                    if (!vipUsers.includes(user)) {
                        vipUsers.push(user);
                    }

                    return sock.sendMessage(from, {
                        text:
                            "💎 VIP hinzugefügt"
                    });
                }

                if (command === "delvip") {

                    if (!isOwner(sender))
                        return;

                    const user =
                        msg.message
                            ?.extendedTextMessage
                            ?.contextInfo
                            ?.mentionedJid?.[0];

                    if (!user) {

                        return sock.sendMessage(from, {
                            text:
                                "❌ Markiere User"
                        });
                    }

                    vipUsers =
                        vipUsers.filter(
                            v => v !== user
                        );

                    return sock.sendMessage(from, {
                        text:
                            "🗑️ VIP entfernt"
                    });
                }

                if (['setmoney','addmoney','takemoney','resetmoney'].includes(command)) {
                    if (!isOwner(sender)) {
                        return sock.sendMessage(from, {
                            text: "❌ Nur Owner"
                        });
                    }

                    const mentioned = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid?.[0];
                    const rawTarget = mentioned || args[0];
                    const targetId = mentioned || (rawTarget ? `${rawTarget.replace(/\D/g, "")}@s.whatsapp.net` : null);
                    const amount = parseAmount(args[mentioned ? 1 : 1]);

                    if (!targetId) {
                        return sock.sendMessage(from, {
                            text: "❌ Nutze: !setmoney @user <betrag> | !addmoney @user <betrag> | !takemoney @user <betrag> | !resetmoney @user"
                        });
                    }

                    const account = ensureEconomy(targetId);

                    if (command === "resetmoney") {
                        account.wallet = 0;
                        account.bank = 0;
                        saveDatabase();

                        return sock.sendMessage(from, {
                            text: `♻️ Geld von @${targetId.split("@")[0]} wurde zurückgesetzt.`,
                            mentions: [targetId]
                        });
                    }

                    if (!amount) {
                        return sock.sendMessage(from, {
                            text: "❌ Bitte Betrag angeben."
                        });
                    }

                    if (command === "setmoney") {
                        account.wallet = amount;
                        saveDatabase();

                        return sock.sendMessage(from, {
                            text: `✅ Konto von @${targetId.split("@")[0]} wurde auf ${formatMoney(amount)} gesetzt.`,
                            mentions: [targetId]
                        });
                    }

                    if (command === "addmoney") {
                        account.wallet += amount;
                        saveDatabase();

                        return sock.sendMessage(from, {
                            text: `✅ @${targetId.split("@")[0]} wurden ${formatMoney(amount)} gutgeschrieben.`,
                            mentions: [targetId]
                        });
                    }

                    if (command === "takemoney") {
                        const taken = Math.min(account.wallet, amount);
                        account.wallet -= taken;
                        saveDatabase();

                        return sock.sendMessage(from, {
                            text: `✅ ${formatMoney(taken)} von @${targetId.split("@")[0]} wurden genommen.`,
                            mentions: [targetId]
                        });
                    }
                }

                // ========================================
                // 👥 GROUP COMMANDS
                // ========================================

                if (
                    [
                        "tagall",
                        "admins",
                        "groupinfo",
                        "close",
                        "open",
                        "setname",
                        "setdesc",
                        "welcome",
                        "kick",
                        "mute",
                        "unmute"
                    ].includes(command)
                ) {

                    if (!from.endsWith("@g.us")) {

                        return sock.sendMessage(from, {
                            text:
                                `
----Extosite Bot----
 Command kann nur in Gruppen 
 verwendet werden!


`
                                                    
                        });
                    }

                    const mentioned =
                        msg.message
                            ?.extendedTextMessage
                            ?.contextInfo
                            ?.mentionedJid;

                    const user =
                        mentioned?.[0];

                    // ========================================
                    // TAGALL
                    // ========================================

                    if (command === "tagall") {

                        const meta =
                            await sock.groupMetadata(from);

                        let text =
                                           `
                                ╔════════════════╗
║   EXTOSITE BOT
╚════════════════╝

----TAG ALL----\n\n

-----EXTOSITE BOT-----
`
                            " TAG ALL\n\n";

                        let mentions = [];

                        for (const p of meta.participants) {

                            mentions.push(p.id);

                            text +=
                                `@${p.id.split("@")[0]}\n`;
                        }

                        return sock.sendMessage(from, {
                            text,
                            mentions
                        });
                    }

                    // ========================================
                    // ADMINS
                    // ========================================

                    if (command === "admins") {

                        const meta =
                            await sock.groupMetadata(from);

                        const admins =
                            meta.participants.filter(
                                p => p.admin
                            );

                        let text =
                                               `
                                ╔════════════════╗
║   EXTOSITE BOT
╚════════════════╝

----ADMINS----\n\n

-----EXTOSITE BOT-----
`;

                        let mentions = [];

                        for (const a of admins) {

                            mentions.push(a.id);

                            text +=
                                `@${a.id.split("@")[0]}\n`;
                        }

                        return sock.sendMessage(from, {
                            text,
                            mentions
                        });
                    }

                    // ========================================
                    // GROUPINFO
                    // ========================================

if (command === "stats") {

    if (!isOwner(sender)) {
        return sock.sendMessage(from, {
            text: "❌ Nur der Owner kann diesen Befehl nutzen",
            quoted: msg
        });
    }

    // Berechne Statistiken
    const groupList = Object.keys(dbData?.groups || {});
    const userList = Object.keys(economy || {});
    
    let totalWealth = 0;
    let totalBank = 0;
    let totalWallet = 0;
    let usersWithMoney = 0;
    let totalExp = 0;
    let totalLevel = 0;

    for (const user of userList) {
        const acc = economy[user] || {};
        const wealth = (acc.wallet || 0) + (acc.bank || 0);
        
        if (wealth > 0) usersWithMoney++;
        totalWealth += wealth;
        totalWallet += acc.wallet || 0;
        totalBank += acc.bank || 0;
        totalExp += acc.exp || 0;
        totalLevel += acc.level || 1;
    }

    const totalMuted = Object.values(mutedUsers).reduce((sum, value) => {
        if (Array.isArray(value)) return sum + value.length;
        return sum;
    }, 0);
    const avgWealth = userList.length > 0 ? Math.floor(totalWealth / userList.length) : 0;
    const avgLevel = userList.length > 0 ? Math.floor(totalLevel / userList.length) : 0;
    const uptime = Math.floor(process.uptime());
    const hours = Math.floor(uptime / 3600);
    const minutes = Math.floor((uptime % 3600) / 60);
    const wealthiestUser = Object.entries(economy)
        .filter(([, acc]) => acc)
        .sort((a, b) =>
            ((b[1].wallet || 0) + (b[1].bank || 0)) - ((a[1].wallet || 0) + (a[1].bank || 0))
        )?.[0];

    const stats = `╔═══════════════════════════╗
║      BOT STATISTIKEN       ║
╚═══════════════════════════╝

📊 AKTIVITÄT
├ Uptime: ${hours}h ${minutes}min
├ Runtime: ${process.version}
└ Plattform: ${process.platform}

👥 NUTZER & GRUPPEN
├ Gruppen: ${groupList.length}
├ Gesamt Nutzer: ${userList.length}
├ Aktive Nutzer: ${usersWithMoney}
├ VIP User: ${vipUsers.length}
└ Bot Mode: ${botMode === 'public' ? '🌍 Public' : '🔒 Private'}

💰 ECONOMY
├ Gesamt Vermögen: ${formatMoney(totalWealth)}
├ Tasche: ${formatMoney(totalWallet)}
├ Bank: ${formatMoney(totalBank)}
├ Ø Vermögen: ${formatMoney(avgWealth)}
├ Reichster User: ${wealthiestUser ? '@' + wealthiestUser[0].split('@')[0] + ' (' + formatMoney(
    (wealthiestUser[1].wallet || 0) + (wealthiestUser[1].bank || 0)
) + ')' : 'N/A'}
└ Gesamt Level: ${totalLevel} (Ø ${avgLevel})

⚠️ VERWALTUNG
├ Verwarnungen: ${Object.keys(warnings).length}
├ Gemutete User: ${totalMuted}
└ Anti-Link aktiv: ${Object.values(dbData?.groups || {}).filter(g => g.antiLink).length}

-----EXTOSITE BOT-----`;

    return sock.sendMessage(from, { text: stats, quoted: msg });
}

if (command === "groupstats" || command === "groupinfo") {
    if (!from.endsWith("@g.us")) {
        return sock.sendMessage(from, {
            text: "❌ Nur in Gruppen verfügbar"
        });
    }

    try {
        const meta = await sock.groupMetadata(from);
        const groupSettings = ensureGroup(from);
        const groupWarnings = warnings[from] || {};
        const groupMuted = mutedUsers[from] || [];
        const admins = meta.participants.filter(p => p.admin);
        const totalWarnings = Object.values(groupWarnings).reduce((a, b) => a + b, 0);

        const stats = `╔═══════════════════════════╗
║    GRUPPEN STATISTIKEN     ║
╚═══════════════════════════╝

📱 GRUPPEN INFO
├ Name: ${meta.subject}
├ Erstellt: ${new Date(meta.creation * 1000).toLocaleDateString('de-DE')}
├ Owner: @${meta.owner?.split('@')[0] || 'Unknown'}
└ Icon: ${meta.icon ? '✅' : '❌'}

👥 MITGLIEDER
├ Gesamt: ${meta.participants.length}
├ Admins: ${admins.length}
├ Normale: ${meta.participants.length - admins.length}
└ Gemutete: ${groupMuted.length}

⚙️ EINSTELLUNGEN
├ Anti-Link: ${groupSettings.antiLink ? '✅ AN' : '❌ AUS'}
├ Welcome: ${groupSettings.welcome ? '✅ AN' : '❌ AUS'}
├ Beschreibung: ${meta.desc ? '✅ Vorhanden' : '❌ Keine'}
└ Modus: ${meta.announce === undefined ? '🌍 Offen' : '🔐 Geschlossen'}

⚠️ MODERATION
├ Verwarnungen: ${totalWarnings}
├ Warngrenzen: ${Object.keys(groupWarnings).length}
└ Gemutete: ${groupMuted.length > 0 ? groupMuted.map(u => '@' + u.split('@')[0]).join(', ') : 'Keine'}

-----EXTOSITE BOT-----`;

        return sock.sendMessage(from, { text: stats });
    } catch (err) {
        console.log(err);
        return sock.sendMessage(from, {
            text: "❌ Fehler beim Abrufen der Gruppendaten"
        });
    }
}

                    // ========================================
                    // OPEN / CLOSE
                    // ========================================

                    if (command === "close") {

                        await sock.groupSettingUpdate(
                            from,
                            "announcement"
                        );

                        return sock.sendMessage(from, {
                            text:
                                `
                                ╔════════════════╗
║   EXTOSITE BOT
╚════════════════╝

----Gruppe Geschlossen----

Zum öffnen !open eingeben 

-----EXTOSITE BOT-----
`
                        });
                    }

                    if (command === "open") {

                        await sock.groupSettingUpdate(
                            from,
                            "not_announcement"
                        );

                        return sock.sendMessage(from, {
                            text:
                                                   `
                                ╔════════════════╗
║   EXTOSITE BOT
╚════════════════╝

----Gruppe Geöffnet----

Zum schließen !close eingeben 

-----EXTOSITE BOT-----
`
                        });
                    }

                    if (command === "setname") {
                        const meta = await sock.groupMetadata(from);
                        const senderIsAdmin = meta.participants.some(
                            p => p.id === sender && (p.admin || p.id === meta.owner)
                        );

                        if (!senderIsAdmin) {
                            return sock.sendMessage(from, {
                                text: "❌ Nur Admins können den Gruppennamen ändern."
                            });
                        }

                        const newName = args.join(" ");
                        if (!newName) {
                            return sock.sendMessage(from, {
                                text: "❌ Nutze: !setname Neuer Gruppenname"
                            });
                        }

                        await sock.groupUpdateSubject(from, newName);

                        return sock.sendMessage(from, {
                            text: `Gruppenname geändert in: ${newName}`
                        });
                    }

                    if (command === "setdesc") {
                        const meta = await sock.groupMetadata(from);
                        const senderIsAdmin = meta.participants.some(
                            p => p.id === sender && (p.admin || p.id === meta.owner)
                        );

                        if (!senderIsAdmin) {
                            return sock.sendMessage(from, {
                                text: "❌ Nur Admins können die Gruppenbeschreibung ändern."
                            });
                        }

                        const newDesc = args.join(" ");
                        if (!newDesc) {
                            return sock.sendMessage(from, {
                                text: "❌ Nutze: !setdesc Neue Beschreibung"
                            });
                        }

                        await sock.groupUpdateDescription(from, newDesc);

                        return sock.sendMessage(from, {
                            text: `Gruppenbeschreibung geändert.`
                        });
                    }

                    if (command === "welcome") {
                        const meta = await sock.groupMetadata(from);
                        const senderIsAdmin = meta.participants.some(
                            p => p.id === sender && (p.admin || p.id === meta.owner)
                        );

                        if (!senderIsAdmin) {
                            return sock.sendMessage(from, {
                                text: "❌ Nur Admins können Welcome-Nachrichten verwalten."
                            });
                        }

                        const mode = args[0]?.toLowerCase();
                        const group = ensureGroup(from);

                        if (mode === "on") {
                            group.welcome = true;
                            saveDatabase();
                            return sock.sendMessage(from, {
                                text:                    `
                                ╔════════════════╗
║   EXTOSITE BOT
╚════════════════╝

Welcome-Nachrichten sind jetzt aktiviert.

Zum deaktivieren !welcome off eingeben.

-----EXTOSITE BOT-----
`
                            });
                        }

                        if (mode === "off") {
                            group.welcome = false;
                            saveDatabase();
                            return sock.sendMessage(from, {
                                text:                    `
                                ╔════════════════╗
║   EXTOSITE BOT
╚════════════════╝

Welcome-Nachrichten sind jetzt deaktiviert.

Zum aktivieren !welcome on eingeben

-----EXTOSITE BOT-----
`
                            });
                        }

                        if (mode === "message") {
                            const welcomeMessage = args.slice(1).join(" ");
                            if (!welcomeMessage) {
                                return sock.sendMessage(from, {
                                    text: "❌ Nutze: !welcome message Willkommen @user"
                                });
                            }

                            group.welcomeMessage = welcomeMessage;
                            saveDatabase();

                            return sock.sendMessage(from, {
                                text: "Welcome Nachricht gespeichert."
                            });
                        }

                        return sock.sendMessage(from, {
                            text: "Nutze: !welcome on/off oder !welcome message <text>"
                        });
                    }

                    if (command === "antilink") {
                        const meta = await sock.groupMetadata(from);
                        const senderIsAdmin = meta.participants.some(
                            p => p.id === sender && (p.admin || p.id === meta.owner)
                        );

                        if (!senderIsAdmin) {
                            return sock.sendMessage(from, {
                                text: "❌ Nur Admins können Anti-Link ein- oder ausschalten."
                            });
                        }

                        const mode = args[0]?.toLowerCase();
                        const group = ensureGroup(from);

                        if (mode === "on") {
                            group.antiLink = true;
                            saveDatabase();
                            return sock.sendMessage(from, {
                                text: "✅ Anti-Link ist jetzt aktiviert."
                            });
                        }

                        if (mode === "off") {
                            group.antiLink = false;
                            saveDatabase();
                            return sock.sendMessage(from, {
                                text: "✅ Anti-Link ist jetzt deaktiviert."
                            });
                        }

                        return sock.sendMessage(from, {
                            text: "Nutze: !antilink on/off"
                        });
                    }

                    if (command === "resetwarns") {
                        const meta = await sock.groupMetadata(from);
                        const senderIsAdmin = meta.participants.some(
                            p => p.id === sender && (p.admin || p.id === meta.owner)
                        );

                        if (!senderIsAdmin) {
                            return sock.sendMessage(from, {
                                text: "❌ Nur Admins können Warns zurücksetzen."
                            });
                        }

                        delete warnings[from];
                        saveDatabase();

                        return sock.sendMessage(from, {
                            text: "✅ Gruppenspezifische Warns wurden zurückgesetzt."
                        });
                    }

                    // ========================================
                    // USER REQUIRED
                    // ========================================

                    if (!user) {

                        return sock.sendMessage(from, {
                            text:
                                "❌ Markiere User"
                        });
                    }

                    // ========================================
                    // KICK
                    // ========================================

if (command === "kick") {

    if (!from.endsWith("@g.us")) {
        return sock.sendMessage(from, {
            text: "❌ Nur Gruppen"
        });
    }

    const user =
        msg.message?.extendedTextMessage
        ?.contextInfo?.mentionedJid?.[0];

    if (!user) {
        return sock.sendMessage(from, {
            text: "❌ Markiere User"
        });
    }

    // ========================================
    // 🛡️ OWNER SCHUTZ
    // ========================================

    if (isOwner(user)) {

        return sock.sendMessage(from, {
            text:
`╔════════════╗
║ OWNER PROTECT
╚════════════╝

❌ Owner kann nicht gekickt werden`
        });
    }

    // ========================================
    // 🤖 BOT SCHUTZ
    // ========================================

    const botNumber =
        sock.user.id.split(":")[0] + "173358519951588@s.whatsapp.net";

    if (user === botNumber) {

        return sock.sendMessage(from, {
            text:
`╔════════════╗
║ BOT PROTECT
╚════════════╝

❌ Bot kann nicht gekickt werden`
        });
    }

    // ========================================
    // 👢 KICK
    // ========================================

    try {

        await sock.groupParticipantsUpdate(
            from,
            [user],
            "remove"
        );

        return sock.sendMessage(from, {
            text:
`╔════════════╗
║ USER REMOVED
╚════════════╝

@${user.split("@")[0]} wurde entfernt`,
            mentions: [user]
        });

    } catch (err) {

        console.log(err);

        return sock.sendMessage(from, {
            text: "❌ Kick fehlgeschlagen"
        });
    }
}
                    // ========================================
                    // MUTE
                    // ========================================
                if (command === "mute") {

    if (!from.endsWith("@g.us")) {
        return sock.sendMessage(from, {
            text: "❌ Mute funktioniert nur in Gruppen."
        });
    }

    const user =
        msg.message?.extendedTextMessage
        ?.contextInfo?.mentionedJid?.[0];

    if (!user) {
        return sock.sendMessage(from, {
            text: "❌ Markiere User"
        });
    }

    if (isOwner(user)) {
        return sock.sendMessage(from, {
            text: "❌ Owner kann nicht gemutet werden."
        });
    }

    if (!mutedUsers[from]) {
        mutedUsers[from] = [];
    }

    if (mutedUsers[from].includes(user)) {
        return sock.sendMessage(from, {
            text: "❌ User ist bereits gemutet."
        });
    }

    mutedUsers[from].push(user);
    saveMutedUsers();

    return sock.sendMessage(from, {
        text: "✅ User erfolgreich gemutet. Alle Nachrichten werden gelöscht."
    });
}
    

    

                    // ========================================
                    // UNMUTE
                    // ========================================
if (command === "unmute") {

    const user =
        msg.message?.extendedTextMessage
        ?.contextInfo?.mentionedJid?.[0];

    if (!user) {
        return sock.sendMessage(from, {
            text: "❌ markiere User"
        });
    }

    mutedUsers[from] =
        (mutedUsers[from] || [])
        .filter(u => u !== user);

    saveMutedUsers();

    return sock.sendMessage(from, {
        text: "User entmutet!Pass beim nächsten mal auf!"
    });
}
                  
}
                

            } catch (err) {

                console.log("COMMAND ERROR", err);

                const fallbackChat = messages?.[0]?.key?.remoteJid || "status@broadcast";
                await originalSendMessage(fallbackChat, {
                    text: `❌ Fehler beim Command${err?.message ? ": " + err.message : ""}`
                });
            } finally {
                lastIncomingMessage = null;
            }
        }
    );
}

// ========================================
// ▶️ START
// ========================================

startBot();
