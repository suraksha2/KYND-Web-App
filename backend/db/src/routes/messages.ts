import { Router } from 'express';
import pool from '../lib/mysql';
import { getSession } from '../http/session';
import { hasAdminAccess } from '../lib/auth';
import { sgtDateTime } from '../lib/sgt';

const router = Router();

// GET /api/messages - Get all conversations for the current user
router.get('/', async (req, res) => {
  try {
    const session = await getSession(req);
    if (!session) {
      return res.status(401).json({ error: 'Authentication required.' });
    }

    let conversations;
    
    if (session.role === 'user') {
      // Get all bookings for this customer that have messages
      const [rows]: any = await pool.query(
        `SELECT DISTINCT 
          b.id as booking_id,
          b.scheduled_at,
          b.status,
          b.items,
          sp.id as provider_id,
          sp.name as provider_name,
          sp.avatar as provider_image,
          (SELECT COUNT(*) FROM messages m 
           WHERE m.booking_id = b.id 
           AND m.sender_type = 'provider' 
           AND m.read_at IS NULL) as unread_count,
          (SELECT m.content FROM messages m 
           WHERE m.booking_id = b.id 
           ORDER BY m.created_at DESC 
           LIMIT 1) as last_message,
          (SELECT m.created_at FROM messages m 
           WHERE m.booking_id = b.id 
           ORDER BY m.created_at DESC 
           LIMIT 1) as last_message_at
         FROM bookings b
         INNER JOIN service_providers sp ON b.provider_id = sp.id
         INNER JOIN messages m ON b.id = m.booking_id
         WHERE b.user_id = ?
         ORDER BY last_message_at DESC`,
        [session.id]
      );
      conversations = rows;
    } else if (session.role === 'provider') {
      // Get all bookings for this provider that have messages
      const [rows]: any = await pool.query(
        `SELECT DISTINCT 
          b.id as booking_id,
          b.scheduled_at,
          b.status,
          b.items,
          u.id as customer_id,
          u.name as customer_name,
          (SELECT COUNT(*) FROM messages m 
           WHERE m.booking_id = b.id 
           AND m.sender_type = 'customer' 
           AND m.read_at IS NULL) as unread_count,
          (SELECT m.content FROM messages m 
           WHERE m.booking_id = b.id 
           ORDER BY m.created_at DESC 
           LIMIT 1) as last_message,
          (SELECT m.created_at FROM messages m 
           WHERE m.booking_id = b.id 
           ORDER BY m.created_at DESC 
           LIMIT 1) as last_message_at
         FROM bookings b
         INNER JOIN users u ON b.user_id = u.id
         INNER JOIN messages m ON b.id = m.booking_id
         WHERE b.provider_id = ?
         ORDER BY last_message_at DESC`,
        [session.id]
      );
      conversations = rows;
    } else {
      return res.status(403).json({ error: 'Only customers and providers can access conversations.' });
    }

    return res.status(200).json({ data: conversations });
  } catch (error) {
    console.error('[GET /api/messages]', error);
    return res.status(500).json({ error: 'Failed to fetch conversations' });
  }
});

// GET /api/messages/unread-count - Get total unread message count for notification
router.get('/unread-count', async (req, res) => {
  try {
    const session = await getSession(req);
    if (!session) {
      return res.status(401).json({ error: 'Authentication required.' });
    }

    let count;
    
    if (session.role === 'user') {
      const [rows]: any = await pool.query(
        `SELECT COUNT(*) as count
         FROM messages m
         INNER JOIN bookings b ON m.booking_id = b.id
         WHERE b.user_id = ?
         AND m.sender_type = 'provider'
         AND m.read_at IS NULL`,
        [session.id]
      );
      count = rows[0].count;
    } else if (session.role === 'provider') {
      const [rows]: any = await pool.query(
        `SELECT COUNT(*) as count
         FROM messages m
         INNER JOIN bookings b ON m.booking_id = b.id
         WHERE b.provider_id = ?
         AND m.sender_type = 'customer'
         AND m.read_at IS NULL`,
        [session.id]
      );
      count = rows[0].count;
    } else {
      return res.status(403).json({ error: 'Only customers and providers can access unread count.' });
    }

    return res.status(200).json({ count });
  } catch (error) {
    console.error('[GET /api/messages/unread-count]', error);
    return res.status(500).json({ error: 'Failed to fetch unread count' });
  }
});

// GET /api/messages/:bookingId - List messages for a booking
router.get('/:bookingId', async (req, res) => {
  try {
    const session = await getSession(req);
    if (!session) {
      return res.status(401).json({ error: 'Authentication required.' });
    }

    const bookingId = req.params.bookingId;

    // Verify the user has access to this booking
    const [bookingRows]: any = await pool.query(
      'SELECT user_id, provider_id FROM bookings WHERE id = ?',
      [bookingId]
    );

    if (!bookingRows || bookingRows.length === 0) {
      return res.status(404).json({ error: 'Booking not found.' });
    }

    const booking = bookingRows[0];

    // Check access: customer can only see their own bookings, providers their assigned ones
    const isCustomer = session.role === 'user' && Number(booking.user_id) === Number(session.id);
    const isProvider = session.role === 'provider' && Number(booking.provider_id) === Number(session.id);
    const isAdmin = hasAdminAccess(session.role);

    if (!isCustomer && !isProvider && !isAdmin) {
      return res.status(403).json({ error: 'You do not have access to this booking.' });
    }

    // Get messages for this booking
    const [messages]: any = await pool.query(
      `SELECT m.*, 
              u.name AS sender_name,
              sp.name AS provider_name
       FROM messages m
       LEFT JOIN users u ON m.sender_type = 'customer' AND m.sender_id = u.id
       LEFT JOIN service_providers sp ON m.sender_type = 'provider' AND m.sender_id = sp.id
       WHERE m.booking_id = ?
       ORDER BY m.created_at ASC`,
      [bookingId]
    );

    // Mark messages as read for the recipient
    if (isCustomer) {
      await pool.query(
        'UPDATE messages SET read_at = ? WHERE booking_id = ? AND sender_type = ? AND read_at IS NULL',
        [sgtDateTime(new Date()), bookingId, 'provider']
      );
    } else if (isProvider) {
      await pool.query(
        'UPDATE messages SET read_at = ? WHERE booking_id = ? AND sender_type = ? AND read_at IS NULL',
        [sgtDateTime(new Date()), bookingId, 'customer']
      );
    }

    return res.status(200).json({ data: messages });
  } catch (error) {
    console.error('[GET /api/messages/:bookingId]', error);
    return res.status(500).json({ error: 'Failed to fetch messages' });
  }
});

// POST /api/messages/:bookingId - Send a message for a booking
router.post('/:bookingId', async (req, res) => {
  try {
    const session = await getSession(req);
    if (!session) {
      return res.status(401).json({ error: 'Authentication required.' });
    }

    const bookingId = req.params.bookingId;
    const { content } = req.body;

    if (!content || typeof content !== 'string' || content.trim().length === 0) {
      return res.status(400).json({ error: 'Message content is required.' });
    }

    if (content.trim().length > 2000) {
      return res.status(400).json({ error: 'Message content must be 2000 characters or less.' });
    }

    // Verify the user has access to this booking
    const [bookingRows]: any = await pool.query(
      'SELECT user_id, provider_id, status FROM bookings WHERE id = ?',
      [bookingId]
    );

    if (!bookingRows || bookingRows.length === 0) {
      return res.status(404).json({ error: 'Booking not found.' });
    }

    const booking = bookingRows[0];

    // Only allow messaging for upcoming or in-progress bookings
    if (booking.status !== 'upcoming' && booking.status !== 'completed') {
      return res.status(400).json({ error: 'Messaging is only available for upcoming or completed bookings.' });
    }

    // Determine sender type and validate access
    let senderType: 'customer' | 'provider';
    let senderId: number;

    if (session.role === 'user' && Number(booking.user_id) === Number(session.id)) {
      senderType = 'customer';
      senderId = session.id;
    } else if (session.role === 'provider' && Number(booking.provider_id) === Number(session.id)) {
      senderType = 'provider';
      senderId = session.id;
    } else if (hasAdminAccess(session.role)) {
      // Admins can send messages on behalf of either party (optional feature)
      return res.status(403).json({ error: 'Admins cannot send messages directly.' });
    } else {
      return res.status(403).json({ error: 'You do not have access to this booking.' });
    }

    // Insert the message
    const [result] = await pool.query(
      `INSERT INTO messages (booking_id, sender_type, sender_id, content, created_at)
       VALUES (?, ?, ?, ?, ?)`,
      [bookingId, senderType, senderId, content.trim(), sgtDateTime(new Date())]
    );

    const messageId = (result as any).insertId;

    // Fetch the created message with sender info
    const [newMessage]: any = await pool.query(
      `SELECT m.*, 
              u.name AS sender_name,
              sp.name AS provider_name
       FROM messages m
       LEFT JOIN users u ON m.sender_type = 'customer' AND m.sender_id = u.id
       LEFT JOIN service_providers sp ON m.sender_type = 'provider' AND m.sender_id = sp.id
       WHERE m.id = ?`,
      [messageId]
    );

    return res.status(201).json({ data: newMessage[0] });
  } catch (error) {
    console.error('[POST /api/messages/:bookingId]', error);
    return res.status(500).json({ error: 'Failed to send message' });
  }
});

// PUT /api/messages/:bookingId/read - Mark messages as read (optional explicit endpoint)
router.put('/:bookingId/read', async (req, res) => {
  try {
    const session = await getSession(req);
    if (!session) {
      return res.status(401).json({ error: 'Authentication required.' });
    }

    const bookingId = req.params.bookingId;

    // Verify the user has access to this booking
    const [bookingRows]: any = await pool.query(
      'SELECT user_id, provider_id FROM bookings WHERE id = ?',
      [bookingId]
    );

    if (!bookingRows || bookingRows.length === 0) {
      return res.status(404).json({ error: 'Booking not found.' });
    }

    const booking = bookingRows[0];

    const isCustomer = session.role === 'user' && Number(booking.user_id) === Number(session.id);
    const isProvider = session.role === 'provider' && Number(booking.provider_id) === Number(session.id);

    if (!isCustomer && !isProvider && !hasAdminAccess(session.role)) {
      return res.status(403).json({ error: 'You do not have access to this booking.' });
    }

    // Mark appropriate messages as read
    if (isCustomer) {
      await pool.query(
        'UPDATE messages SET read_at = ? WHERE booking_id = ? AND sender_type = ? AND read_at IS NULL',
        [sgtDateTime(new Date()), bookingId, 'provider']
      );
    } else if (isProvider) {
      await pool.query(
        'UPDATE messages SET read_at = ? WHERE booking_id = ? AND sender_type = ? AND read_at IS NULL',
        [sgtDateTime(new Date()), bookingId, 'customer']
      );
    }

    return res.status(200).json({ success: true });
  } catch (error) {
    console.error('[PUT /api/messages/:bookingId/read]', error);
    return res.status(500).json({ error: 'Failed to mark messages as read' });
  }
});

export default router;