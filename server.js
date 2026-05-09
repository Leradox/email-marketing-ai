require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { Resend } = require('resend');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

const resend = new Resend(process.env.RESEND_API_KEY);
const GROQ_API_KEY = process.env.GROQ_API_KEY;

// ─── Generare email cu Groq AI ──────────────────────────────────────────────
app.post('/api/generate', async (req, res) => {
  const { topic, tone, language } = req.body;

  if (!topic) return res.status(400).json({ error: 'Lipsește subiectul.' });

  const prompt = `Generează un email de marketing profesional în limba ${language || 'română'}.
Subiect: ${topic}
Ton: ${tone || 'profesional'}

Răspunde DOAR cu un JSON valid (fără markdown, fără backticks, fără text în plus), în formatul exact:
{"subject":"linia de subiect a emailului","body":"corpul emailului cu paragrafe separate prin \\n\\n"}`;

  try {
    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${GROQ_API_KEY}`
      },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.7,
        max_tokens: 1024
      })
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error?.message || 'Eroare Groq API');
    }

    let raw = data.choices?.[0]?.message?.content || '';
    raw = raw.replace(/```json/g, '').replace(/```/g, '').trim();

    const parsed = JSON.parse(raw);
    res.json(parsed);

  } catch (err) {
    console.error('Eroare Groq:', err.message);
    res.status(500).json({ error: 'Eroare la generarea emailului: ' + err.message });
  }
});

// ─── Trimitere email prin Resend ────────────────────────────────────────────
app.post('/api/send', async (req, res) => {
  const { to, subject, body, senderName } = req.body;

  if (!to || !subject || !body) {
    return res.status(400).json({ error: 'Câmpuri lipsă: to, subject, body.' });
  }

  const htmlBody = body
    .split('\n\n')
    .map(p => `<p style="margin:0 0 16px 0;">${p.replace(/\n/g, '<br>')}</p>`)
    .join('');

  try {
    const result = await resend.emails.send({
      from: 'onboarding@resend.dev',
      to: [to],
      subject: subject,
      html: `
        <div style="font-family:'Segoe UI',Arial,sans-serif;max-width:600px;margin:0 auto;padding:40px 24px;background:#fff;">
          <div style="border-left:4px solid #6366f1;padding-left:20px;margin-bottom:32px;">
            <h1 style="margin:0;font-size:22px;color:#1e1b4b;">${subject}</h1>
            ${senderName ? `<p style="margin:4px 0 0;color:#6b7280;font-size:14px;">De la: ${senderName}</p>` : ''}
          </div>
          <div style="color:#374151;font-size:16px;line-height:1.7;">
            ${htmlBody}
          </div>
          <hr style="margin:40px 0;border:none;border-top:1px solid #e5e7eb;">
          <p style="color:#9ca3af;font-size:12px;text-align:center;">
            Trimis prin MailCraft AI
          </p>
        </div>
      `,
    });

    res.json({ success: true, id: result.data?.id });
  } catch (err) {
    console.error('Eroare Resend:', err.message);
    res.status(500).json({ error: 'Eroare la trimitere: ' + err.message });
  }
});

// ─── Pornire server ─────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`✅ Server pornit pe http://localhost:${PORT}`);
});
