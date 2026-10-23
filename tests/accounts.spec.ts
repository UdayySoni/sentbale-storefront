import {test,expect} from '@playwright/test';
const headers={Origin:'http://127.0.0.1:3000'};
test('create account, private orders, trusted prices, sign out and sign in',async({page,browser})=>{
  const email=`customer-${crypto.randomUUID()}@example.com`;
  await page.goto('/account');
  await page.getByRole('button',{name:'Create account',exact:true}).click();
  await page.getByLabel('Your name',{exact:true}).fill('Local Customer');
  await page.getByLabel('Email address',{exact:true}).fill(email);
  await page.getByLabel('Password',{exact:true}).fill('Sample-password-123');
  await page.getByLabel('Confirm password',{exact:true}).fill('Sample-password-123');
  await page.getByRole('button',{name:'Create account',exact:true}).last().click();
  await expect(page.getByRole('heading',{name:'Hello, Local.'})).toBeVisible();
  const payload={requestId:crypto.randomUUID(),items:[{id:'legacy',size:100,quantity:2}],total:1,name:'Local Customer',delivery:'express',address:{line:'Test Street',city:'Delhi',state:'Delhi',pincode:'110016'}};
  const response=await page.request.post('/api/orders',{headers,data:payload});
  expect(response.ok()).toBeTruthy();const {order}=await response.json();expect(order.total).toBe(14197);
  const repeated=await page.request.post('/api/orders',{headers,data:payload});expect((await repeated.json()).order.id).toBe(order.id);
  const invalid=await page.request.post('/api/orders',{headers,data:{...payload,requestId:crypto.randomUUID(),items:[{id:'legacy',size:100,quantity:-1}]}});expect(invalid.status()).toBe(400);
  await page.goto('/account/orders');await expect(page.locator('.order-list>div')).toHaveCount(1);
  await page.locator('.order-detail-link').click();await expect(page.locator('.summary-row.total')).toContainText('14,197');
  const other=await browser.newContext();
  try{
    await other.request.post('http://127.0.0.1:3000/api/account',{headers,data:{action:'register',name:'Other Customer',email:`other-${crypto.randomUUID()}@example.com`,password:'Other-password-123'}});
    expect((await (await other.request.get('http://127.0.0.1:3000/api/account')).json()).orders).toHaveLength(0);
    const otherPage=await other.newPage();await otherPage.goto(`http://127.0.0.1:3000/account/orders/${order.id}`);await expect(otherPage.getByRole('heading',{name:'We couldn’t find this order.'})).toBeVisible();
  }finally{await other.close();}
  await page.goto('/account');await page.getByRole('button',{name:'Sign out',exact:true}).click();await expect(page.getByRole('heading',{name:'Welcome back.'})).toBeVisible();
  expect((await page.request.post('/api/orders',{headers,data:payload})).status()).toBe(401);
  await page.getByLabel('Email address',{exact:true}).fill(email);await page.getByLabel('Password',{exact:true}).fill('Incorrect-password');await page.getByRole('button',{name:'Sign in',exact:true}).last().click();await expect(page.locator('main').getByRole('alert')).toContainText('incorrect');
  await page.getByLabel('Password',{exact:true}).fill('Sample-password-123');await page.getByRole('button',{name:'Sign in',exact:true}).last().click();await expect(page.getByRole('heading',{name:'Hello, Local.'})).toBeVisible();
  await page.getByRole('link',{name:'My orders',exact:true}).click();await expect(page.locator('.order-list>div')).toHaveCount(1);
});

test('small-screen account and bag remain usable',async({page})=>{
  await page.setViewportSize({width:320,height:780});await page.goto('/product/legacy');await page.getByRole('button',{name:'Add to bag',exact:true}).click();await page.keyboard.press('Escape');
  for(const route of ['/cart','/account','/checkout','/shipping','/returns','/privacy','/journal/the-art-of-oud']){
    await page.goto(route);await page.evaluate(()=>document.fonts.ready);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),route).toBe(true);
  }
  await page.goto('/cart');await page.screenshot({path:'.preview/cart-mobile-premium.png',fullPage:true});
  await page.getByRole('button',{name:'Save for later'}).click();await expect(page.getByRole('heading',{name:'Your next signature awaits'})).toBeVisible();
  await page.goto('/account/wishlist');await expect(page.locator('.product-card h3')).toHaveText('Legacy');
  await page.setViewportSize({width:1440,height:1000});await page.goto('/account');await page.screenshot({path:'.preview/account-premium.png',fullPage:true});
});
