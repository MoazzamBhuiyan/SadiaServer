// ─────────────────────────────────────────────────────────────────────────────
//  server.js  —  ShieldLearn Backend API
//
//  This is the Express server that powers the ShieldLearn platform.
//  It creates the database, seeds all module content, and exposes REST API
//  endpoints that the React frontend calls using fetch().
//
//  References:
//    Express docs:    https://expressjs.com/en/5x/api.html
//    bcryptjs:        https://github.com/dcodeIO/bcrypt.js
//    node:sqlite:     https://nodejs.org/api/sqlite.html
//    CORS explained:  https://developer.mozilla.org/en-US/docs/Web/HTTP/CORS
//    REST API intro:  https://developer.mozilla.org/en-US/docs/Glossary/REST
// ─────────────────────────────────────────────────────────────────────────────

// CommonJS require() — Node.js's way of importing packages
// (React uses ES module 'import', but Node.js servers traditionally use require)
const express = require('express')
const cors = require('cors')
const bcrypt = require('bcryptjs')  // Password hashing library
const crypto = require('crypto')    // Built into Node.js — provides cryptographic utilities
const path = require('path')        // Built into Node.js — helps build file paths
const { DatabaseSync } = require('node:sqlite')  // Built into Node.js 22+ — no extra package needed

// Import our AI chatbot module (uses 'natural' — the JS equivalent of Python's NLTK)
const { getResponse } = require('./chatbot')

// On Vercel (or any serverless platform), only /tmp is writable — and it is
// ephemeral, so the DB is wiped on each cold start. Locally we keep the file
// next to the server so data persists across restarts.
const DB_PATH = process.env.VERCEL
  ? '/tmp/shieldlearn.db'
  : path.join(__dirname, 'shieldlearn.db')
const PORT = process.env.PORT || 3001

// ── Database ───────────────────────────────────────────────────────────────────
// DatabaseSync opens (or creates) the SQLite file at the given path.
// If 'shieldlearn.db' does not exist, it will be created automatically.
const db = new DatabaseSync(DB_PATH)

// db.exec() runs one or more raw SQL statements.
// 'CREATE TABLE IF NOT EXISTS' is safe to run every time the server starts —
// it only creates the table if it doesn't already exist.
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id           TEXT PRIMARY KEY,
    email        TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    name         TEXT,
    phone        TEXT,
    role         TEXT,
    avatar_index INTEGER,
    linkedin     TEXT,
    created_at   TEXT DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS categories (
    id    INTEGER PRIMARY KEY AUTOINCREMENT,
    icon  TEXT NOT NULL,
    label TEXT NOT NULL UNIQUE
  );

  CREATE TABLE IF NOT EXISTS modules (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    category_id  INTEGER NOT NULL,
    icon         TEXT NOT NULL,
    title        TEXT NOT NULL,
    description  TEXT,
    level        TEXT NOT NULL,
    path         TEXT,
    coming_soon  INTEGER DEFAULT 0,
    module_type  TEXT,
    badge        TEXT,
    accent_color TEXT,
    FOREIGN KEY (category_id) REFERENCES categories(id)
  );

  CREATE TABLE IF NOT EXISTS questions (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    module_id   INTEGER NOT NULL,
    order_index INTEGER NOT NULL,
    data        TEXT NOT NULL,
    FOREIGN KEY (module_id) REFERENCES modules(id)
  );

  CREATE TABLE IF NOT EXISTS scores (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id      TEXT NOT NULL,
    module_id    INTEGER NOT NULL,
    score        INTEGER NOT NULL,
    total        INTEGER NOT NULL,
    passed       INTEGER NOT NULL,
    badge        TEXT,
    completed_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (module_id) REFERENCES modules(id)
  );

  CREATE TABLE IF NOT EXISTS surveys (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    module_name   TEXT NOT NULL,
    q1_rating     INTEGER,
    q2_difficulty TEXT,
    q3_helpful    TEXT,
    q4_nps        INTEGER,
    q5_feedback   TEXT,
    q6_confidence TEXT,
    created_at    TEXT DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS forum_posts (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id    TEXT,
    author     TEXT NOT NULL,
    avatar     TEXT DEFAULT '👤',
    category   TEXT DEFAULT '💬 General',
    title      TEXT NOT NULL,
    body       TEXT NOT NULL,
    likes      INTEGER DEFAULT 0,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  );
`)

// ── Seed modules data (only if empty) ─────────────────────────────────────────
// "Seeding" means inserting starter data into an empty database.
// We check if any categories exist — if not, we insert the full curriculum.
// This only runs ONCE (the first time the server starts on a fresh install).
const catCount = db.prepare('SELECT COUNT(*) as n FROM categories').get().n
if (catCount === 0) {
  const insertMod = db.prepare('INSERT INTO modules (category_id, icon, title, description, level, path, coming_soon, module_type, badge, accent_color) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
  const insertQ   = db.prepare('INSERT INTO questions (module_id, order_index, data) VALUES (?, ?, ?)')

  const c1 = db.prepare('INSERT INTO categories (icon, label) VALUES (?, ?) RETURNING id').get('🔐', 'General Modules').id
  insertMod.run(c1, '🛡️', 'Intro to Staying Safe', 'Essential cybersecurity basics to protect yourself online and understand common threats.', 'beginner', null, 0, null, null, null)
  insertMod.run(c1, '🔑', 'Password on Lock!', 'Learn how to create strong, secure passwords and protect your accounts from unauthorised access.', 'beginner', null, 0, null, null, null)
  insertMod.run(c1, '🔐', 'Password on Lock 2', 'Advanced password security techniques including password managers and two-factor authentication.', 'intermediate', null, 0, null, null, null)
  insertMod.run(c1, '🎣', 'Shield against Phishers', 'Identify and avoid phishing attacks, suspicious emails, and fraudulent websites.', 'beginner', null, 0, null, null, null)
  insertMod.run(c1, '🪝', 'No more Baiting', 'Protect yourself from baiting attacks and social engineering tactics used by cybercriminals.', 'intermediate', null, 0, null, null, null)

  const c2 = db.prepare('INSERT INTO categories (icon, label) VALUES (?, ?) RETURNING id').get('🎓', 'Student-Focused Modules').id
  const m6 = db.prepare('INSERT INTO modules (category_id, icon, title, description, level, path, coming_soon, module_type, badge, accent_color) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id').get(c2, '📞', 'Ring Ring... Is It a Scam?', 'Learn to identify phone scams, vishing attacks, and fraudulent calls targeting students.', 'beginner', '/modules/6', 0, 'quiz', 'Scam Spotter Badge', '#3b82f6').id
  const m7 = db.prepare('INSERT INTO modules (category_id, icon, title, description, level, path, coming_soon, module_type, badge, accent_color) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id').get(c2, '📱', 'Scroll Smart: Protecting Yourself Online', 'Stay safe on social media, protect your personal information, and navigate online spaces securely.', 'beginner', '/modules/7', 0, 'scroll', 'Smart Scroller Badge', '#8b5cf6').id

  const c3 = db.prepare('INSERT INTO categories (icon, label) VALUES (?, ?) RETURNING id').get('🏥', 'Healthcare Professional Modules').id
  const m8 = db.prepare('INSERT INTO modules (category_id, icon, title, description, level, path, coming_soon, module_type, badge, accent_color) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id').get(c3, '⚕️', 'Human Hacking in Healthcare', 'Understand social engineering tactics targeting healthcare workers and how to protect patient data.', 'advanced', '/modules/8', 0, 'healthcare', 'Healthcare Guardian Badge', '#0284c7').id

  const c4 = db.prepare('INSERT INTO categories (icon, label) VALUES (?, ?) RETURNING id').get('🚀', 'Coming Soon').id
  insertMod.run(c4, '🎯', 'Trust Is the Target: Social Engineering in Admin', 'How to not give your company up to hackers as an Admin.', 'intermediate', null, 1, null, null, null)

  // ── Seed questions for module 6 (Ring Ring — quiz) ─────────────────────────
  const s1 = [
    { type: 'multiple-choice', question: 'What is the main goal of most scam phone calls?', options: ['To provide customer support','To collect personal or financial information','To advertise products','To conduct surveys'], correctAnswer: 'To collect personal or financial information', explanation: 'Scam callers usually aim to steal money, passwords, or personal data.' },
    { type: 'true-false', question: 'A legitimate organisation will always pressure you to act immediately over the phone.', correctAnswer: false, explanation: 'Scammers create urgency. Legitimate organisations give you time to verify.' },
    { type: 'multiple-choice', question: 'Which phone number is MOST likely to be a scam?', options: ['A saved contact from your phone','A number claiming to be your bank but unknown','A number from a friend','A university helpline number'], correctAnswer: 'A number claiming to be your bank but unknown', explanation: 'Banks rarely call unexpectedly and ask for information.' },
    { type: 'select-all', question: 'Which of the following are common scam call warning signs?', options: ['Urgent threats','Requests for passwords','Caller asks you to verify information','Caller allows you to hang up and call back'], correctAnswer: ['Urgent threats','Requests for passwords'], explanation: 'Scammers rush you and ask for sensitive data.' },
    { type: 'scenario', question: 'You receive a call saying your student loan will be cancelled unless you confirm your details now. What should you do?', options: ['Give the details to avoid problems','Hang up and verify using an official website','Ask the caller to email you','Stay on the call until it ends'], correctAnswer: 'Hang up and verify using an official website', explanation: 'Always verify claims independently using trusted sources.' },
    { type: 'true-false', question: 'Caller ID can be spoofed to look like a trusted number.', correctAnswer: true, explanation: 'Scammers can fake caller ID to appear legitimate.' },
    { type: 'multiple-choice', question: 'What should you NEVER share during a phone call?', options: ['Your name','Your password','Your university name','Your course'], correctAnswer: 'Your password', explanation: 'Passwords should never be shared with anyone.' },
    { type: 'scenario', question: 'A caller claims to be from IT support and asks you to install software. What is the safest response?', options: ['Install it immediately','Ask them to call later','Refuse and report the call','Share your device details'], correctAnswer: 'Refuse and report the call', explanation: 'Installing software on request is a major red flag.' },
    { type: 'multiple-choice', question: 'Which emotion do scammers most commonly exploit?', options: ['Curiosity','Fear','Excitement','Boredom'], correctAnswer: 'Fear', explanation: 'Fear and urgency stop people from thinking critically.' },
    { type: 'true-false', question: 'Scam calls only target older people.', correctAnswer: false, explanation: 'Students are common targets due to loans, jobs, and limited experience.' },
    { type: 'select-all', question: 'Which actions help protect you from scam calls?', options: ['Letting unknown calls go to voicemail','Sharing verification codes','Using call-blocking features','Checking official contact details'], correctAnswer: ['Letting unknown calls go to voicemail','Using call-blocking features','Checking official contact details'], explanation: 'These actions reduce risk and allow verification.' },
    { type: 'multiple-choice', question: 'If a call sounds suspicious, what is the BEST immediate action?', options: ['Argue with the caller','Hang up','Give fake details','Stay silent'], correctAnswer: 'Hang up', explanation: 'Ending the call immediately is the safest option.' },
    { type: 'scenario', question: 'A caller says they accidentally sent you money and want it back. What should you do?', options: ['Send the money back','Give them your bank details','Contact your bank directly','Ignore it completely'], correctAnswer: 'Contact your bank directly', explanation: 'This is a common refund scam.' },
    { type: 'true-false', question: 'Legitimate organisations will ask for one-time passcodes over the phone.', correctAnswer: false, explanation: 'One-time passcodes should never be shared.' },
    { type: 'multiple-choice', question: "What does 'vishing' mean?", options: ['Email scams','Text message scams','Voice-based scams','Social media scams'], correctAnswer: 'Voice-based scams', explanation: 'Vishing = voice phishing.' },
    { type: 'scenario', question: 'A caller claims to be from your university and asks for your login details. What is the correct response?', options: ['Provide details','Ask for their name and comply','Hang up and contact the university directly','Ignore the call forever'], correctAnswer: 'Hang up and contact the university directly', explanation: 'Universities never ask for passwords over the phone.' },
    { type: 'multiple-choice', question: 'Which payment method do scammers often request?', options: ['Bank transfer','Gift cards','Cash in person','Cheque'], correctAnswer: 'Gift cards', explanation: 'Gift cards are hard to trace and commonly used in scams.' },
    { type: 'true-false', question: 'You should report scam calls even if you did not lose money.', correctAnswer: true, explanation: 'Reporting helps protect others.' },
    { type: 'select-all', question: 'Which information can scammers use to impersonate you?', options: ['Full name','Date of birth','Student ID','Favourite colour'], correctAnswer: ['Full name','Date of birth','Student ID'], explanation: 'Personal identifiers help scammers build trust.' },
    { type: 'multiple-choice', question: 'What is the safest mindset when receiving unexpected calls?', options: ['Trust first','Stay polite and comply','Assume it could be a scam','Provide minimal details'], correctAnswer: 'Assume it could be a scam', explanation: 'Healthy scepticism keeps you safe.' },
  ]
  s1.forEach((q, i) => insertQ.run(m6, i, JSON.stringify(q)))

  // ── Seed questions for module 7 (Scroll Smart — scroll) ────────────────────
  const s2 = [
    { type: 'post', content: { username: 'TravelBlogger_Sarah', avatar: '✈️', time: '2h ago', text: 'Just posted my new blog! Amazing 2-week trip to Bali 🌴 Click this link to read about my journey and get travel tips!', image: '🏝️', link: 'travelsara.click/bali-trip-2024' }, question: 'Should you click on this link?', correctAction: 'refuse', tips: ['Shortened or suspicious URLs can lead to phishing sites','Always verify links before clicking, especially from unfamiliar sources','Check if the domain matches the expected website'], explanation: "Always be cautious with links from people you don't know personally. Even if an account looks legitimate, it could be compromised. Hover over links to see the full URL, and if unsure, search for the content separately." },
    { type: 'dm', content: { sender: 'University_Admin', avatar: '🎓', message: 'URGENT: Your student account will be suspended unless you verify your details immediately. Click here: uni-verify-portal.com/confirm' }, question: 'Is this message legitimate?', correctAction: 'refuse', tips: ["Universities don't send urgent DMs asking for verification","Check the sender's profile - is it verified? Does it match official accounts?",'Contact your university directly through official channels'], explanation: 'This is a classic phishing attempt. Real university communications come through official emails or student portals. Scammers create urgency to make you act without thinking. Always verify through official channels.' },
    { type: 'post', content: { username: 'Your_Best_Friend', avatar: '😊', time: 'Just now', text: "Hey everyone! Check out this personality quiz that tells you which Harry Potter character you are! It's super accurate 😂", image: '🧙', link: 'personality-quiz-fun.net' }, question: 'Should you take this quiz?', correctAction: 'refuse', tips: ["Many 'fun' quizzes collect personal data",'They often ask for access to your profile information','Your answers can reveal security question answers'], explanation: "These quizzes often harvest personal information. They might ask your mother's maiden name, first pet, or birthplace - common security questions. Even if shared by friends, be cautious as their account could be compromised." },
    { type: 'profile', content: { username: 'john_student_2024', avatar: '👤', bio: "Hi! I'm John, studying Computer Science at Manchester University. Love gaming 🎮 and football ⚽. Birthday: March 15, 2003. Phone: 07XXX XXXXXX. Always up for meeting new people!" }, question: 'Is this profile bio safe?', correctAction: 'refuse', tips: ['Never share your full birthdate publicly','Phone numbers should be kept private','Personal details can be used for identity theft or social engineering'], explanation: 'This profile shares way too much personal information. Birthdates, phone numbers, and specific location details can be used for identity theft, scams, or stalking. Keep your bio general and fun, not a data goldmine!' },
    { type: 'dm', content: { sender: 'Student_Society_2024', avatar: '🎭', message: "Hi! We're the Drama Society and we're hosting auditions next Tuesday at 6pm in the Student Union Theatre. Would you like more info? You can also check our official Instagram @ManDramaSoc" }, question: 'Is this a safe interaction?', correctAction: 'comply', tips: ['Provides specific, verifiable information (time, location)','References an official social media account you can verify','No suspicious links or requests for personal information'], explanation: "This is a legitimate-looking message. It provides specific details you can verify, mentions an official account, and doesn't ask for personal info or money. You can always verify by checking the official student society account!" },
    { type: 'post', content: { username: 'Campus_Roommate_Finder', avatar: '🏠', time: '5h ago', text: "Looking for roommates for next year? Fill out our form with your budget, preferences, and contact details. We'll match you with compatible students!", image: '📋', link: 'roommate-match.info/signup' }, question: 'Should you fill out this form?', correctAction: 'refuse', tips: ['Only use official university housing services','Unofficial "matching" services may misuse your data',"Verify any housing service with your university's accommodation office"], explanation: "Never share personal information with unverified third-party services. Use your university's official accommodation services or verified student housing platforms. Your personal and financial data could be at risk." },
    { type: 'post', content: { username: 'YourClassmate_Mike', avatar: '📚', time: '30m ago', text: "Hey class! I created a shared Google Drive folder for our group project. Here's the link if you want to add your notes: drive.google.com/CS101-Project", image: '💻' }, question: 'Is this safe to access?', correctAction: 'comply', tips: ['Google Drive is a legitimate, secure platform','The URL is from an official Google domain','Sharing study materials is common and helpful'], explanation: "This is a legitimate use of a trusted platform. The URL is clearly from Google Drive's official domain. Collaborating on schoolwork using verified platforms like Google Drive, OneDrive, or Dropbox is safe and encouraged!" },
    { type: 'dm', content: { sender: 'Hot_Singles_Near_You', avatar: '💋', message: 'Hey cutie 😘 I saw your profile and thought you were really attractive. Want to chat? Click here to see my private photos: bit.ly/xxxxx' }, question: 'Should you respond or click the link?', correctAction: 'refuse', tips: ['This is a classic catfishing/scam attempt','Never click links from strangers promising romantic content','Report and block these accounts immediately'], explanation: 'This is an obvious scam or malicious attempt. These messages often lead to malware, phishing sites, or attempts to extort money. Block, report, and never engage with these kinds of messages.' },
    { type: 'post', content: { username: 'Student_Union_Official', avatar: '🎓', time: '1d ago', text: 'Reminder: Our mental health support drop-in sessions are every Wednesday 2-4pm in Room 301, Student Services Building. No appointment needed. All conversations are confidential. 💚', image: '🧠' }, question: 'Is this a trustworthy post?', correctAction: 'comply', tips: ['Official student union accounts are verified','Provides specific campus locations and times','Promotes legitimate student services'], explanation: "This is legitimate information from an official source. Student unions regularly post about campus services and support. Always verify the account is official (check for verification badges and compare with the university website)." },
    { type: 'profile', content: { username: 'emma_fitness_life', avatar: '💪', bio: 'Fitness enthusiast 🏃‍♀️ | Manchester Uni Student | Love coffee ☕ and hiking 🥾 | DM for workout tips!' }, question: 'Is this an appropriate profile bio?', correctAction: 'comply', tips: ['Shares interests without revealing sensitive information','General location (university) without specific details','No birthdate, phone number, or other personal identifiers'], explanation: "This bio strikes a good balance. It shares personality and interests without revealing sensitive information. It mentions the university generally but no specific address, no birthdate, and no contact details. This is how to be social and safe!" },
  ]
  s2.forEach((q, i) => insertQ.run(m7, i, JSON.stringify(q)))

  // ── Seed questions for module 8 (Healthcare — healthcare) ──────────────────
  const p1 = [
    { context: "You're working a busy shift in the Emergency Department. Your pager is going off constantly.", interaction: { icon: '📧', from: 'IT Department', via: 'Email - marked URGENT', message: 'URGENT: Security breach detected on your workstation. Your account will be locked in 30 minutes unless you verify your credentials immediately. Click here to verify: http://nhs-verify-secure.net/login' }, question: 'Should you click the link to verify your credentials?', correctAction: 'refuse', insights: ['IT departments never ask staff to verify credentials via email links','Urgency tactics are classic social engineering red flags','The URL mimics official NHS domains but uses suspicious TLD (.net instead of .nhs.uk)','Real IT security alerts come through official internal systems, not email'], explanation: "This is a classic phishing attack. Never click links in urgent emails asking for credentials. Always verify through official channels - call IT directly using the number on your hospital's internal directory. Your vigilance protects patient data." },
    { context: "You're at the nurses' station updating patient charts when you receive an unexpected call.", interaction: { icon: '📞', from: 'Unknown Caller', via: 'Phone - Claims to be Dr. Roberts from Radiology', message: "Hi, this is Dr. Roberts from Radiology. I'm off-site reviewing scans and my VPN isn't working. Can you quickly read me the MRN and DOB for patient in bed 4B? I need to access their imaging history urgently." }, question: 'Should you provide the patient information over the phone?', correctAction: 'refuse', insights: ["Never provide patient information without verifying the caller's identity",'Use official callback numbers from the hospital directory, not caller ID','Legitimate doctors understand security protocols and will not pressure you'], explanation: "This is vishing (voice phishing) targeting healthcare workers. Always verify callers using official hospital extensions. A real doctor would understand security protocols. Offer to have IT help with their VPN issue instead." },
    { context: "During your lunch break, you're catching up on messages in the staff break room.", interaction: { icon: '💬', from: 'Dr. Patel (Senior Consultant)', via: 'WhatsApp - From saved contact', message: "Hi! I'm in a meeting and just realized I left my laptop at home. Can you take a photo of Mrs. Thompson's discharge summary on my desk and WhatsApp it to me? I need it for the MDT meeting in 10 minutes. Thanks!" }, question: 'Should you send the discharge summary via WhatsApp?', correctAction: 'refuse', insights: ['WhatsApp and personal messaging apps are NOT secure channels for patient data','Even if the contact appears legitimate, verify through official hospital communication','Photographs of patient documents create unsecured copies vulnerable to breaches'], explanation: 'Never send patient information via personal messaging apps, even to colleagues. Use secure hospital systems like encrypted email or the EHR messaging function. Offer to scan it into the secure system or suggest they access it remotely through official channels.' },
    { context: "You're attending a professional development workshop at a hotel conference center.", interaction: { icon: '💼', from: 'Conference Organizer', via: 'In-person request at registration desk', message: 'Welcome! For our records and to print your name badge, can you please fill out this registration form with your full name, job title, hospital name, department, and work email address?' }, question: 'Is it appropriate to provide this information?', correctAction: 'comply', insights: ['Basic professional information for legitimate events is acceptable','This does not include patient data or sensitive security information','Standard conference registration for CPD (Continuing Professional Development)','Information shared is publicly available (job title, workplace)'], explanation: "This is a legitimate request for professional networking. The information requested is standard for professional events and doesn't compromise patient privacy or security. However, never provide passwords, login credentials, or details about hospital security systems." },
    { context: "A patient's family member approaches you at the nursing station looking distressed.", interaction: { icon: '👤', from: "Man claiming to be patient's son", via: 'In-person - No ID shown', message: "Hi, I'm John Smith, bed 7A is my mum. I've been away on business and just heard she was admitted. I'm flying back tonight. Can you tell me what's wrong with her and what treatment she's getting? She's 73, right? Just want to make sure you have the right patient." }, question: "Should you provide the patient's medical information?", correctAction: 'refuse', insights: ['Never disclose patient information without verifying relationship and patient consent',"Follow your hospital's visitor verification policy",'The person may be fishing for information to confirm patient identity',"Check the patient's record for authorized contacts and privacy preferences"], explanation: 'Always verify relationships and check patient consent before sharing information. Politely explain you need to verify his identity and check with the patient first. Offer to have him speak with the patient directly or contact the ward manager for proper verification procedures.' },
    { context: "You're working from the hospital library during your documentation time.", interaction: { icon: '👨‍💼', from: 'Person in business attire', via: 'In-person - Wearing visitor badge', message: "Excuse me, I'm from MedTech Solutions, we're installing the new patient monitoring system next month. Can I have your staff login to test the integration with the current system? I'll only be 5 minutes and I'm already behind schedule." }, question: 'Should you provide your login credentials?', correctAction: 'refuse', insights: ['NEVER share login credentials with anyone, regardless of their claimed role',"Legitimate IT vendors have their own test accounts and don't need staff credentials",'Badge does not verify identity - visitor badges can be obtained easily','All vendor access should be coordinated through IT department'], explanation: "Never share your credentials. Direct them to contact the IT department who manages all vendor access. Legitimate contractors have proper authorization and test accounts. Your login is your responsibility - you'd be liable for anything accessed with it." },
    { context: "During your shift handover, you're reviewing patient assignments in the staff office.", interaction: { icon: '📋', from: 'Nursing Manager', via: 'Official hospital email system', message: "Team: Reminder that our Joint Commission inspection is next week. Please ensure all patient charts are updated in our secure EHR system by Friday. If you need access to the compliance checklist, it's available on the hospital intranet under 'Quality Assurance' > 'Accreditation Resources'." }, question: 'Is this a legitimate and safe communication?', correctAction: 'comply', insights: ['Sent via official hospital email system','References legitimate hospital processes (Joint Commission, EHR)','Directs to internal resources, not external links','Appropriate managerial communication about compliance'], explanation: "This is legitimate internal communication using official channels. It directs you to internal hospital resources and follows proper procedures. However, remain vigilant - if it asked you to click external links or provide credentials, that would be suspicious even from a manager's email." },
    { context: "You're leaving your shift when a colleague approaches you in the parking lot.", interaction: { icon: '💬', from: 'Recognized Colleague - Dr. Martinez', via: 'In-person conversation', message: "Hey! I'm writing a research paper on cardiac outcomes and I'd love to include some of our unit's data. I know you work with these patients daily - could you send me an anonymized list of cardiac patients from the last 6 months with their ages, diagnoses, and outcomes? I'll make sure to credit the department!" }, question: 'Should you provide this patient data?', correctAction: 'refuse', insights: ['Research involving patient data requires IRB (Institutional Review Board) approval',"'Anonymized' data can still potentially identify patients",'Even colleagues need proper authorization for patient data access','Research proposals must go through proper hospital channels'], explanation: "Even well-intentioned research requires proper authorization. Direct your colleague to submit a research proposal through the proper channels - IRB approval, ethics committee, and data governance. Research must follow strict protocols to protect patient privacy, even when 'anonymized'." },
  ]
  p1.forEach((q, i) => insertQ.run(m8, i, JSON.stringify(q)))
}

// ── Seed admin user (only if this email doesn't already exist) ────────────────
if (!db.prepare("SELECT id FROM users WHERE email = 'admin@gmail.com'").get()) {
  // crypto.randomUUID() generates a universally unique ID string like "550e8400-e29b-41d4-a716-446655440000"
  // UUIDs are used as primary keys instead of auto-increment integers because they are
  // globally unique across all servers — useful if you ever merge databases or go distributed.
  //
  // bcrypt.hashSync(password, saltRounds):
  //   - Takes a plain-text password and returns a one-way hashed version.
  //   - The '10' means 2^10 = 1024 hashing rounds — higher = slower to crack but slower to run.
  //   - The hash is stored in the DB; the plain-text password is NEVER saved.
  //   - Reference: https://auth0.com/blog/hashing-in-action-understanding-bcrypt/
  db.prepare('INSERT INTO users (id, email, password_hash, name, role) VALUES (?, ?, ?, ?, ?)')
    .run(crypto.randomUUID(), 'admin@gmail.com', bcrypt.hashSync('Admin', 10), 'Admin', 'admin')
}

// ── App ────────────────────────────────────────────────────────────────────────
// ── Database Migrations ────────────────────────────────────────────────────────
// A "migration" is a change to an existing database schema (adding columns, renaming things, etc.).
// Because 'shieldlearn.db' already exists for some users, we can't DROP and recreate tables —
// that would delete everyone's scores and data. Instead, we use ALTER TABLE to add new columns.
// The try/catch silently ignores the error if the column already exists (ALTER TABLE throws if it does).

// Migration: add linkedin column if it doesn't exist yet
try { db.exec('ALTER TABLE users ADD COLUMN linkedin TEXT') } catch {}

// Migration: set paths for general modules that link to standalone HTML pages
db.prepare("UPDATE modules SET path = '/gm1.html' WHERE title = 'Intro to Staying Safe'  AND path IS NULL").run()
db.prepare("UPDATE modules SET path = '/gm2.html' WHERE title = 'Password on Lock!'       AND path IS NULL").run()
db.prepare("UPDATE modules SET path = '/gm4.html' WHERE title = 'Shield against Phishers' AND path IS NULL").run()
db.prepare("UPDATE modules SET path = '/gm5.html' WHERE title = 'No more Baiting'         AND path IS NULL").run()

// Migration: set module_type and React paths for general modules
db.prepare("UPDATE modules SET module_type='quiz',          path='/modules/1' WHERE title='Intro to Staying Safe'").run()
db.prepare("UPDATE modules SET module_type='quiz',          path='/modules/2' WHERE title='Password on Lock!'").run()
db.prepare("UPDATE modules SET module_type='phishing',      path='/modules/4' WHERE title='Shield against Phishers'").run()
db.prepare("UPDATE modules SET module_type='scenario-call', path='/modules/5' WHERE title='No more Baiting'").run()

// Migration: upgrade Password on Lock! to the gamified drag-key player
db.prepare("UPDATE modules SET module_type='password-game' WHERE title='Password on Lock!' AND module_type='quiz'").run()

// Migration: enable Password on Lock 2 with the same drag-key player
db.prepare("UPDATE modules SET module_type='password-game', path='/modules/3' WHERE title='Password on Lock 2'").run()

// Migration: seed questions for module 3 (only if empty)
const m3Id = db.prepare("SELECT id FROM modules WHERE title='Password on Lock 2'").get()?.id
if (m3Id && db.prepare('SELECT COUNT(*) as n FROM questions WHERE module_id=?').get(m3Id).n === 0) {
  const iq = db.prepare('INSERT INTO questions (module_id,order_index,data) VALUES (?,?,?)')
  const m3qs = [
    {type:'multiple-choice',scenario:'Your IT department asks everyone to create a new password for the company system. You want to pick the strongest one.',question:'Which of these passwords is the hardest for an attacker to crack?',options:['Summer2024!','correct-horse-battery-staple','P@ssw0rd','CompanyName123'],correctAnswer:'correct-horse-battery-staple',explanation:"A passphrase made of four or more random words is long (28+ characters) and easy to remember, making it much harder to crack than a short complex password. 'P@ssw0rd' and 'Summer2024!' look complex but use predictable substitutions attackers know well. 'CompanyName123' is easy to guess for anyone who knows where you work."},
    {type:'multiple-choice',scenario:'You set up 2-factor authentication (2FA) on your email account. A few weeks later, someone gets hold of your password in a data breach.',question:'What happens when the attacker tries to log in to your email with your leaked password?',options:['They log in successfully because they have the correct password','They are blocked - they also need the second factor from your phone','Your account is automatically deleted to protect you','Nothing - 2FA only works if you set it up after the breach'],correctAnswer:'They are blocked - they also need the second factor from your phone',explanation:"2FA means an attacker needs two things to get in: your password AND a time-sensitive code from your phone (or another device). Even with the correct password, they can't get past the second step without physical access to your device. This is why 2FA is one of the most effective protections you can add to any account."},
    {type:'multiple-choice',scenario:"Your workplace has a rule that everyone must change their password every month. A colleague always changes theirs from 'Tiger1!' to 'Tiger2!', then 'Tiger3!' and so on.",question:'What is the main problem with this approach to password rotation?',options:['Changing passwords too often makes the system run slower','The passwords become predictable - attackers can guess the pattern easily','Monthly changes are too infrequent - it should be weekly','There is no problem - changing passwords regularly is always a good idea'],correctAnswer:'The passwords become predictable - attackers can guess the pattern easily',explanation:"Forced frequent rotation pushes users into predictable habits - adding a number, changing one letter, or appending the month. Attackers who crack one password can easily guess the next. Security experts now recommend only changing your password when there is evidence it has been compromised, and focusing instead on using a strong, unique password with 2FA."},
    {type:'multiple-choice',scenario:'You hear on the news that a website you use has been hacked and user passwords were stolen. You used a strong, unique password for that site and have 2FA enabled.',question:'Which action is most important to take right away?',options:['Do nothing - your password was strong so it cannot be cracked','Change the password on that site and check if you used it anywhere else','Delete your account on that site immediately','Turn off 2FA temporarily while you sort the issue'],correctAnswer:'Change the password on that site and check if you used it anywhere else',explanation:"Even a strong password should be changed promptly after a breach - you don't know exactly what the attacker captured or how it was stored. The most important thing is to change it on the affected site and check whether you reused it anywhere else, because attackers will try it on other services. Keep 2FA on - that's exactly when it protects you most."},
    {type:'multiple-choice',scenario:"A friend says they keep all their passwords in a Word document on their desktop called 'passwords.docx', because they find it impossible to remember them all.",question:'What is the safest way to help your friend manage all their passwords?',options:['Suggest they use the same strong password for everything to keep it simple','Recommend a password manager like Bitwarden or 1Password','Tell them to write passwords in a notebook stored in a locked drawer',"Advise them to use their browser's autofill and never write passwords down"],correctAnswer:'Recommend a password manager like Bitwarden or 1Password',explanation:"A plain Word document has no encryption - anyone who accesses the computer (physically or remotely) can read all the passwords instantly. A dedicated password manager encrypts all your passwords behind one strong master password, generates unique strong passwords for every site, and autofills them securely. It's the recommended solution for managing passwords at scale."}
  ]
  m3qs.forEach((q,i) => iq.run(m3Id, i, JSON.stringify(q)))
}

// Migration: seed questions for module 1 (only if empty)
const m1Id = db.prepare("SELECT id FROM modules WHERE title='Intro to Staying Safe'").get()?.id
if (m1Id && db.prepare('SELECT COUNT(*) as n FROM questions WHERE module_id=?').get(m1Id).n === 0) {
  const iq = db.prepare('INSERT INTO questions (module_id,order_index,data) VALUES (?,?,?)')
  const m1qs = [
    {type:'multiple-choice',question:'What is cybersecurity?',options:['Protecting computers and networks from digital attacks','Creating strong passwords','Using antivirus software','Avoiding social media'],correctAnswer:'Protecting computers and networks from digital attacks',explanation:'Cybersecurity is the practice of protecting systems, networks, and programs from digital attacks. It encompasses many different security practices, not just one specific action.'},
    {type:'true-false',question:'Using the same password for multiple accounts is safe if the password is strong.',correctAnswer:false,explanation:'Even strong passwords should never be reused across accounts. If one account is compromised, all accounts using that password become vulnerable. Always use unique passwords for different accounts.'},
    {type:'multiple-choice',question:'Which of these is the STRONGEST password?',options:['Password123','JohnDoe1990','Tr0ub4dor&3','MyNameIsJohn'],correctAnswer:'Tr0ub4dor&3',explanation:'Tr0ub4dor&3 is the strongest because it combines uppercase and lowercase letters, numbers, and special characters. It\'s also not based on common words or personal information.'},
    {type:'select-all',question:'Which of these are good cybersecurity practices?',options:['Updating software regularly','Clicking on links in emails from unknown senders','Using two-factor authentication','Sharing passwords with friends'],correctAnswer:['Updating software regularly','Using two-factor authentication'],explanation:'Regular software updates and two-factor authentication are essential security practices. Never click unknown links or share passwords, even with friends.'},
    {type:'scenario',scenario:'You receive an email claiming to be from your bank, asking you to verify your account by clicking a link and entering your login details.',question:'What should you do?',options:['Click the link and verify immediately','Delete the email and contact your bank directly using their official website or phone number','Forward the email to friends to warn them','Reply asking if it\'s legitimate'],correctAnswer:'Delete the email and contact your bank directly using their official website or phone number',explanation:'This is a classic phishing attempt. Banks never ask for login details via email. Always contact your bank directly through official channels to verify suspicious communications.'},
    {type:'multiple-choice',question:"What does 'phishing' mean in cybersecurity?",options:['Fishing for compliments online','Tricking people into revealing sensitive information','Catching computer viruses','Looking for free WiFi networks'],correctAnswer:'Tricking people into revealing sensitive information',explanation:'Phishing is a cyber attack where criminals trick people into giving away passwords, credit card numbers, or other sensitive information, often by pretending to be a trusted organization.'},
    {type:'true-false',question:'Public WiFi networks are always safe to use for online banking.',correctAnswer:false,explanation:'Public WiFi networks are NOT safe for sensitive activities like online banking. They\'re often unencrypted, making it easy for hackers to intercept your data. Use your mobile data or a VPN for secure transactions.'},
    {type:'select-all',question:'Which information should you NEVER share on social media?',options:['Your full address','Your favorite movies','Your current location in real-time','Your hobbies and interests'],correctAnswer:['Your full address','Your current location in real-time'],explanation:'Sharing your full address or real-time location can compromise your physical safety and make you vulnerable to stalking or burglary. Sharing interests and hobbies is generally safe.'},
    {type:'scenario',scenario:"A pop-up appears on your computer saying 'VIRUS DETECTED! Call this number immediately to fix your computer!'",question:'What is this most likely to be?',options:['A legitimate virus warning','A helpful Microsoft support message','A scam trying to trick you into calling fake tech support','Your antivirus software alerting you'],correctAnswer:'A scam trying to trick you into calling fake tech support',explanation:'This is a tech support scam. Real virus alerts come from your installed antivirus software, never from pop-up websites. Close the pop-up and run a scan with your legitimate antivirus program.'},
    {type:'multiple-choice',question:'What is two-factor authentication (2FA)?',options:['Using two different passwords','Logging in twice to verify identity','Adding an extra layer of security beyond just a password','Having two antivirus programs'],correctAnswer:'Adding an extra layer of security beyond just a password',explanation:'Two-factor authentication adds an extra security step (like a code sent to your phone) beyond your password. This makes it much harder for hackers to access your accounts, even if they know your password.'}
  ]
  m1qs.forEach((q,i) => iq.run(m1Id, i, JSON.stringify(q)))
}

// Migration: seed questions for module 2 (only if empty)
const m2Id = db.prepare("SELECT id FROM modules WHERE title='Password on Lock!'").get()?.id
if (m2Id && db.prepare('SELECT COUNT(*) as n FROM questions WHERE module_id=?').get(m2Id).n === 0) {
  const iq = db.prepare('INSERT INTO questions (module_id,order_index,data) VALUES (?,?,?)')
  const m2qs = [
    {type:'multiple-choice',scenario:"You're setting up a brand new online banking account. The site asks you to create a password.",question:'Which of these passwords is the strongest and safest to use?',options:['password123','Tr0ub4dor&3!XkQ9','John1990!','qwerty'],correctAnswer:'Tr0ub4dor&3!XkQ9',explanation:"A strong password is long and uses a random mix of uppercase, lowercase, numbers, and symbols. 'Tr0ub4dor&3!XkQ9' ticks all of those boxes. Avoid dictionary words, names, and keyboard patterns — attackers try those first."},
    {type:'multiple-choice',scenario:"Your friend uses the same password for Gmail, Netflix, and their bank because it's 'strong enough'.",question:'What is the biggest security risk of reusing the same password across multiple sites?',options:['It slows down your login','A breach on one site exposes all others','It gets harder to remember','It breaks two-factor authentication'],correctAnswer:'A breach on one site exposes all others',explanation:"Attackers use 'credential stuffing' — they take a leaked username and password and automatically try it across hundreds of websites. One breach can unlock your entire digital life if you reuse passwords."},
    {type:'multiple-choice',scenario:'You have 47 online accounts and are struggling to remember unique passwords for each one.',question:'What is the safest and most practical solution?',options:['Write them all in a notebook','Use a password manager app','Use the same password for all 47','Save them in a text file on your desktop'],correctAnswer:'Use a password manager app',explanation:'Password managers like Bitwarden or 1Password securely generate, store, and autofill unique strong passwords for every site. You only need to remember one strong master password — the manager does the rest.'},
    {type:'multiple-choice',scenario:"You've just created a super-strong 20-character password for your email account. You feel secure.",question:'What extra step significantly increases your account security beyond just the password?',options:['Change your password every day','Tell a trusted friend your password','Enable Two-Factor Authentication (2FA)','Make the password even longer'],correctAnswer:'Enable Two-Factor Authentication (2FA)',explanation:'Two-Factor Authentication (2FA) requires a second proof of identity — like a code sent to your phone — even if someone already has your password. It adds an entirely separate layer of defence.'},
    {type:'multiple-choice',scenario:"You get an email: 'Your account has been compromised! Click here and enter your password to verify.' The linked page looks exactly like your bank.",question:'What should you do?',options:['Enter your password quickly to secure it',"Go directly to your bank's real website instead","Reply to the email asking if it's genuine","Forward it to friends to warn them"]  ,correctAnswer:"Go directly to your bank's real website instead",explanation:"This is a phishing attack. Legitimate organisations never ask for your password via email links. Always navigate directly to official websites by typing the address yourself. Entering your details on a fake page hands them straight to the attacker."}
  ]
  m2qs.forEach((q,i) => iq.run(m2Id, i, JSON.stringify(q)))
}

// Migration: seed questions for module 4 (phishing, only if empty)
const m4Id = db.prepare("SELECT id FROM modules WHERE title='Shield against Phishers'").get()?.id
if (m4Id && db.prepare('SELECT COUNT(*) as n FROM questions WHERE module_id=?').get(m4Id).n === 0) {
  const iq = db.prepare('INSERT INTO questions (module_id,order_index,data) VALUES (?,?,?)')
  const m4qs = [
    {icon:'📧',scenario:'You check your inbox and see this email.',attackText:'⚠️ Suspicious email detected! Analyse it carefully.',question:"Which part of this email is the biggest red flag that it's a phishing attempt?",email:{from:{val:'security@paypa1-alerts.com',sus:true},to:{val:'you@email.com',sus:false},subject:{val:'URGENT: Verify your account or it will be closed',sus:false},body:"Dear Valued Customer,<br><br>We have detected <strong>unusual activity</strong> on your account. You must verify your details within <strong>24 hours</strong> or your account will be permanently closed.<br><br>",link:null},sms:null,options:["The sender's email uses 'paypa1' (number 1) instead of 'paypal'",'The email mentions unusual activity','The email has a deadline of 24 hours',"The email says 'Dear Valued Customer' instead of your name"],correctAnswer:"The sender's email uses 'paypa1' (number 1) instead of 'paypal'",explanation:"The most critical red flag is the spoofed sender domain: 'paypa1-alerts.com' uses the number 1 instead of the letter l. Attackers register look-alike domains hoping you won't notice. Always check the full sender email address carefully before clicking anything."},
    {icon:'💬',scenario:'A colleague forwards you this text message they received.',attackText:'🚨 SMS phishing (smishing) alert incoming!',question:"This is a 'smishing' (SMS phishing) attack. What should your colleague do?",email:null,sms:{sender:'HSBC-Alert',number:'+44 7459 103827',message:'HSBC: We have <strong>suspended your account</strong> due to suspicious activity. To restore access immediately, verify your details now:',link:{text:'http://hsbc-secure-verif1y.net/login',sus:true},time:'Today, 11:42'},options:["Click the link to check if it's real",'Reply STOP to unsubscribe','Delete the message and report it as spam','Forward it to friends to warn them about it'],correctAnswer:'Delete the message and report it as spam',explanation:'Smishing messages use urgency and fear to make you act fast without thinking. Never click links in unexpected texts, even if they claim to be from your bank or a delivery service. Delete and report them as junk. Forwarding them risks spreading malicious links.'},
    {icon:'🔐',scenario:'You need to log in to your bank. You type the address, and this page loads.',attackText:"🎣 Fake website trap! Don't get caught out.",question:"You're on what looks like your bank's login page. How can you tell it's fake?",email:{from:null,to:null,subject:null,body:'🔐 <strong>https://www.barcc1ays-secure-login.co.uk</strong><br><br><em>The URL in the browser bar shows the address above. The padlock icon is green. The page looks identical to your real bank\'s website.</em>',link:null},sms:null,options:["It has a padlock — padlocks guarantee a site is safe","The domain name is 'barcc1ays-secure-login.co.uk', not barclays.co.uk",'The design looks exactly like the real site','The URL uses HTTPS, so it must be trustworthy'],correctAnswer:"The domain name is 'barcc1ays-secure-login.co.uk', not barclays.co.uk",explanation:"A padlock and HTTPS only mean your connection is encrypted — they do NOT guarantee the site is legitimate. Attackers get free SSL certificates too. Always check the actual domain name carefully. 'barcc1ays-secure-login.co.uk' is not the same as 'barclays.co.uk' — notice the substituted characters and extra words."},
    {icon:'📞',scenario:'You receive a phone call. The caller claims to be from Microsoft and says your computer has a virus that only they can fix remotely.',attackText:'☎️ Vishing call alert! Voice phishing in progress.',question:"This is 'vishing' (voice phishing). What is the safest response?",email:null,sms:null,options:['Allow them remote access so they can fix it','Give them your Windows licence key to verify your identity',"Ask for their employee number and call Microsoft's official number yourself","Hang up immediately — Microsoft does not make unsolicited calls"],correctAnswer:"Hang up immediately — Microsoft does not make unsolicited calls",explanation:"Microsoft, Apple, Google, and your bank will never call you unsolicited to warn about viruses. This is a classic tech support scam. The 'call back on official number' tactic sounds sensible but even then attackers may stay on the line. The safest action is to hang up immediately and independently search the official number if you're concerned."},
    {icon:'📩',scenario:"An email arrives from your company's IT department asking you to urgently reset your password by clicking a link because of a 'system upgrade'.",attackText:'🎯 Spear phishing — targeted company attack!',question:"This is 'spear phishing' — a targeted attack pretending to be internal. What should you do first?",email:{from:{val:'it-support@c0mpany-helpdesk.net',sus:true},to:{val:'you@yourcompany.com',sus:false},subject:{val:'Action Required: Reset Password Before 5pm Today',sus:false},body:'Hi,<br><br>Due to a <strong>critical system upgrade</strong>, all employees must reset their passwords today. Failure to do so will result in account lockout.<br><br>This is time-sensitive.',link:{text:'Reset Password Now',url:'#',sus:true}},sms:null,options:["Click the link since it came from 'IT Support'",'Ignore it — IT never sends password reset emails','Verify directly with IT support using a known phone number or internal chat','Forward it to your manager to deal with'],correctAnswer:'Verify directly with IT support using a known phone number or internal chat',explanation:"Spear phishing uses specific details about your organisation to seem legitimate. Notice the sender domain is 'c0mpany-helpdesk.net' — not your actual company domain. Always verify unexpected IT requests through a separate, trusted channel (call your IT helpdesk directly or message them on your internal system). Never use contact details in the suspicious email itself."}
  ]
  m4qs.forEach((q,i) => iq.run(m4Id, i, JSON.stringify(q)))
}

// Migration: seed questions for module 5 (scenario-call, only if empty)
const m5Id = db.prepare("SELECT id FROM modules WHERE title='No more Baiting'").get()?.id
if (m5Id && db.prepare('SELECT COUNT(*) as n FROM questions WHERE module_id=?').get(m5Id).n === 0) {
  const iq = db.prepare('INSERT INTO questions (module_id,order_index,data) VALUES (?,?,?)')
  const m5qs = [
    {caller:'Bank Security Team',number:'+44 800 XXXX',question:'I just need to confirm your identity — can you tell me your full name and date of birth?',correctAction:'refuse',redFlags:["Legitimate organizations don't ask for personal information to verify YOU","Banks already have your details - they don't need you to confirm them",'This is a classic identity phishing tactic'],explanation:'Never give personal information over the phone. If someone needs to verify your identity, they should ask you to verify THEM first. You should hang up and call the official number.'},
    {caller:'IT Support',number:'+44 7234 XXXX',question:"There's been suspicious activity on your account. Can you verify your login details so we can secure it?",correctAction:'refuse',redFlags:["Creating urgency with 'suspicious activity' to make you panic",'No legitimate service asks for login credentials over the phone','Scammers use fear to bypass your critical thinking'],explanation:'Login credentials should NEVER be shared with anyone, even if they claim to be from support. Always access your account directly through official channels.'},
    {caller:'University Support',number:'+44 161 XXX XXXX',question:"I'm calling from your university's student support. For security, can you confirm which email address you have registered with us?",correctAction:'comply',greenFlags:["They're asking you to confirm what YOU already know",'Email addresses are less sensitive than passwords or personal details',"This is reasonable verification - they're not asking for passwords or financial info"],explanation:'This is a legitimate verification method. They\'re asking you to confirm information YOU already know, not asking for sensitive credentials. However, always be cautious and if unsure, offer to call them back on an official number.'},
    {caller:'Refund Department',number:'+44 203 XXXX',question:"You're eligible for a refund, but we need your bank details to process it today.",correctAction:'refuse',redFlags:["Pressure to act 'today' is a manipulation tactic","Legitimate refunds don't require you to provide bank details over the phone",'Scammers use financial incentives as bait'],explanation:'Refund scams are extremely common. Real companies process refunds through secure, verified channels, not by asking for bank details over the phone.'},
    {caller:'Account Security',number:'Unknown Number',question:'This issue must be resolved immediately or your account will be locked. Are you able to act right now?',correctAction:'refuse',redFlags:['Extreme urgency and threats are major red flags','Fear of account lockout pressures you to comply',"No time to think = scammer's advantage"],explanation:'Scammers use threats and urgency to prevent rational thinking. Legitimate organizations give you time and multiple ways to resolve issues.'},
    {caller:'Online Retailer Support',number:'+44 800 XXXX',question:'We need to verify your recent order. Can you confirm the last four digits of the card you used for your purchase?',correctAction:'comply',greenFlags:['Asking for last 4 digits only (not full card number)','Related to a specific transaction you made','This is standard verification used by legitimate companies'],explanation:"Asking for the last 4 digits of your card is a standard, safe verification method. They're NOT asking for the full number, CVV, or PIN. However, only provide this if you initiated the contact or can verify the caller's legitimacy."},
    {caller:'Verification Team',number:'+44 800 XXXX',question:"I've sent you a one-time code — please read it back to me so I can finish the verification.",correctAction:'refuse',redFlags:['One-time codes are for YOUR verification only','Sharing codes gives scammers access to your accounts','This is a direct account takeover attempt'],explanation:"Never share one-time codes with anyone. These codes are designed to verify that YOU are trying to access YOUR account, not to verify someone else."}
  ]
  m5qs.forEach((q,i) => iq.run(m5Id, i, JSON.stringify(q)))
}

const app = express()
const allowedOrigins = [
  'http://localhost:5173',
  'https://rsbweb.onrender.com',
]
app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (e.g. curl, Postman) or from allowed origins
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true)
    } else {
      callback(new Error('Not allowed by CORS'))
    }
  },
}))
app.use(express.json())

// POST /api/auth/register
app.post('/api/auth/register', (req, res) => {
  const { email, password, name, phone, role, avatarIndex } = req.body
  if (!email || !password) return res.status(400).json({ error: 'Email and password are required' })
  if (password.length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters' })

  // Check if the email is already taken before inserting
  if (db.prepare('SELECT id FROM users WHERE email = ?').get(email)) {
    return res.status(400).json({ error: 'Email already registered' })
  }

  const id = crypto.randomUUID()

  // Hash the password before storing it — NEVER store the plain-text version
  const password_hash = bcrypt.hashSync(password, 10)

  // The ?? operator is called "nullish coalescing":
  //   name ?? null  →  use 'name' if it has a value, otherwise use null
  // This is safer than using || because || would also replace empty strings and 0.
  db.prepare(
    'INSERT INTO users (id, email, password_hash, name, phone, role, avatar_index) VALUES (?, ?, ?, ?, ?, ?, ?)'
  ).run(id, email, password_hash, name ?? null, phone ?? null, role ?? null, avatarIndex ?? null)

  res.json({ user: { id, email, name, phone, role, avatar_index: avatarIndex } })
})

// POST /api/auth/login
app.post('/api/auth/login', (req, res) => {
  const { email, password } = req.body
  if (!email || !password) return res.status(400).json({ error: 'Email and password are required' })

  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email)

  // bcrypt.compareSync(plainText, hash) — re-hashes the entered password and compares it
  // to the stored hash. Returns true if they match, false otherwise.
  // We return the SAME generic error whether the email or password is wrong —
  // this prevents attackers from finding out which accounts exist (user enumeration).
  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    return res.status(400).json({ error: 'Invalid email or password' })
  }

  // Rest destructuring: `const { password_hash, ...safeUser } = user`
  // This pulls out 'password_hash' into its own variable and puts EVERYTHING ELSE into 'safeUser'.
  // We then send 'safeUser' to the frontend — the password hash is never sent over the network.
  const { password_hash, ...safeUser } = user
  res.json({ user: safeUser })
})

// GET /api/modules  — returns categories with nested modules
app.get('/api/modules', (_req, res) => {
  const categories = db.prepare('SELECT * FROM categories ORDER BY id').all()
  const result = categories.map((cat) => ({
    ...cat,
    modules: db.prepare('SELECT * FROM modules WHERE category_id = ? ORDER BY id').all(cat.id),
  }))
  res.json(result)
})

// GET /api/modules/:id  — single module info
app.get('/api/modules/:id', (req, res) => {
  const mod = db.prepare('SELECT * FROM modules WHERE id = ?').get(req.params.id)
  if (!mod) return res.status(404).json({ error: 'Module not found' })
  res.json(mod)
})

// GET /api/modules/:id/questions  — questions for a module, ordered
app.get('/api/modules/:id/questions', (req, res) => {
  const rows = db.prepare('SELECT data FROM questions WHERE module_id = ? ORDER BY order_index').all(req.params.id)
  res.json(rows.map((r) => JSON.parse(r.data)))
})

// POST /api/scores  — save a score after completing a module
app.post('/api/scores', (req, res) => {
  const { userId, moduleId, score, total, passed, badge } = req.body
  if (!userId || !moduleId) return res.status(400).json({ error: 'userId and moduleId are required' })

  db.prepare(
    'INSERT INTO scores (user_id, module_id, score, total, passed, badge) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(userId, moduleId, score, total, passed ? 1 : 0, badge ?? null)

  res.json({ ok: true })
})

// PATCH /api/users/:id  — update profile fields
app.patch('/api/users/:id', (req, res) => {
  const { name, avatarIndex, phone, password, linkedin } = req.body
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id)
  if (!user) return res.status(404).json({ error: 'User not found' })

  let newPasswordHash = user.password_hash
  if (password) {
    if (password.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters' })
    newPasswordHash = bcrypt.hashSync(password, 10)
  }

  db.prepare(
    'UPDATE users SET name = ?, phone = ?, linkedin = ?, avatar_index = ?, password_hash = ? WHERE id = ?'
  ).run(
    name ?? user.name,
    phone !== undefined ? phone : user.phone,
    linkedin !== undefined ? linkedin : (user.linkedin ?? null),
    avatarIndex !== undefined ? avatarIndex : user.avatar_index,
    newPasswordHash,
    req.params.id
  )

  const updated = db.prepare(
    'SELECT id, email, name, phone, role, avatar_index, linkedin FROM users WHERE id = ?'
  ).get(req.params.id)
  res.json({ user: updated })
})

// GET /api/scores/:userId  — get all scores for a user
app.get('/api/scores/:userId', (req, res) => {
  const rows = db.prepare(`
    SELECT s.*, m.title as module_title, m.path as module_path
    FROM scores s
    JOIN modules m ON s.module_id = m.id
    WHERE s.user_id = ?
    ORDER BY s.completed_at DESC
  `).all(req.params.userId)
  res.json(rows)
})

// ── Admin API ─────────────────────────────────────────────────────────────────

app.get('/api/admin/categories', (_req, res) => {
  res.json(db.prepare('SELECT * FROM categories ORDER BY id').all())
})
app.post('/api/admin/categories', (req, res) => {
  const { icon, label } = req.body
  if (!label) return res.status(400).json({ error: 'Label is required' })
  try {
    // 'RETURNING *' is a SQLite feature that returns the newly inserted row immediately.
    // Without it, we'd have to run a separate SELECT after the INSERT to get the new record.
    // We use .get() (not .run()) because RETURNING * produces a result row.
    res.json(db.prepare('INSERT INTO categories (icon, label) VALUES (?, ?) RETURNING *').get(icon ?? '📁', label))
  } catch { res.status(400).json({ error: 'Label must be unique' }) }
})
app.put('/api/admin/categories/:id', (req, res) => {
  const { icon, label } = req.body
  db.prepare('UPDATE categories SET icon=?, label=? WHERE id=?').run(icon ?? '📁', label, req.params.id)
  res.json({ ok: true })
})
app.delete('/api/admin/categories/:id', (req, res) => {
  db.prepare('DELETE FROM categories WHERE id=?').run(req.params.id)
  res.json({ ok: true })
})

app.get('/api/admin/modules', (_req, res) => {
  res.json(db.prepare('SELECT m.*, c.label as category_label FROM modules m JOIN categories c ON m.category_id=c.id ORDER BY m.id').all())
})
app.post('/api/admin/modules', (req, res) => {
  const { category_id, icon, title, description, level, path, coming_soon, module_type, badge, accent_color } = req.body
  if (!title) return res.status(400).json({ error: 'Title is required' })
  res.json(db.prepare('INSERT INTO modules (category_id,icon,title,description,level,path,coming_soon,module_type,badge,accent_color) VALUES (?,?,?,?,?,?,?,?,?,?) RETURNING *').get(category_id, icon ?? '📚', title, description ?? null, level ?? 'beginner', path ?? null, coming_soon ? 1 : 0, module_type ?? null, badge ?? null, accent_color ?? null))
})
app.put('/api/admin/modules/:id', (req, res) => {
  const { category_id, icon, title, description, level, path, coming_soon, module_type, badge, accent_color } = req.body
  db.prepare('UPDATE modules SET category_id=?,icon=?,title=?,description=?,level=?,path=?,coming_soon=?,module_type=?,badge=?,accent_color=? WHERE id=?').run(category_id, icon ?? '📚', title, description ?? null, level ?? 'beginner', path ?? null, coming_soon ? 1 : 0, module_type ?? null, badge ?? null, accent_color ?? null, req.params.id)
  res.json({ ok: true })
})
app.delete('/api/admin/modules/:id', (req, res) => {
  db.prepare('DELETE FROM modules WHERE id=?').run(req.params.id)
  res.json({ ok: true })
})

app.get('/api/admin/questions/:moduleId', (req, res) => {
  res.json(db.prepare('SELECT * FROM questions WHERE module_id=? ORDER BY order_index').all(req.params.moduleId).map(r => ({ ...r, data: JSON.parse(r.data) })))
})
app.post('/api/admin/questions', (req, res) => {
  const { module_id, order_index, data } = req.body
  res.json(db.prepare('INSERT INTO questions (module_id,order_index,data) VALUES (?,?,?) RETURNING *').get(module_id, order_index, JSON.stringify(data)))
})
app.put('/api/admin/questions/:id', (req, res) => {
  const { order_index, data } = req.body
  db.prepare('UPDATE questions SET order_index=?,data=? WHERE id=?').run(order_index, JSON.stringify(data), req.params.id)
  res.json({ ok: true })
})
app.delete('/api/admin/questions/:id', (req, res) => {
  db.prepare('DELETE FROM questions WHERE id=?').run(req.params.id)
  res.json({ ok: true })
})

// POST /api/surveys — save a survey response
app.post('/api/surveys', (req, res) => {
  const { moduleName, q1, q2, q3, q4, q5, q6 } = req.body
  if (!moduleName) return res.status(400).json({ error: 'moduleName is required' })
  const row = db.prepare(
    'INSERT INTO surveys (module_name,q1_rating,q2_difficulty,q3_helpful,q4_nps,q5_feedback,q6_confidence) VALUES (?,?,?,?,?,?,?) RETURNING *'
  ).get(moduleName, q1 ?? null, q2 ?? null, q3 ? JSON.stringify(q3) : null, q4 ?? null, q5 || null, q6 ?? null)
  res.json(row)
})

// GET /api/admin/surveys — all survey responses for the admin dashboard
app.get('/api/admin/surveys', (_req, res) => {
  const rows = db.prepare('SELECT * FROM surveys ORDER BY created_at DESC').all()
  res.json(rows.map(r => ({
    ...r,
    q3_helpful: r.q3_helpful ? JSON.parse(r.q3_helpful) : [],
  })))
})

// ── Chatbot API ───────────────────────────────────────────────────────────────

// POST /api/chat
// Receives a user message and returns an AI-generated reply.
// The AI uses NLP (tokenisation + stemming + Naive Bayes) to understand the intent.
//
// Request body:  { message: "what is phishing?" }
// Response body: { reply: "Phishing is ..." }
app.post('/api/chat', (req, res) => {
  const { message } = req.body

  // Basic validation — we need something to work with
  if (!message || typeof message !== 'string' || message.trim() === '') {
    return res.status(400).json({ error: 'Please provide a message.' })
  }

  // Pass the message through our NLP pipeline in chatbot.js
  const reply = getResponse(message.trim())

  // Send the chatbot's response back to the React frontend
  res.json({ reply })
})

// ── Forum API ─────────────────────────────────────────────────────────────────

// GET /api/forum — return all posts, newest first
app.get('/api/forum', (_req, res) => {
  const rows = db.prepare('SELECT * FROM forum_posts ORDER BY created_at DESC').all()
  res.json(rows)
})

// POST /api/forum — student submits a new post
app.post('/api/forum', (req, res) => {
  const { user_id, author, avatar, category, title, body } = req.body
  if (!title || !body) return res.status(400).json({ error: 'Title and body are required' })
  const row = db.prepare(
    'INSERT INTO forum_posts (user_id, author, avatar, category, title, body) VALUES (?, ?, ?, ?, ?, ?) RETURNING *'
  ).get(
    user_id   ?? null,
    author    || 'Anonymous',
    avatar    || '👤',
    category  || '💬 General',
    title,
    body
  )
  res.json(row)
})

// ── Admin Forum API ───────────────────────────────────────────────────────────

// GET /api/admin/forum — all posts for the admin table
app.get('/api/admin/forum', (_req, res) => {
  const rows = db.prepare('SELECT * FROM forum_posts ORDER BY created_at DESC').all()
  res.json(rows)
})

// POST /api/admin/forum — admin creates a post on behalf of a user
app.post('/api/admin/forum', (req, res) => {
  const { author, avatar, category, title, body } = req.body
  if (!title || !body) return res.status(400).json({ error: 'Title and body are required' })
  const row = db.prepare(
    'INSERT INTO forum_posts (author, avatar, category, title, body) VALUES (?, ?, ?, ?, ?) RETURNING *'
  ).get(author || 'Admin', avatar || '👤', category || '💬 General', title, body)
  res.json(row)
})

// PUT /api/admin/forum/:id — admin edits an existing post
app.put('/api/admin/forum/:id', (req, res) => {
  const { author, avatar, category, title, body } = req.body
  db.prepare(
    'UPDATE forum_posts SET author=?, avatar=?, category=?, title=?, body=? WHERE id=?'
  ).run(author, avatar || '👤', category || '💬 General', title, body, req.params.id)
  res.json({ ok: true })
})

// DELETE /api/admin/forum/:id — admin removes a post
app.delete('/api/admin/forum/:id', (req, res) => {
  db.prepare('DELETE FROM forum_posts WHERE id=?').run(req.params.id)
  res.json({ ok: true })
})

// ── Start ──────────────────────────────────────────────────────────────────────
// Only bind a local port when run directly (npm run server). On Vercel the
// serverless wrapper imports `app` and handles requests without listen().
if (require.main === module) {
  app.listen(PORT, () => console.log(`ShieldLearn API running on http://localhost:${PORT}`))
}

module.exports = app
