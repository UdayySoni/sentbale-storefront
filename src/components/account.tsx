'use client';
import { useProducts } from '@/components/catalog-provider';
import { useEffect, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { ArrowRight, Package, Heart, MapPin, UserRound, LogOut, Eye, EyeOff } from 'lucide-react';
import { money, type Product } from '@/lib/catalog';
import { useStore, type DemoOrder } from '@/lib/store';
import { ForgotPassword } from './password-reset';
import { Photo } from './media-image';

type User = {id:string;name:string;email:string};
export function useAccount() {
  const [user,setUser]=useState<User|null>(null);
  const [orders,setOrders]=useState<DemoOrder[]>([]);
  const [loaded,setLoaded]=useState(false);
  const [error,setError]=useState('');
  async function refresh() { try {const response=await fetch('/api/account',{cache:'no-store'}); if(!response.ok) throw new Error(); const data=await response.json(); setUser(data.user);setOrders(data.orders);} catch {setError('Your account could not be loaded. Please refresh to try again.');} finally {setLoaded(true);} }
  useEffect(()=>{void refresh();},[]);
  return {user,orders,loaded,error,refresh};
}
export async function accountAction(body:unknown) {
  const response=await fetch('/api/account',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
  const data=await response.json(); if(!response.ok) throw new Error(data.error||'Please try again.'); return data;
}
export default function Account({store,path,card}:{store:ReturnType<typeof useStore>;path:string;card:(p:Product)=>ReactNode}) {
  const products = useProducts();
  const {user,orders,loaded,error:loadError,refresh}=useAccount();
  const [signup,setSignup]=useState(false),[forgot,setForgot]=useState(false),[visible,setVisible]=useState(false),[busy,setBusy]=useState(false),[message,setMessage]=useState('');
  const tab=path.split('/')[2]||'overview';
  async function submit(event:React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); if(busy) return; const fields=new FormData(event.currentTarget); setBusy(true);setMessage('');
    try {
      if(signup && fields.get('password')!==fields.get('confirm')) throw new Error('Your passwords do not match.');
      await accountAction({action:user?'profile':signup?'register':'login',name:fields.get('name'),email:fields.get('email'),password:fields.get('password')});
      await refresh();setMessage(user?'Your profile has been updated.':'');
      if(!user && new URLSearchParams(window.location.search).get('next')==='checkout') window.location.assign('/checkout');
    } catch(error) {setMessage(error instanceof Error?error.message:'Please try again.');} finally {setBusy(false);}
  }
  if(!loaded) return <section className="section account-loading" aria-live="polite">Opening your personal scent wardrobe…</section>;
  if(!user && tab!=='wishlist') return <section className="auth-page"><div className="auth-art"><Photo slot="account.hero" src="/images/hero.png" alt="Amber perfume in a sculptural landscape"/><div><h1>Your story<br/><em>continues.</em></h1><p><br/></p></div></div><div className="auth-form"><h2>{signup?'Create account':'Welcome back.'}</h2><div className="auth-toggle"><button className={!signup?'selected':''} onClick={()=>{setSignup(false);setForgot(false);setMessage('');}}>Sign in</button><button className={signup?'selected':''} onClick={()=>{setSignup(true);setForgot(false);setMessage('');}}>Create account</button></div>{forgot&&!signup?<ForgotPassword back={()=>setForgot(false)}/>:<form onSubmit={submit}>{signup&&<label className="field">Your name<input name="name" autoComplete="name" required maxLength={100}/></label>}<label className="field">Email address<input name="email" type="email" autoComplete="email" required maxLength={254}/></label><label className="field">Password<span className="password-input"><input name="password" type={visible?'text':'password'} autoComplete={signup?'new-password':'current-password'} minLength={10} maxLength={128} required/><button type="button" aria-label={visible?'Hide password':'Show password'} onClick={()=>setVisible(!visible)}>{visible?<EyeOff size={19}/>:<Eye size={19}/>}</button></span></label>{signup&&<><p className="field-hint">At least 10 characters.</p><label className="field">Confirm password<input name="confirm" type={visible?'text':'password'} autoComplete="new-password" required minLength={10}/></label></>}<button className="button" disabled={busy}>{busy?'One moment…':signup?'Create account':'Sign in'}<ArrowRight size={17}/></button>{(message||loadError)&&<p className="form-message" role="alert">{message||loadError}</p>}{!signup&&<button type="button" className="text-link" onClick={()=>{setForgot(true);setMessage('');}}>Forgot your password?</button>}</form>}</div></section>;
  return <section className="section account-page"><h1>{user?`Hello, ${user.name.split(' ')[0]}.`:'Your favourites.'}</h1><div className="account-layout"><nav aria-label="Account navigation">{[['overview','Overview',UserRound],['orders','My orders',Package],['wishlist','Favourites',Heart],['addresses','Addresses',MapPin],['profile','Profile',UserRound]].map(([id,label,Icon])=>{const I=Icon as typeof UserRound;return <Link className={tab===id?'active':''} key={id as string} href={id==='overview'?'/account':`/account/${id}`}><I size={18}/>{label as string}</Link>;})}{user&&<button disabled={busy} onClick={async()=>{setBusy(true);try{await accountAction({action:'logout'});await refresh();}catch{setMessage('Unable to sign out. Please try again.');}finally{setBusy(false);}}}><LogOut size={18}/>Sign out</button>}</nav><div className="account-content">{tab==='wishlist'?<><h2>Your favourites</h2>{store.wishlist.length?<div className="product-grid two">{products.filter(p=>store.wishlist.includes(p.id)).map(card)}</div>:<div className="empty-state"><Heart size={36}/><h2>No favourites yet.</h2><p>Tap the heart on a fragrance to save it.</p><Link className="button" href="/shop">Find your signature <ArrowRight size={16}/></Link></div>}</>:tab==='profile'?<><h2>Your personal details</h2><form className="profile-form" onSubmit={submit}><label className="field">Your name<input name="name" defaultValue={user?.name} required maxLength={100}/></label><label className="field">Email address<input type="email" value={user?.email||''} readOnly/></label><button className="button" disabled={busy}>{busy?'Saving…':'Save profile'}</button></form></>:<>{tab==='overview'&&<div className="account-stats"><div><Package/><strong>{orders.length}</strong><span>Test orders</span></div><div><Heart/><strong>{store.wishlist.length}</strong><span>Saved fragrances</span></div></div>}<div className="section-heading"><h2>{tab==='overview'?'Your latest discoveries':'Your orders'}</h2><Link className="text-link" href="/shop">Discover more <ArrowRight size={16}/></Link></div>{orders.length?<div className="order-list">{(tab==='overview'?orders.slice(0,3):orders).map(o=><div key={o.id}><Package size={24}/><div><Link className="order-detail-link" href={`/account/orders/${o.id}`}>{o.id}</Link><p>{new Date(o.date).toLocaleDateString('en-IN')} · {o.items.reduce((s,l)=>s+l.quantity,0)} items</p></div><span className="status-pill">Test confirmed</span><strong>{money(o.total)}</strong></div>)}</div>:<div className="empty-state"><Package size={38} strokeWidth={1}/><h2>No orders yet.</h2><Link className="button" href="/shop">Explore fragrances <ArrowRight size={16}/></Link></div>}</>}{(message||loadError)&&<p role="status" className="form-message">{message||loadError}</p>}</div></div></section>;
}
