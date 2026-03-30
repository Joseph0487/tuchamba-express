import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getDatabase } from 'firebase-admin/database';

const firebaseConfig = {
  credential: cert({
    projectId: process.env.FIREBASE_PROJECT_ID,
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
    privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
  }),
  databaseURL: 'https://vacancy-page-v2-default-rtdb.firebaseio.com',
};

if (!getApps().length) {
  initializeApp(firebaseConfig);
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const { chatId, message, recruiterCode } = req.body;
  if (!chatId || !message || !recruiterCode) return res.status(400).json({ error: 'Faltan datos' });

  try {
    const db = getDatabase();
    const tokenSnap = await db.ref(`fcmTokens/${recruiterCode}`).get();
    if (!tokenSnap.exists()) return res.status(404).json({ error: 'Token no encontrado' });

    const { token } = tokenSnap.val();

    const response = await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        to: token,
        title: '💬 Nuevo mensaje',
        body: message,
        data: { chatId },
        sound: 'default',
        priority: 'high',
      }),
    });

    const result = await response.json();
    return res.status(200).json(result);
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}