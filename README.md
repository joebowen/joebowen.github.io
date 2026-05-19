# Joe Bowen's GitHub Portfolio

Welcome to my personal website — a lightweight portfolio site for showcasing my background, coursework, projects, timeline, resume, and technical interests.

The frontend is hosted with **GitHub Pages** at:

➡️ [https://joebowen.github.io](https://joebowen.github.io)

This site also includes **Joe GPT**, a custom chatbot that answers questions about my background, projects, coursework, interests, and resume. Because GitHub Pages only supports static frontend hosting, Joe GPT uses a separate **Vercel serverless backend** to securely call the Poe API without exposing API keys in the browser.

---

## Features

- Clean, responsive portfolio built with HTML, CSS, and vanilla JavaScript
- About Me section with education, interests, coursework, and resume link
- Timeline section for education and work experience
- Projects section highlighting technical work
- Joe GPT chatbot for interactive questions about Joe Bowen
- Static frontend hosted on GitHub Pages
- Secure backend API hosted on Vercel
- API keys stored safely as Vercel environment variables

---

## Tech Stack

### Frontend

- **HTML5**
- **CSS3**
- **JavaScript**

### Backend for Joe GPT

- **Vercel Serverless Functions**
- **Poe API**
- **Node.js-style API route**

---

## Live Site

➡️ [https://joebowen.github.io](https://joebowen.github.io)

---

## Joe GPT Overview

Joe GPT is an embedded chatbot on the portfolio site. It is designed to answer questions about:

- Joe Bowen’s background
- Education
- Coursework
- Projects
- Resume
- Timeline
- Technical interests
- Contact links, if available on the site

Joe GPT is intentionally scoped to the portfolio. It should not answer unrelated general-knowledge questions, coding homework, news, politics, or anything unrelated to Joe Bowen or this website.

---

## Why Vercel Is Used

GitHub Pages is great for hosting static websites, but it cannot run backend code or securely store private API keys.

Because Joe GPT needs to call the Poe API, the site uses Vercel for the backend API route:

`/api/joe-gpt`

The GitHub Pages frontend sends chatbot messages to the Vercel backend. The Vercel backend then calls Poe using a secure environment variable.

This keeps the API key hidden from the browser.

---

## Frontend-to-Backend Setup

In the frontend JavaScript, the chatbot should call the Vercel API endpoint, not a local GitHub Pages route.

Example:

    const response = await fetch("https://joebowen-github-io.vercel.app/api/joe-gpt", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ message: userMessage })
    });

Do not use this on GitHub Pages:

    fetch("/api/joe-gpt")

That would point to:

    https://joebowen.github.io/api/joe-gpt

GitHub Pages cannot run that backend route.

---

## Vercel Backend Setup

The backend file is located at:

    api/joe-gpt.js

This file handles requests from the frontend, applies Joe GPT’s system context/rules, and calls the Poe API.

The backend also includes CORS headers so that the GitHub Pages site can call the Vercel API.

Example CORS setup:

    res.setHeader("Access-Control-Allow-Origin", "https://joebowen.github.io");
    res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");

---

## Environment Variables

The Poe API key should never be committed to GitHub.

Instead, add it to Vercel as an environment variable.

Required production environment variables:

    POE_API_KEY
    POE_MODEL

Example model value:

    gpt-4o-mini

Do not include quotes when entering values into Vercel.

Correct:

    gpt-4o-mini

Incorrect:

    "gpt-4o-mini"

---

## Adding Environment Variables to Vercel

From the project root, run:

    vercel env add POE_API_KEY production

Paste the Poe API key when prompted.

Then add the model:

    vercel env add POE_MODEL production

Example value:

    gpt-4o-mini

If preview deployments should also work, add the variables for preview too:

    vercel env add POE_API_KEY preview
    vercel env add POE_MODEL preview

---

## Deploying the Backend to Vercel

After updating the backend or environment variables, deploy to production:

    vercel --prod

This updates the live Vercel API endpoint used by Joe GPT.

---

## Updating the GitHub Pages Frontend

For frontend changes such as HTML, CSS, JavaScript, images, or resume updates:

    git add .
    git commit -m "Update portfolio site"
    git push origin main

GitHub Pages will rebuild and publish the updated site.

---

## Updating Joe GPT

If you update Joe GPT’s backend logic, context, rules, CORS settings, or Poe API call, run:

    git add .
    git commit -m "Update Joe GPT backend"
    git push origin main
    vercel --prod

If you only update frontend files, `vercel --prod` is usually not required.

If you only update backend files, pushing to GitHub keeps the repository current, and `vercel --prod` updates the live backend.

---

## Local Development

Install dependencies if needed:

    npm install

Run the Vercel development server:

    vercel dev

This allows local testing of the serverless API route.

Depending on your local setup, you may need a `.env.local` file for local environment variables:

    POE_API_KEY=your_poe_api_key_here
    POE_MODEL=gpt-4o-mini

Do not commit `.env.local`.

---


## Project Structure

    .
    ├── api/
    │   └── joe-gpt.js
    ├── index.html
    ├── package.json
    ├── package-lock.json
    ├── vercel.json
    ├── README.md
    └── assets/

Project structure may vary depending on images, audio, resume files, or other static assets.

---

## Deployment Summary

### Frontend

Hosted by GitHub Pages:

    https://joebowen.github.io

Update with:

    git add .
    git commit -m "Update site"
    git push origin main

### Backend

Hosted by Vercel:

    https://joebowen-github-io.vercel.app/api/joe-gpt

Update with:

    vercel --prod

### Joe GPT Flow

    GitHub Pages frontend
            ↓
    Vercel /api/joe-gpt backend
            ↓
    Poe API
            ↓
    Joe GPT response
            ↓
    GitHub Pages frontend

---

## Built With

- HTML
- CSS
- JavaScript
- GitHub Pages
- Vercel
- Poe API

