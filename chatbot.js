// ─────────────────────────────────────────────────────────────────────────────
//  chatbot.js  —  Simple AI Chatbot using 'natural' (JavaScript NLP library)
//
//  'natural' is the JavaScript equivalent of Python's NLTK.
//  It gives us tools like tokenization, stemming, and Naive Bayes classification
//  — all the same concepts you'd use in a Python AI/NLP course!
//
//  Reference: https://github.com/NaturalNode/natural
//  Concepts covered:
//    1. Tokenisation  — splitting text into words (like nltk.word_tokenize)
//    2. Stemming      — reducing words to their root (like nltk.stem.PorterStemmer)
//    3. Naive Bayes   — a classic ML classifier (like nltk.NaiveBayesClassifier)
//    4. Intent detection — figuring out what the user is asking
// ─────────────────────────────────────────────────────────────────────────────

// Import 'natural' — our NLP toolkit (installed via: npm install natural)
const natural = require('natural')

// ── Step 1: Set up NLP tools ───────────────────────────────────────────────
// WordTokenizer breaks a sentence into individual words (tokens)
// e.g. "what is phishing?" → ["what", "is", "phishing"]
const tokenizer = new natural.WordTokenizer()

// PorterStemmer reduces words to their root form so the AI matches more variants
// e.g. "running" → "run",  "phishing" → "phish",  "passwords" → "password"
const stemmer = natural.PorterStemmer

// ── Step 2: Create the Naive Bayes Classifier ─────────────────────────────
// Naive Bayes is a simple but powerful ML algorithm for text classification.
// We train it by showing it example phrases and telling it which "intent" they belong to.
const classifier = new natural.BayesClassifier()

// ── Step 3: Training data ──────────────────────────────────────────────────
// Think of this like building a corpus in NLTK.
// Each addDocument call gives the AI one example of a question and its topic.
// The more examples you add, the smarter it becomes!

// Intent: phishing
classifier.addDocument('what is phishing', 'phishing')
classifier.addDocument('explain phishing attack', 'phishing')
classifier.addDocument('how does phishing work', 'phishing')
classifier.addDocument('what is a phishing email', 'phishing')
classifier.addDocument('phishing scam examples', 'phishing')

// Intent: malware
classifier.addDocument('what is malware', 'malware')
classifier.addDocument('explain malware types', 'malware')
classifier.addDocument('how does a virus work', 'malware')
classifier.addDocument('what is ransomware', 'malware')
classifier.addDocument('what is spyware', 'malware')
classifier.addDocument('what is a trojan', 'malware')

// Intent: password security
classifier.addDocument('what is a strong password', 'password')
classifier.addDocument('how to create a secure password', 'password')
classifier.addDocument('password security tips', 'password')
classifier.addDocument('how do i protect my password', 'password')
classifier.addDocument('best password practices', 'password')

// Intent: two-factor authentication
classifier.addDocument('what is two factor authentication', 'twofa')
classifier.addDocument('explain 2fa', 'twofa')
classifier.addDocument('what is mfa multi factor', 'twofa')
classifier.addDocument('how does 2fa work', 'twofa')
classifier.addDocument('why should i use two factor authentication', 'twofa')

// Intent: firewall
classifier.addDocument('what is a firewall', 'firewall')
classifier.addDocument('explain how a firewall works', 'firewall')
classifier.addDocument('what does a firewall do', 'firewall')
classifier.addDocument('types of firewalls', 'firewall')

// Intent: encryption
classifier.addDocument('what is encryption', 'encryption')
classifier.addDocument('explain how encryption works', 'encryption')
classifier.addDocument('what is ssl tls', 'encryption')
classifier.addDocument('what is https', 'encryption')
classifier.addDocument('difference between http and https', 'encryption')

// Intent: greeting
classifier.addDocument('hello', 'greeting')
classifier.addDocument('hi there', 'greeting')
classifier.addDocument('hey al', 'greeting')
classifier.addDocument('good morning', 'greeting')
classifier.addDocument('howdy', 'greeting')

// Intent: help
classifier.addDocument('help', 'help')
classifier.addDocument('what can you do', 'help')
classifier.addDocument('what topics do you cover', 'help')
classifier.addDocument('what can i ask you', 'help')
classifier.addDocument('show me what you know', 'help')

// ── Step 4: Train the model ────────────────────────────────────────────────
// This is where the AI learns from all the examples above.
// Internally, it calculates word probabilities for each intent category.
classifier.train()

// ── Step 5: Response bank ──────────────────────────────────────────────────
// Once we know the intent, we look up a pre-written educational reply.
const responses = {
  phishing:
    'Phishing is a cyber attack where hackers trick you into revealing sensitive info (passwords, card details) by pretending to be a trusted source — usually via fake emails or websites.\n\nTip: Always check the sender email address carefully and never click suspicious links!',

  malware:
    'Malware (Malicious Software) is any program designed to harm your device or steal data. Common types:\n• Virus — spreads between files\n• Ransomware — locks your files and demands payment\n• Spyware — secretly watches you\n• Trojan — disguises itself as safe software\n\nTip: Keep your antivirus updated and avoid downloading from unknown sources.',

  password:
    'A strong password should:\n• Be at least 12 characters long\n• Mix uppercase, lowercase, numbers, and symbols (!@#$)\n• NOT be a real word or your name\n• Be unique for every account\n\nTip: Use a password manager (like Bitwarden) so you only need to remember one master password!',

  twofa:
    'Two-Factor Authentication (2FA) adds a second security check after your password — usually a code sent to your phone.\n\nEven if someone steals your password, they still cannot log in without your phone!\n\nTip: Enable 2FA on your email, social media, and banking apps right now.',

  firewall:
    'A firewall is a security system that monitors network traffic and blocks anything that looks dangerous. Think of it as a security guard for your internet connection.\n\nTypes:\n• Software firewall — runs on your device\n• Hardware firewall — a physical device protecting a whole network\n\nTip: Always keep your firewall turned on!',

  encryption:
    'Encryption scrambles your data into unreadable code — only someone with the right key can decode it.\n\nHTTPS (the padlock in your browser) uses SSL/TLS encryption to protect data sent between you and a website.\n\nTip: Only enter sensitive info (passwords, card numbers) on sites that start with https://',

  greeting:
    "Hello! I'm AL, your ShieldLearn cybersecurity assistant. I can help you learn about phishing, malware, passwords, 2FA, firewalls, and encryption. What would you like to know?",

  help:
    "I can answer questions on these cybersecurity topics:\n• Phishing attacks\n• Malware & viruses\n• Password security\n• Two-factor authentication (2FA)\n• Firewalls\n• Encryption & HTTPS\n\nJust type a question in plain English and I'll explain it!",

  default:
    "I'm not sure about that one yet! Try asking me about: phishing, malware, passwords, 2FA, firewalls, or encryption. Type 'help' to see all topics.",
}

// ── Step 6: Main chatbot function ─────────────────────────────────────────
// Called every time a user sends a message.
// NLP pipeline: tokenise → stem → classify → respond
function getResponse(userMessage) {
  // Tokenise the input (split into words, lowercase)
  const tokens = tokenizer.tokenize(userMessage.toLowerCase())

  // Stem each token so "phishing" and "phish" both match the same intent
  const stemmedInput = tokens.map(token => stemmer.stem(token)).join(' ')

  // Ask the Naive Bayes classifier which intent this message belongs to
  const intent = classifier.classify(stemmedInput)

  // Return the matching educational response (or a default if nothing fits)
  return responses[intent] || responses.default
}

// Export the function so server.js can use it
module.exports = { getResponse }
