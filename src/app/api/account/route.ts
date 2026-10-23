import { attemptsExceeded, claimCustomer, clearAttempts, createCustomer, createSession, currentUser, endSession, findCustomerByEmail, listAddresses, passwordMatches, recordAttempt, renameCustomer, replaceAddresses, type Address } from '@/lib/accounts-server';
import { listOrders } from '@/lib/orders-server';
import { completeReset, requestReset } from '@/lib/password-reset-server';
import { writeAllowed } from '@/lib/request-security';
export const runtime = 'nodejs';
const reply = (data: unknown, status=200) => Response.json(data,{status,headers:{'Cache-Control':'no-store'}});
const ADDRESS_FIELDS = ['id','label','name','phone','line','city','state','pincode'] as const;
const validAddresses = (a: unknown): a is Address[] => Array.isArray(a) && a.length <= 20 && new Set(a.map(v => v?.id)).size === a.length
  && a.every(v => v && ADDRESS_FIELDS.every(k => typeof v[k]==='string' && v[k].length>0 && v[k].length<=250) && /^[1-9][0-9]{5}$/.test(v.pincode)
    && (v.isDefault===undefined || typeof v.isDefault==='boolean'));
/** Keeps only known fields, so unexpected client data is never stored. */
const cleanAddress = (a: Address): Address => ({ ...Object.fromEntries(ADDRESS_FIELDS.map(k => [k, a[k]])) as Omit<Address,'isDefault'>, isDefault: a.isDefault === true });
export async function GET() {
  try {
    const user = await currentUser();
    if (!user) return reply({user:null,orders:[]});
    const [orders, addresses] = await Promise.all([listOrders(user.id), listAddresses(user.id)]);
    return reply({user:{id:user.id,name:user.name,email:user.email},orders,addresses});
  } catch { return reply({error:'Your account could not be loaded.'},500); }
}
export async function POST(request: Request) {
  if (!writeAllowed(request)) return reply({error:'Same-origin local requests only.'},403);
  try {
    const body = await request.json();
    if (body.action === 'logout') { await endSession(); return reply({ok:true}); }
    if (body.action === 'profile' || body.action === 'addresses') {
      const user=await currentUser(); if(!user) return reply({error:'Please sign in.'},401);
      if(body.action==='profile') { if(typeof body.name!=='string'||!body.name.trim()||body.name.length>100) return reply({error:'Enter a valid name.'},400); await renameCustomer(user.id,body.name.trim()); }
      else { const list: unknown = body.addresses; if(!validAddresses(list)) return reply({error:'Check the address details.'},400); await replaceAddresses(user.id,list.map(cleanAddress)); }
      return reply({ok:true});
    }
    if(body.action==='forgot') { const address=typeof body.email==='string'?body.email.trim().toLowerCase():''; if(/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address)&&address.length<=254) await requestReset('customer',address); return reply({ok:true}); }
    if(body.action==='reset') {
      const next=typeof body.password==='string'?body.password:'';
      if(next.length<10||next.length>128) return reply({error:'Choose a password of 10–128 characters.'},400);
      const id=await completeReset('customer',String(body.token||''),next);
      if(!id) return reply({error:'This reset link has expired or was already used. Ask for a new one.'},400);
      await createSession(id); return reply({ok:true});
    }
    if(!['register','login'].includes(body.action)) return reply({error:'Unknown action.'},400);
    const email=typeof body.email==='string'?body.email.trim().toLowerCase():'';
    const password=typeof body.password==='string'?body.password:'';
    if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||email.length>254||password.length<10||password.length>128) return reply({error:'Enter a valid email and a password of 10–128 characters.'},400);
    if(await attemptsExceeded(email,10)) return reply({error:'Too many attempts. Please try again in 15 minutes.'},429);
    await recordAttempt(email,900000);
    const user=await findCustomerByEmail(email);
    let id: string;
    if(body.action==='register') {
      if(user?.passwordHash) return reply({error:'An account already uses this email. Please sign in.'},409);
      if(typeof body.name!=='string'||!body.name.trim()||body.name.length>100) return reply({error:'Enter your name.'},400);
      if(user?.status==='Blocked') return reply({error:'This account is not available. Please contact us.'},403);
      // A customer added in the admin has no password yet; registering with that email claims the record.
      if(user) { if(!(await claimCustomer(user.id,body.name.trim(),password))) return reply({error:'An account already uses this email. Please sign in.'},409); id=user.id; }
      else id=await createCustomer(body.name.trim(),email,password);
    } else if(!user || !user.passwordHash || user.status!=='Active' || !passwordMatches(password,user.passwordHash)) return reply({error:'Email or password is incorrect.'},401);
    else id=user.id;
    await createSession(id); await clearAttempts(email);
    return reply({ok:true});
  } catch (error) { console.error('[api/account]', error); return reply({error:'Unable to save this request. Please try again.'},400); }
}
