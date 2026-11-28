# Syncro AI — Website Documentation

## 🚀 Quick Start

**Double-click `START-SERVER.bat`** to launch the website.

Then open your browser to: **http://localhost:3000**

---

## 📌 Important URLs

| URL | Description |
|-----|-------------|
| `http://localhost:3000` | Main website (public) |
| `http://localhost:3000/syncro` | Admin panel |

---

## 🔐 Admin Panel

- **URL:** `http://localhost:3000/syncro`
- **Username:** `syncro`
- **Password:** `2006`

---

## 📁 Project Structure

```
Syncro Ai/
├── server.js              ← Main server entry point
├── START-SERVER.bat       ← Easy startup script
├── package.json
├── data/                  ← JSON database files
│   ├── settings.json      ← Site config & credentials
│   ├── services.json      ← Services list
│   ├── projects.json      ← Case studies
│   ├── testimonials.json  ← Client reviews
│   └── inquiries.json     ← Contact form submissions
├── public/
│   ├── index.html         ← Main website (SPA)
│   ├── admin.html         ← Admin panel
│   └── uploads/
│       ├── logo/          ← Logo files
│       └── projects/      ← Uploaded project images
└── src/
    └── routes/
        ├── api.js         ← All API endpoints
        └── admin.js       ← Admin panel routing
```

---

## 🎨 Color Palette

- **Black:** `#000000` / `#050a0e` (blue-tinted surfaces)
- **White:** `#ffffff`
- **Light Blue:** `#7dd3fc`
- **Light Blue Bright:** `#bae6fd`
- **Light Blue Mid:** `#38bdf8`
- **Deep Blue accent:** `#0c4a6e`

---

## ✨ Features

### Public Website
- Custom black animated cursor with hover effects
- Smooth scroll animations (reveal on scroll)
- Ripple effect on click interactions
- Randomly shuffled testimonials carousel
- Randomly shuffled project gallery
- Services display with animated cards
- Vision & Mission section
- Contact form with real database storage
- 404 page for invalid routes
- Fully responsive (mobile, tablet, desktop)
- Animated loading screen
- Noise texture overlay

### Admin Panel (`/syncro`)
- Password-protected login
- **Dashboard:** Stats overview + recent inquiries
- **Projects:** Add/delete with image upload
- **Testimonials:** Add/toggle visibility/delete with star ratings
- **Services:** Full CRUD for all 6 services
- **Inquiries:** View, read, reply, delete contact form submissions
- **Settings:** Update site name, tagline, username & password

---

## 🛠 Changing Credentials

In the Admin Panel → Settings → Change Credentials:
1. Enter current password
2. Enter new username and/or new password
3. Click "Update Credentials"

Or manually edit `data/settings.json`.
