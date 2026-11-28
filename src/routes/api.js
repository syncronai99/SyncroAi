const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const config = require('../config');

const dataDir = config.dataDir;
const readData = (file) => JSON.parse(fs.readFileSync(path.join(dataDir, `${file}.json`), 'utf8'));
const writeData = (file, data) => fs.writeFileSync(path.join(dataDir, `${file}.json`), JSON.stringify(data, null, 2));

// Public API endpoints
router.get('/testimonials', (req, res) => {
  const testimonials = readData('testimonials');
  res.json(testimonials.filter(t => t.approved !== false));
});

router.get('/projects', (req, res) => {
  const projects = readData('projects');
  res.json(projects.filter(p => p.published !== false));
});

router.get('/services', (req, res) => {
  res.json(readData('services'));
});

router.get('/settings/public', (req, res) => {
  const settings = readData('settings');
  res.json({ siteName: settings.siteName, tagline: settings.tagline });
});

// Contact form submission
router.post('/inquiry', (req, res) => {
  const { name, email, phone, company, service, message } = req.body;
  if (!name || !email || !message) {
    return res.status(400).json({ error: 'Name, email and message are required' });
  }
  const inquiries = readData('inquiries');
  inquiries.push({
    id: uuidv4(),
    name, email, phone: phone || '', company: company || '',
    service: service || '', message,
    date: new Date().toISOString(),
    read: false
  });
  writeData('inquiries', inquiries);
  res.json({ success: true, message: 'Inquiry submitted successfully' });
});

// Auth check
router.get('/auth/check', (req, res) => {
  res.json({ authenticated: !!req.session.admin });
});

// Admin login
router.post('/auth/login', (req, res) => {
  const { username, password } = req.body;
  const settings = readData('settings');
  if (username === settings.username && password === settings.password) {
    req.session.admin = true;
    res.json({ success: true });
  } else {
    res.status(401).json({ error: 'Invalid credentials' });
  }
});

// Admin logout
router.post('/auth/logout', (req, res) => {
  req.session.destroy();
  res.json({ success: true });
});

// Admin middleware
const adminAuth = (req, res, next) => {
  if (!req.session.admin) return res.status(401).json({ error: 'Unauthorized' });
  next();
};

// Admin - Testimonials
router.get('/admin/testimonials', adminAuth, (req, res) => res.json(readData('testimonials')));
router.post('/admin/testimonials', adminAuth, (req, res) => {
  const testimonials = readData('testimonials');
  const item = { id: uuidv4(), ...req.body, date: new Date().toISOString(), approved: true };
  testimonials.push(item);
  writeData('testimonials', testimonials);
  res.json({ success: true, item });
});
router.put('/admin/testimonials/:id', adminAuth, (req, res) => {
  let testimonials = readData('testimonials');
  const idx = testimonials.findIndex(t => t.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Not found' });
  testimonials[idx] = { ...testimonials[idx], ...req.body };
  writeData('testimonials', testimonials);
  res.json({ success: true });
});
router.delete('/admin/testimonials/:id', adminAuth, (req, res) => {
  let testimonials = readData('testimonials').filter(t => t.id !== req.params.id);
  writeData('testimonials', testimonials);
  res.json({ success: true });
});

// Admin - Projects
const multer = require('multer');
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, config.uploadDir),
  filename: (req, file, cb) => {
    const safeName = path.basename(file.originalname).replace(/[^a-zA-Z0-9._-]/g, '_');
    cb(null, `${uuidv4()}-${safeName}`);
  }
});
const upload = multer({ storage, limits: { fileSize: 10 * 1024 * 1024 } });

router.get('/admin/projects', adminAuth, (req, res) => res.json(readData('projects')));
router.post('/admin/projects', adminAuth, upload.single('image'), (req, res) => {
  const projects = readData('projects');
  const item = {
    id: uuidv4(),
    title: req.body.title,
    client: req.body.client,
    category: req.body.category,
    description: req.body.description,
    results: req.body.results,
    technologies: req.body.technologies ? req.body.technologies.split(',').map(t => t.trim()) : [],
    image: req.file ? `/uploads/projects/${req.file.filename}` : req.body.imageUrl || '',
    date: req.body.date || new Date().toISOString(),
    published: true
  };
  projects.push(item);
  writeData('projects', projects);
  res.json({ success: true, item });
});
router.put('/admin/projects/:id', adminAuth, upload.single('image'), (req, res) => {
  let projects = readData('projects');
  const idx = projects.findIndex(p => p.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Not found' });
  const updated = { ...projects[idx], ...req.body };
  if (req.file) updated.image = `/uploads/projects/${req.file.filename}`;
  if (req.body.technologies) updated.technologies = req.body.technologies.split(',').map(t => t.trim());
  projects[idx] = updated;
  writeData('projects', projects);
  res.json({ success: true });
});
router.delete('/admin/projects/:id', adminAuth, (req, res) => {
  let projects = readData('projects').filter(p => p.id !== req.params.id);
  writeData('projects', projects);
  res.json({ success: true });
});

// Admin - Inquiries
router.get('/admin/inquiries', adminAuth, (req, res) => res.json(readData('inquiries')));
router.put('/admin/inquiries/:id/read', adminAuth, (req, res) => {
  let inquiries = readData('inquiries');
  const idx = inquiries.findIndex(i => i.id === req.params.id);
  if (idx !== -1) inquiries[idx].read = true;
  writeData('inquiries', inquiries);
  res.json({ success: true });
});
router.delete('/admin/inquiries/:id', adminAuth, (req, res) => {
  let inquiries = readData('inquiries').filter(i => i.id !== req.params.id);
  writeData('inquiries', inquiries);
  res.json({ success: true });
});

// Admin - Services
router.get('/admin/services', adminAuth, (req, res) => res.json(readData('services')));
router.put('/admin/services/:id', adminAuth, (req, res) => {
  let services = readData('services');
  const idx = services.findIndex(s => s.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Not found' });
  services[idx] = { ...services[idx], ...req.body };
  writeData('services', services);
  res.json({ success: true });
});
router.post('/admin/services', adminAuth, (req, res) => {
  const services = readData('services');
  const item = { id: uuidv4(), ...req.body };
  services.push(item);
  writeData('services', services);
  res.json({ success: true, item });
});
router.delete('/admin/services/:id', adminAuth, (req, res) => {
  let services = readData('services').filter(s => s.id !== req.params.id);
  writeData('services', services);
  res.json({ success: true });
});

// Admin - Settings
router.get('/admin/settings', adminAuth, (req, res) => res.json(readData('settings')));
router.put('/admin/settings', adminAuth, (req, res) => {
  const settings = readData('settings');
  const { username, password, newPassword, siteName, tagline } = req.body;
  if (newPassword) {
    if (password !== settings.password) return res.status(401).json({ error: 'Current password incorrect' });
    settings.password = newPassword;
  }
  if (username) settings.username = username;
  if (siteName) settings.siteName = siteName;
  if (tagline) settings.tagline = tagline;
  writeData('settings', settings);
  res.json({ success: true });
});

module.exports = router;
