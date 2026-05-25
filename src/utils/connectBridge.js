// src/utils/connectBridge.js
// Utility for posting system messages to Connect channels from other modules.

import { supabase } from '../lib/supabase'

/**
 * Post a message to a Connect channel by slug.
 * Used by Governance to bridge announcements/policies into #announcements.
 */
export async function postToChannel(channelSlug, body, senderName = 'Bravura System') {
  try {
    // Find channel
    const { data: conv } = await supabase
      .from('chat_conversations')
      .select('id')
      .eq('channel_slug', channelSlug)
      .single()
    if (!conv) return { error: 'Channel not found' }

    const now = new Date().toISOString()
    const { error } = await supabase.from('chat_messages').insert([{
      id:              crypto.randomUUID(),
      conversation_id: conv.id,
      sender_id:       'system',
      body,
      is_deleted:      false,
      created_at:      now,
    }])
    if (error) return { error }

    await supabase.from('chat_conversations')
      .update({ updated_at: now })
      .eq('id', conv.id)

    return { success: true }
  } catch (err) {
    return { error: err.message }
  }
}

/**
 * Format a governance event message for Connect.
 */
export function formatAnnouncementMessage(title, type = 'Announcement', url = null) {
  return `📢 *New ${type}:* ${title}${url ? `\n${url}` : ''}`
}
