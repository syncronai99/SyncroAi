const express = require('express');
const session = require('express-session');
const path = require('path');
const fs = require('fs');

const config = require('./src/config');

const app = express();
const PORT = Number(process.env.PORT) || 3000;

// Trust reverse proxies (Render, Railway, Heroku, nginx, etc.)
app.set('trust proxy', 1);

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use('/uploads/projects', express.static(config.uploadDir));
app.use(express.static(config.publicDir));
app.use(session({
  secret: process.env.SESSION_SECRET || 'syncro-ai-secret-2024',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.COOKIE_SECURE === 'true',
    sameSite: 'lax',
    maxAge: 24 * 60 * 60 * 1000
  }
}));

// Initialize data files
const dataDir = config.dataDir;
const files = {
  settings: { username: 'syncro', password: '2006', siteName: 'Syncro AI', tagline: 'The Future of Business Automation' },
  testimonials: [],
  projects: [],
  inquiries: [],
  services: [
    {
      id: '1',
      title: 'AI Consulting',
      icon: 'brain',
      description: 'Strategic AI advisory and implementation roadmaps tailored to your business. We analyze your operations, identify automation opportunities, and design a comprehensive AI transformation strategy that delivers measurable ROI within 90 days.',
      features: ['AI Readiness Assessment', 'Custom Roadmap Development', 'Technology Stack Selection', 'ROI Projection & KPIs']
    },
    {
      id: '2',
      title: 'Automated Email Reply System',
      icon: 'mail',
      description: 'Intelligent email automation that reads, understands, and responds to customer emails 24/7 with human-like precision. Reduce response times from hours to seconds while maintaining brand voice consistency across every interaction.',
      features: ['Smart Email Parsing', 'Context-Aware Responses', 'Brand Voice Training', 'Escalation Protocols']
    },
    {
      id: '3',
      title: 'Automated WhatsApp Reply System',
      icon: 'message-circle',
      description: 'Deploy AI-powered WhatsApp automation that handles customer queries, processes orders, and manages bookings round-the-clock. Convert 3x more leads with instant, personalized responses that never sleep.',
      features: ['Multi-Language Support', 'Order Processing', 'Appointment Booking', 'Payment Integration']
    },
    {
      id: '4',
      title: 'Workflow & Process Automation',
      icon: 'git-branch',
      description: 'End-to-end business process automation that eliminates repetitive tasks, reduces human error, and dramatically accelerates your operations. From data entry to complex multi-system workflows — we automate it all.',
      features: ['Process Mapping & Analysis', 'Custom Automation Flows', 'System Integration', 'Performance Monitoring']
    },
    {
      id: '5',
      title: '24/7 Customer Support & Booking Agent',
      icon: 'headphones',
      description: 'An always-on AI agent that handles customer support tickets, manages appointments, processes bookings, and resolves issues — all without human intervention. Scale your support capacity infinitely without scaling headcount.',
      features: ['Omnichannel Support', 'Real-Time Booking Management', 'Issue Resolution AI', 'Human Handoff Protocol']
    },
    {
      id: '6',
      title: 'Internal Staff & Knowledge Assistants',
      icon: 'users',
      description: 'Build intelligent internal AI assistants that empower your team with instant access to company knowledge, automate internal workflows, and accelerate onboarding. Transform your team\'s productivity from day one.',
      features: ['Company Knowledge Base AI', 'HR & Onboarding Automation', 'Internal FAQ Bot', 'Policy & Compliance Guidance']
    }
  ]
};

Object.keys(files).forEach(key => {
  const filePath = path.join(dataDir, `${key}.json`);
  if (!fs.existsSync(filePath)) {
    fs.writeFileSync(filePath, JSON.stringify(files[key], null, 2));
  }
});

// Routes
app.use('/api', require('./src/routes/api'));
app.use('/syncro', require('./src/routes/admin'));

// All frontend routes - serve index.html (SPA)
app.get('*', (req, res) => {
  // Check if requesting admin panel
  if (req.path.startsWith('/syncro')) {
    return res.sendFile(path.join(config.publicDir, 'admin.html'));
  }
  res.sendFile(path.join(config.publicDir, 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Syncro AI server running on port ${PORT}`);
  console.log(`Admin panel: /syncro`);
});
