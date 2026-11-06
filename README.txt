Secret Manitto - shared anonymous messaging

This project contains a real Netlify Function backend and uses Netlify Blobs for shared storage. No Supabase account or API keys are required.

IMPORTANT: Deploy via Netlify Git-based continuous deployment so Netlify installs package.json dependencies and builds Functions. A simple static drag-and-drop deploy may NOT deploy the server function. Uploading just index.html is NOT enough.

1. Upload the folder contents to a GitHub repository.
2. In Netlify, Add new project > Import an existing project > GitHub > choose repository > Deploy.
3. Open the generated Netlify URL and create a room. Share the URL and code.
4. Test on two different phones: both names should appear in the participant list, and messages should arrive in the recipient inbox.

Limitations: no push notifications; 10-second inbox polling. No moderation or admin controls. Room codes are shared secrets, not identity verification. Names can be impersonated. Keep personal/sensitive data out. Netlify Blobs is not a transactional database; simultaneous joins may race and messages are intended for small casual groups, not high-reliability messaging.
