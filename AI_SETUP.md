# 🤖 GitHub Discussion AI Bot — Setup Guide
### Powered by Google Gemini (Free!)

---

## 💬 How the Bot Responds

When a user mentions you in a Discussion, the bot replies like this:

```
Hey @username! 👋 Thank you for your interest in the repo/project repository!

**Your Question:**
[Restated question]

**💡 Answer / Solution:**
[Detailed answer based on your codebase, referencing specific files/code]

---
> 📝 Note: This response is AI-generated and may not be 100% accurate.
> If this answer is correct, the repository owner @you will give a 👍 to verify it!
```

If the question is off-topic:
```
**⚠️ Out of Scope:**
Sorry, this query does not appear to be related to this repository...
```

---

## ⚙️ Setup Steps

### Step 1 — Add the workflow file
Place `discussion-bot.yml` into your repo at:
```
.github/workflows/discussion-bot.yml
```

### Step 2 — Get your FREE Gemini API Key
1. Go to 👉 https://aistudio.google.com
2. Sign in with your Google account
3. Click "Get API Key" → "Create API Key"
4. Copy the key (looks like: AIzaSy...)

✅ No credit card needed! Free tier = 1,500 requests/day

### Step 3 — Add secret to GitHub
1. Go to your repo → Settings → Secrets and variables → Actions
2. Click "New repository secret"
3. Name: GEMINI_API_KEY
4. Value: paste your key
5. Click "Add secret"

### Step 4 — Enable Discussions
1. Go to your repo → Settings
2. Scroll to Features section
3. Check ✅ Discussions

### Step 5 — Set workflow permissions
1. Go to Settings → Actions → General
2. Under Workflow permissions select: Read and write permissions
3. Click Save

---

## ✅ You're Done!

Now whenever anyone mentions you in a Discussion:
  "Hey @yourusername, how does the login system work here?"

The bot auto-replies in ~30 seconds! 🚀

---

## 🛠️ Troubleshooting

| Problem | Fix |
|---------|-----|
| Bot not triggering | User must type @yourusername exactly |
| Gemini API error | Double-check GEMINI_API_KEY secret |
| Permission denied | Set Actions to Read & Write in Settings |

---

## 💰 Cost: $0 🎉

GitHub Actions: Free (2,000 min/month)
Gemini API: Free (1,500 req/day)