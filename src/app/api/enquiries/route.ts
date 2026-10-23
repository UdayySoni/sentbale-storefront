import { randomUUID } from 'node:crypto';
import { db, schema } from '@/db';
import { config } from '@/lib/config';
import { queueMail } from '@/lib/mail-server';
import { setting } from '@/lib/records-server';
import { writeAllowed } from '@/lib/request-security';
export const runtime = 'nodejs';
class Invalid extends Error {}

/** Contact messages and newsletter sign-ups. Both appear in Admin → Customers → Messages. */
export async function POST(request:Request) {
  if(!writeAllowed(request)) return Response.json({error:'Same-origin requests only.'},{status:403});
  try {
    const data=await request.json();
    if(!['contact','newsletter'].includes(data.kind)||typeof data.email!=='string'||data.email.length>254||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) throw new Invalid('Enter a valid email address.');
    if(data.kind==='contact'&&!['name','message','subject'].every(k=>typeof data[k]==='string'&&data[k].trim().length>0&&data[k].length<5000)) throw new Invalid('Please complete your message.');
    const text=(v:unknown)=>typeof v==='string'?v:'';
    const email=data.email.trim().toLowerCase();
    await (await db()).insert(schema.enquiries).values({id:randomUUID(),kind:data.kind,email,name:text(data.name),subject:text(data.subject),message:text(data.message)});
    // Contact messages are also sent to the store's inbox (Business Settings → Email).
    if(data.kind==='contact') {
      const store=await setting('settings');
      if(store.email) queueMail({to:store.email,subject:`Message from ${text(data.name)}: ${text(data.subject)}`.slice(0,200),body:`From: ${text(data.name)} <${email}>\n\n${text(data.message)}\n\nAll messages: ${config.siteUrl}/admin/customers?tab=messages`});
    }
    return Response.json({ok:true});
  } catch(error) {if(!(error instanceof Invalid)) console.error('[api/enquiries]',error); return Response.json({error:error instanceof Invalid?error.message:'Unable to save. Please try again.'},{status:400});}
}
