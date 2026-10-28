import {chromium, expect} from '@playwright/test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile, mkdir} from 'node:fs/promises';
import {resolve, extname} from 'node:path';
const root=resolve('.');
const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.ttf':'font/ttf','.vcf':'text/vcard'};
const server=createServer(async(req,res)=>{
  const url=new URL(req.url,'http://localhost');
  const path=resolve(root,'.'+url.pathname+(url.pathname.endsWith('/')?'index.html':''));
  try{if(!path.startsWith(root+'/'))throw new Error();const data=await readFile(path);res.writeHead(200,{'Content-Type':mime[extname(path)]||'application/octet-stream'});res.end(data);}catch{res.writeHead(404);res.end();}
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const origin=`http://127.0.0.1:${server.address().port}`;
let browser;
const errors=[];
await mkdir('artifacts',{recursive:true});
try{
  browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH,args:['--no-sandbox','--disable-dev-shm-usage']});
  const context=await browser.newContext();
  await context.route('https://**/*',r=>r.abort());
  const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
  for(const [width,height] of [[320,568],[360,800],[390,844],[430,932],[844,390],[1280,900]]){
    await page.setViewportSize({width,height});await page.goto(origin+'/');await page.evaluate(()=>document.fonts.ready);
    await expect(page.locator('h1')).toContainText('A good ride.');
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`overflow at ${width}`);
    for(const link of await page.locator('a').all()){
      if(await link.getAttribute('class')==='skip')continue;
      const box=await link.boundingBox();assert.ok(box.height>=44,`target height ${box.height} at ${width}: ${await link.textContent()}`);
    }
    await page.locator('.profile-card').scrollIntoViewIfNeeded();await page.waitForTimeout(800);
    assert.equal(await page.locator('.profile-card').evaluate(el=>getComputedStyle(el).transform),'none');
    await page.screenshot({path:`artifacts/landing-${width}.png`,fullPage:true});
  }
  // One reveal per session; scrolling back and repeat navigation remain stable.
  await page.goto(origin+'/');await page.locator('.profile-card').scrollIntoViewIfNeeded();await expect(page.locator('.reveal')).toHaveCount(0);
  await page.locator('#connect').scrollIntoViewIfNeeded();await page.evaluate(()=>scrollTo(0,0));await expect(page.locator('.reveal')).toHaveCount(0);
  await page.reload();await expect(page.locator('.reveal')).toHaveCount(0);
  // Keyboard navigation begins with skip link and reaches core actions.
  await page.keyboard.press('Tab');await expect(page.locator('.skip')).toBeFocused();await page.keyboard.press('Enter');
  await page.keyboard.press('Tab');await expect(page.locator('.primary')).toBeFocused();
  assert.equal(await page.locator('main').count(),1);assert.equal(await page.locator('h1').count(),1);
  assert.equal(await page.locator('a[href="tel:+13016398001"]').count(),1);
  assert.equal(await page.locator('a[href="mailto:mbrull@marcolin.com"]').count(),1);
  await expect(page.getByRole('link',{name:/Dealer portal/})).toHaveAttribute('href','https://mymarcolin.marcolin.com/');
  await expect(page.getByRole('link',{name:/Dealer portal/})).toContainText('account required');
  await expect(page.getByRole('link',{name:/The eyewear/})).toHaveAttribute('href','https://www.marcolin.com/en/brand/harley-davidson-eyewear/');
  const vcf=await (await context.request.get(origin+'/mike-brull.vcf')).text();assert.match(vcf,/FN:Mike Brull/);assert.match(vcf,/TEL;TYPE=WORK,VOICE:\+13016398001/);
  await page.goto(origin+'/?entry=card#connect');
  for(const href of await page.locator('[data-finder]').evaluateAll(links=>links.map(a=>a.href)))assert.equal(new URL(href).searchParams.get('entry'),'card');
  console.log('PASS landing: six viewports, 44px targets, overflow, semantics, keyboard, contact download, official links, attribution, repeat navigation.');
  for(const mode of ['reduced','save-data','low-core','no-js','blocked-js','blocked-font']){
    const ctx=await browser.newContext({viewport:{width:390,height:844},reducedMotion:mode==='reduced'?'reduce':'no-preference',javaScriptEnabled:mode!=='no-js'});
    if(mode==='save-data')await ctx.addInitScript(()=>Object.defineProperty(navigator,'connection',{value:{saveData:true}}));
    if(mode==='low-core')await ctx.addInitScript(()=>Object.defineProperty(navigator,'hardwareConcurrency',{value:2}));
    if(mode==='blocked-js')await ctx.route('**/hub.js',r=>r.abort());
    if(mode==='blocked-font')await ctx.route('**/*.ttf',r=>r.abort());
    const p=await ctx.newPage();p.on('pageerror',e=>errors.push(e.message));await p.goto(origin+'/');await p.locator('.profile-card').scrollIntoViewIfNeeded();await p.waitForTimeout(800);
    await expect(p.locator('.primary')).toBeVisible();await expect(p.locator('.reveal')).toHaveCount(0);
    assert.equal(await p.locator('.profile-card').evaluate(el=>getComputedStyle(el).transform),'none');
    assert.ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await ctx.close();
  }
  // Changing motion preference during a reveal settles immediately.
  const motion=await browser.newContext({viewport:{width:1280,height:900}});const mp=await motion.newPage();await mp.goto(origin+'/');await mp.emulateMedia({reducedMotion:'reduce'});await expect(mp.locator('.reveal')).toHaveCount(0);await motion.close();
  console.log('PASS fallback: no/blocked JavaScript, blocked font, reduced motion, live preference change, save-data and low-core devices.');
  // A cold-load laboratory sample, not field performance or a physical device test.
  const perf=await browser.newContext({viewport:{width:390,height:844},isMobile:true,deviceScaleFactor:1});
  const pp=await perf.newPage();const cdp=await perf.newCDPSession(pp);
  await cdp.send('Network.enable');await cdp.send('Network.emulateNetworkConditions',{offline:false,latency:150,downloadThroughput:200000,uploadThroughput:93750});await cdp.send('Emulation.setCPUThrottlingRate',{rate:4});
  await pp.addInitScript(()=>{window.__metrics={cls:0,lcp:0};new PerformanceObserver(list=>{for(const e of list.getEntries())if(!e.hadRecentInput)__metrics.cls+=e.value;}).observe({type:'layout-shift',buffered:true});new PerformanceObserver(list=>{for(const e of list.getEntries())__metrics.lcp=e.startTime;}).observe({type:'largest-contentful-paint',buffered:true});});
  await pp.goto(origin+'/');await pp.evaluate(()=>document.fonts.ready);await pp.waitForTimeout(1200);
  const metrics=await pp.evaluate(()=>({...__metrics,requests:performance.getEntriesByType('resource').map(r=>({name:new URL(r.name).pathname,bytes:r.transferSize})),domContentLoaded:performance.getEntriesByType('navigation')[0].domContentLoadedEventEnd}));
  assert.ok(metrics.cls<.1,`CLS ${metrics.cls}`);console.log('LAB mobile 4x CPU, 150ms RTT, 1.6Mbps:',JSON.stringify(metrics));
  await perf.close();assert.deepEqual(errors,[]);
  console.log('All landing browser checks passed.');
}catch(error){console.error(error);process.exitCode=1;}finally{await browser?.close();await new Promise(r=>server.close(r));}
