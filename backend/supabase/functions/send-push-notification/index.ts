import { withSupabase } from 'npm:@supabase/server'

export default {
  fetch: withSupabase({ auth: ['user', 'secret'] }, async (req, ctx) => {
    // This endpoint can be triggered by a logged-in user or an admin/system service
    let body;
    try {
      body = await req.json();
    } catch {
      return Response.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const { user_id, title, message, data = {} } = body;
    const targetUserId = user_id || (ctx.authMode === 'user' ? ctx.user?.id : null);

    if (!targetUserId) {
      return Response.json({ error: "Missing target user_id" }, { status: 400 });
    }

    if (!title || !message) {
      return Response.json({ error: "Missing title or message" }, { status: 400 });
    }

    // Retrieve the user's settings to check if they have push notifications enabled
    const { data: settings, error: settingsError } = await ctx.supabaseAdmin
      .from('user_settings')
      .select('push_notifications')
      .eq('user_id', targetUserId)
      .single();

    if (settingsError) {
      return Response.json({ error: `Failed to fetch user settings: ${settingsError.message}` }, 500);
    }

    if (!settings || !settings.push_notifications) {
      return Response.json({ success: false, message: "User has push notifications disabled" }, 200);
    }

    // Dispatch the push notification (e.g., using FCM, APNs, or OneSignal API)
    // For this demonstration, we'll mock the actual delivery request
    console.log(`[send-push-notification] Dispatching push to ${targetUserId}: "${title}" - ${message}`);

    const pushProviderApiKey = Deno.env.get('PUSH_PROVIDER_API_KEY') || 'mock-key';
    if (pushProviderApiKey === 'mock-key') {
      return Response.json({
        success: true,
        message: "Notification dispatched (mock mode)",
        details: { targetUserId, title, message, data }
      });
    }

    // Real third-party API integration can be implemented here...
    return Response.json({
      success: true,
      message: "Notification dispatched successfully",
      details: { targetUserId, title, message }
    });
  }),
}
