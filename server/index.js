import express from 'express';
import cors from 'cors';
import crypto from 'crypto';
import vulnerable from './routes/vulnerable.js';

const app = express();
app.use(cors({ origin: 'http://localhost:5173' }));
app.use(express.json());

app.locals.secret = crypto.randomBytes(16);

app.get('/health', (req, res) => res.json({ ok: true }));

app.post('/reset', (req, res) => {
  app.locals.secret = crypto.randomBytes(16);
  res.json({ ok: true });
});

// dev-only — lets you cheat to verify the attack worked
app.get('/debug/secret', (req, res) => {
  res.json({ secret: app.locals.secret.toString('hex') });
});

app.use('/vulnerable', vulnerable);

app.listen(3001, () => console.log('server on http://localhost:3001'));