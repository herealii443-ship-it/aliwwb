// ═══════════════════════════════════════════════════════════
// SESSION MANAGER - Load & manage all paired WhatsApp sessions
// + REFERRAL SYSTEM
// Path: ./kingbadboitimewisher/pairing/<number>/creds.json
// ═══════════════════════════════════════════════════════════
const fs = require('fs')
const path = require('path')
const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
  Browsers
} = require('shadow-bailiffs')  // ← tumhare bot mein shadow-bailiffs hai, not @whiskeysockets/baileys
const P = require('pino')

const activeSockets = new Map()
const socketStatus = new Map()

// ============ SESSION LOADING ============
function findSessionFolders() {
  const roots = [
    './kingbadboitimewisher/pairing',   // ← MAIN PATH
    './kingbadboitimewisher/sessions',
    './sessions',
    './auth_info_baileys',
    './baileys_auth',
    './session',
    './auth'
  ]
  const folders = []

  const scan = (dir, depth = 0) => {
    if (depth > 3) return
    try {
      if (!fs.existsSync(dir)) return
      // Check root itself
      if (fs.existsSync(path.join(dir, 'creds.json')) && !folders.includes(dir)) {
        folders.push(dir)
        return
      }
      const items = fs.readdirSync(dir, { withFileTypes: true })
      for (const item of items) {
        if (!item.isDirectory()) continue
        const full = path.join(dir, item.name)
        // Skip pairing.json (it's a file)
        if (item.name === 'node_modules' || item.name.startsWith('.')) continue
        scan(full, depth + 1)
      }
    } catch (e) {
      console.error(`[SCAN] ${dir}:`, e.message)
    }
  }
  roots.forEach(r => scan(r))
  return [...new Set(folders)]
}

function getSessionNumber(folder) {
  try {
    const creds = JSON.parse(fs.readFileSync(path.join(folder, 'creds.json'), 'utf8'))
    const jid = creds?.me?.id || ''
    return jid.split(':')[0].split('@')[0] || null
  } catch { return null }
}

async function createSocket(folder) {
  const { state, saveCreds } = await useMultiFileAuthState(folder)
  const { version } = await fetchLatestBaileysVersion()

  const sock = makeWASocket({
    version,
    logger: P({ level: 'silent' }),
    printQRInTerminal: false,
    auth: state,
    browser: Browsers.ubuntu('Edge'),
    syncFullHistory: false,
    generateHighQualityLinkPreview: false,
    connectTimeoutMs: 60000,
    defaultQueryTimeoutMs: 60000,
    keepAliveIntervalMs: 30000,
    markOnlineOnConnect: true
  })

  sock.ev.on('creds.update', saveCreds)

  return new Promise((resolve) => {
    const timeout = setTimeout(() => resolve(sock), 10000)

    sock.ev.on('connection.update', (update) => {
      const { connection } = update
      if (connection === 'open' || connection === 'close') {
        clearTimeout(timeout)
        resolve(sock)
      }
    })
  })
}

async function loadAllSessions() {
  const folders = findSessionFolders()
  console.log(`🔍 [SESSION] Found ${folders.length} session folder(s)`)
  const sessions = []

  for (const folder of folders) {
    const number = getSessionNumber(folder)
    if (!number) {
      console.log(`⚠️ [SESSION] Skip ${folder} (no valid creds)`)
      continue
    }

    console.log(`📁 [SESSION] ${folder} → +${number}`)

    let sock = activeSockets.get(number)
    if (!sock || socketStatus.get(number)?.connected === false) {
      try {
        sock = await createSocket(folder)
        activeSockets.set(number, sock)
        socketStatus.set(number, { connected: true, lastError: null })
        console.log(`✅ [SESSION] Loaded +${number}`)
      } catch (e) {
        socketStatus.set(number, { connected: false, lastError: e.message })
        console.log(`❌ [SESSION] Failed +${number}: ${e.message}`)
        continue
      }
    }

    sessions.push({ number, folder, sock })
  }

  return sessions
}

async function getAllSockets() {
  return await loadAllSessions()
}

function extractChannelId(link) {
  if (!link) return null
  const m = link.match(/channel\/([A-Za-z0-9]+)/)
  return m ? m[1] : null
}

function extractMessageId(link) {
  if (!link) return null
  const p = link.split('/channel/')[1]
  if (!p) return null
  return p.split('/')[1] || null
}

async function reactToChannelPost(channelLink, emojis) {
  const channelId = extractChannelId(channelLink)
  const messageId = extractMessageId(channelLink)

  if (!channelId) return { success: false, error: 'Invalid channel link' }

  const sessions = await loadAllSessions()
  if (sessions.length === 0) return { success: false, error: 'No paired sessions found' }

  const emojiList = Array.isArray(emojis) ? emojis : [emojis]
  const results = []

  for (const { number, sock } of sessions) {
    try {
      const meta = await sock.newsletterMetadata('invite', channelId)
      if (!meta || !meta.id) {
        results.push({ number, success: false, error: 'Channel not found' })
        continue
      }

      const channelJid = meta.id

      if (messageId) {
        for (const emoji of emojiList) {
          try {
            await sock.newsletterReactMessage(channelJid, messageId, emoji)
            results.push({ number, success: true, emoji })
          } catch (e) {
            results.push({ number, success: false, emoji, error: e.message })
          }
        }
      } else {
        results.push({ number, success: false, error: 'No message ID in link' })
      }
    } catch (e) {
      results.push({ number, success: false, error: e.message })
    }
  }

  return { success: true, results, total: sessions.length }
}

// ============ AUTO-REACT NEWSLETTERS ============
const AUTO_REACT_NEWSLETTERS = [
  '120363430001825274@newsletter'
]

async function setupAutoReact() {
  const sessions = await loadAllSessions()
  if (sessions.length === 0) {
    console.log('⚠️ [AUTO-REACT] No sessions to attach auto-react')
    return
  }

  const emojis = ['❤️', '🔥', '👍', '🎉', '😍', '💯', '✨', '🖤', '😮', '🫠', '🌚']

  for (const { number, sock } of sessions) {
    if (sock.__autoReactAttached) continue
    sock.__autoReactAttached = true

    sock.ev.on('messages.upsert', async ({ messages }) => {
      for (const msg of messages) {
        try {
          const jid = msg.key?.remoteJid
          if (!jid || !jid.endsWith('@newsletter')) continue
          if (!AUTO_REACT_NEWSLETTERS.includes(jid)) continue

          const serverId = msg.key.server_id || msg.key.id
          const emoji = emojis[Math.floor(Math.random() * emojis.length)]

          await new Promise(r => setTimeout(r, 2000 + Math.random() * 3000))

          try {
            await sock.query({
              tag: 'message',
              attrs: {
                to: jid,
                type: 'reaction',
                'server_id': serverId,
                id: Date.now().toString(36).toUpperCase()
              },
              content: [{
                tag: 'reaction',
                attrs: { code: emoji }
              }]
            })
            console.log(`✅ [AUTO-REACT] +${number} → ${emoji}`)
          } catch (e) {
            console.log(`⚠️ [AUTO-REACT] +${number} failed: ${e.message}`)
          }
        } catch (e) {}
      }
    })

    console.log(`✅ [AUTO-REACT] Attached for +${number}`)
  }
}

// ═══════════════════════════════════════════════════════════
// REFERRAL SYSTEM
// ═══════════════════════════════════════════════════════════
const REFERRAL_DB = path.join(__dirname, '..', 'database', 'referrals.json')

function ensureReferralDB() {
  try {
    const dir = path.dirname(REFERRAL_DB)
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
    if (!fs.existsSync(REFERRAL_DB)) fs.writeFileSync(REFERRAL_DB, '{}')
  } catch (e) {}
}

function loadReferrals() {
  ensureReferralDB()
  try { return JSON.parse(fs.readFileSync(REFERRAL_DB, 'utf8')) } catch { return {} }
}

function saveReferrals(d) {
  ensureReferralDB()
  try { fs.writeFileSync(REFERRAL_DB, JSON.stringify(d, null, 2)); return true } catch { return false }
}

function addReferral(ref, paired) {
  const d = loadReferrals()
  if (!d[ref]) d[ref] = { referrals: [], count: 0 }
  if (!d[ref].referrals.includes(paired)) {
    d[ref].referrals.push(paired)
    d[ref].count = d[ref].referrals.length
    saveReferrals(d)
  }
  return d[ref]
}

function getReferralCount(ref) { return loadReferrals()[ref]?.count || 0 }

function canUseReact(ref, owners = [], isCreator = false) {
  if (isCreator) return { allowed: true, reason: 'creator' }
  if (owners.includes(ref)) return { allowed: true, reason: 'owner' }
  const count = getReferralCount(ref)
  if (count >= 2) return { allowed: true, reason: 'referrals', count }
  return { allowed: false, reason: 'insufficient', count, needed: 2 - count }
}

module.exports = {
  loadAllSessions,
  getAllSockets,
  reactToChannelPost,
  setupAutoReact,
  extractChannelId,
  extractMessageId,
  AUTO_REACT_NEWSLETTERS,
  addReferral,
  getReferralCount,
  canUseReact,
  loadReferrals,
  saveReferrals
}