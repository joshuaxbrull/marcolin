import { chromium, expect } from "@playwright/test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFile, mkdir } from "node:fs/promises";
import { resolve, extname } from "node:path";
const root = resolve(".");
const fixture = JSON.parse(await readFile("harleydavidson/data/locations.json", "utf8"));
let publicRows = structuredClone(fixture), savedRows = structuredClone(fixture), sha = "a".repeat(40), revision = 0, putCount = 0, publishChecks = 0, routeCount = 0, routeDelay = 0, tableCount = 0;
const errors = [];
let legacyWorker = false, networkUnavailable = false;
const mime={".html":"text/html",".js":"application/javascript",".css":"text/css",".svg":"image/svg+xml",".png":"image/png",".ttf":"font/ttf"};
const json=(res,body,status=200)=>{res.writeHead(status,{"Content-Type":"application/json","Cache-Control":"no-store"});res.end(JSON.stringify(body));};
async function body(req){let text="";for await(const part of req)text+=part;return JSON.parse(text);}
const serve = async(req,res,manager=false)=>{
  // Browser offline emulation does not cover every Worker-initiated request.
  if(networkUnavailable) { req.destroy(); return; }
  const url=new URL(req.url,"http://localhost");
  if(url.pathname==="/worker-test.html") { res.writeHead(200,{"Content-Type":"text/html"});res.end("<!doctype html><title>Service worker migration test</title>");return; }
  if(legacyWorker && url.pathname==="/harleydavidson/sw.js") {
    res.writeHead(200,{"Content-Type":"application/javascript","Cache-Control":"no-store"});
    res.end(`self.addEventListener('install',e=>e.waitUntil((async()=>{const cache=await caches.open('hd-eyewear-shell-v4');await cache.put(self.registration.scope,new Response('<!doctype html><h1>Old cached locator</h1>',{headers:{'Content-Type':'text/html'}}));await caches.open('worldcup-unrelated');await self.skipWaiting();})()));self.addEventListener('activate',e=>e.waitUntil(self.clients.claim()));self.addEventListener('fetch',e=>{if(e.request.mode==='navigate')e.respondWith(caches.open('hd-eyewear-shell-v4').then(c=>c.match(self.registration.scope)));});`);
    return;
  }
  if(manager&&url.pathname==="/api/session")return json(res,{login:"manager-fixture",csrf:"fixture",expires:Date.now()+28800000});
  if(manager&&url.pathname==="/api/locations"){
    if(req.method==="PUT"){
      const input=await body(req);putCount++;
      if(input.baseSha!==sha)return json(res,{error:"Another manager changed the directory."},409);
      savedRows=input.records;sha=(++revision).toString(16).padStart(40,"0");publishChecks=0;
      return json(res,{sha,commitSha:"b".repeat(40)});
    }
    return json(res,{records:savedRows,sha});
  }
  if(manager&&url.pathname==="/api/publication"){
    publishChecks++;
    if(publishChecks<2)return json(res,{status:"publishing"});
    publicRows=structuredClone(savedRows);return json(res,{status:"live"});
  }
  if(url.pathname==="/harleydavidson/data/locations.json")return json(res,publicRows);
  try{
    let path=resolve(root,manager?"manager/dist":".","."+decodeURIComponent(url.pathname)+(url.pathname.endsWith("/")?"index.html":""));
    if(!path.startsWith(root+"/"))throw new Error();
    let content=await readFile(path);
    if(url.pathname==="/harleydavidson/js/main.js")content=Buffer.concat([content,Buffer.from("\nglobalThis.__locator={state,map,refreshDirectory,requestUserLocation,stopSharingLocation,drawRouteTo,refreshDriving,get routeLayer(){return routeLayer}};")]);
    res.writeHead(200,{"Content-Type":mime[extname(path)]||"application/octet-stream","Cache-Control":"no-cache"});res.end(content);
  }catch{res.writeHead(404);res.end();}
};
const server=createServer((req,res)=>serve(req,res).catch(e=>{console.error(e);res.end();}));
const managerServer=createServer((req,res)=>serve(req,res,true).catch(e=>{console.error(e);res.end();}));
await Promise.all([new Promise(r=>server.listen(0,"127.0.0.1",r)),new Promise(r=>managerServer.listen(0,"127.0.0.1",r))]);
const locatorOrigin=`http://127.0.0.1:${server.address().port}`,managerOrigin=`http://127.0.0.1:${managerServer.address().port}`;
let browser;
async function prepare(context){
  await context.route("https://**/*",async route=>{
    const url=new URL(route.request().url());
    if(url.hostname==="photon.komoot.io"){
      if(url.pathname==="/reverse")return route.fulfill({json:{features:[{properties:{city:"Ocean City",state:"Maryland"}}]}});
      const point=(name,type,lng,lat,city=name)=>({type:"Feature",geometry:{type:"Point",coordinates:[lng,lat]},properties:{name,city,state:"Maryland",countrycode:"US",osm_value:type}});
      return route.fulfill({json:{features:[point("Ocean City Seafood","restaurant",-77.0035,38.9992,"Silver Spring"),point("Ocean City","city",-75.0874,38.3315)]}});
    }
    if(url.hostname==="router.project-osrm.org"){
      if(url.pathname.includes("/table/")){
        tableCount++;const count=url.searchParams.get("destinations").split(";").length;
        return route.fulfill({json:{durations:[Array.from({length:count},(_,i)=>600+i*60)],distances:[Array.from({length:count},(_,i)=>10000+i*100)]}});
      }
      routeCount++;const pairs=url.pathname.split("/driving/")[1].split(";").map(p=>p.split(",").map(Number));
      const delay=routeDelay;routeDelay=0;if(delay)await new Promise(r=>setTimeout(r,delay));
      return route.fulfill({json:{routes:[{duration:600,distance:10000,geometry:{type:"LineString",coordinates:pairs}}]}}).catch(()=>{});
    }
    if(url.hostname==="cdn.jsdelivr.net")return route.fulfill({status:200,contentType:url.pathname.endsWith(".css")?"text/css":"application/javascript",body:""});
    return route.abort();
  });
  await context.addInitScript(()=>{
    window.__geo={pending:[],delay:false,denied:false};
    Object.defineProperty(navigator,"geolocation",{value:{getCurrentPosition(success,error){if(window.__geo.delay){window.__geo.pending.push(success);return;}if(window.__geo.denied)error({code:1});else success({coords:{latitude:38.3315,longitude:-75.0874}});}}});
    Object.defineProperty(navigator,"permissions",{value:{query:async()=>({state:"prompt",onchange:null})}});
    // Exercise generation guards even when the transport ignores cancellation.
    const original=window.fetch.bind(window);window.fetch=(url,options={})=>original(url,String(url).includes("router.project-osrm.org")?{...options,signal:undefined}:options);
  });
}
async function ready(page){page.on("pageerror",e=>errors.push(e.message));await page.goto(locatorOrigin+"/harleydavidson/");await page.waitForFunction(()=>Boolean(window.__locator));await expect(page.locator(".location-card")).toHaveCount(publicRows.length);}
async function pollLive(page){await page.clock.fastForward(11000);await expect(page.locator("#status")).toContainText("Live —");}
await mkdir("artifacts",{recursive:true});
try{
  browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||process.argv.find(arg=>arg.startsWith("--chromium="))?.slice(11),args:["--no-sandbox","--disable-dev-shm-usage"]});
  if(!process.argv.includes("--sw-only")) {
  const context=await browser.newContext({viewport:{width:1280,height:850},serviceWorkers:"block"});await prepare(context);
  const page=await context.newPage();await ready(page);
  await page.locator("#search").fill("Ocean City MD");await page.locator("#search").press("Enter");
  await expect(page.locator("#search-status")).toHaveText("Near Ocean City, MD");
  assert.equal(await page.evaluate(()=>__locator.state.searchCenter.lng),-75.0874);assert.equal(routeCount,0);assert.equal(tableCount,0);
  await page.locator('.location-card[data-id="2"]').click();
  assert.equal(await page.evaluate(()=>__locator.map.getZoom()),14);await expect(page.locator(".drive-time")).toHaveCount(0);
  await page.locator("#locate-btn").click();await expect.poll(() => page.evaluate(() => Boolean(__locator.routeLayer && __locator.map.hasLayer(__locator.routeLayer)))).toBe(true);assert.ok(routeCount>0);
  await page.locator("#locate-btn").click();await page.locator('[data-locate-action="stop"]').click();
  await expect.poll(() => page.evaluate(() => Boolean(__locator.routeLayer && __locator.map.hasLayer(__locator.routeLayer)))).toBe(false);await expect(page.locator(".drive-time")).toHaveCount(0);
  assert.equal(await page.evaluate(()=>__locator.state.activeId),2);assert.equal(await page.evaluate(()=>__locator.map.getZoom()),14);
  const stoppedRoutes=routeCount;await page.locator('[data-kind="dealership"]').click();await page.setViewportSize({width:1100,height:800});assert.equal(routeCount,stoppedRoutes);
  await page.locator('[data-kind="ALL"]').click();
  await page.evaluate(()=>{__geo.delay=true;__locator.requestUserLocation();__locator.stopSharingLocation();__geo.pending[0]({coords:{latitude:48.85,longitude:2.35}});});
  assert.equal(await page.evaluate(()=>__locator.state.userLocation),null);assert.equal(routeCount,stoppedRoutes);
  await page.evaluate(()=>{__geo.delay=false;__geo.denied=true;__locator.requestUserLocation();});assert.equal(await page.evaluate(()=>__locator.state.sharing),false);
  await page.evaluate(()=>{__geo.denied=false;__locator.requestUserLocation();});await expect.poll(() => page.evaluate(() => Boolean(__locator.routeLayer && __locator.map.hasLayer(__locator.routeLayer)))).toBe(true);
  routeDelay=650;
  await page.locator('.location-card[data-id="2"]').click();await page.locator('.location-card[data-id="3"]').click();
  await page.waitForTimeout(850);assert.equal(await page.evaluate(()=>__locator.state.activeId),3);assert.equal(await page.evaluate(()=>__locator.state.routeDest.id),3);
  await page.evaluate(()=>__locator.stopSharingLocation());
  console.log("PASS locator: no-consent search, denial, stop-sharing, late GPS, filters, and out-of-order routes");
  const context2=await browser.newContext({viewport:{width:390,height:844},serviceWorkers:"block"});await prepare(context2);const device2=await context2.newPage();await device2.clock.install();await ready(device2);
  const managerContext=await browser.newContext();await prepare(managerContext);const manager=await managerContext.newPage(),otherManager=await managerContext.newPage();
  for(const p of [manager,otherManager]){await p.clock.install();p.on("dialog",dialog=>dialog.accept());p.on("pageerror",e=>errors.push(e.message));await p.goto(managerOrigin+"/");await expect(p.locator("#fields")).toBeEnabled();}
  await manager.locator("#list-search").fill("Accomac");await manager.locator("#locations button",{hasText:"Edit"}).first().click();
  await manager.locator("#phone").fill("3016398001");await manager.locator("#save").click();
  await expect(manager.locator("#status")).toContainText("Publishing");assert.equal(savedRows.find(r=>r.id===2).phone,"3016398001");assert.notEqual(publicRows.find(r=>r.id===2).phone,"3016398001");
  await pollLive(manager);
  await device2.evaluate(()=>window.dispatchEvent(new Event("focus")));
  await expect(device2.locator('.location-card[data-id="2"] .card-phone')).toHaveText("(301) 639-8001");
  await device2.locator("#sheet-handle").click(); await device2.clock.runFor(350);
  await device2.locator('.location-card[data-id="2"]').click();
  await manager.locator("#locations .remove").first().click();await manager.locator("#save").click();await expect(manager.locator("#status")).toContainText("Publishing");
  await manager.clock.fastForward(11000);await expect(manager.locator("#status")).toContainText("Live —");
  await device2.evaluate(()=>window.dispatchEvent(new Event("focus")));await expect(device2.locator('.location-card[data-id="2"]')).toHaveCount(0);assert.equal(await device2.evaluate(()=>__locator.state.activeId),null);
  console.log("PASS manager to second device: direct form save, publication verification, and deletion of selected record");
  await otherManager.locator("#list-search").fill("Accomac");await otherManager.locator("#locations button",{hasText:"Edit"}).first().click();await otherManager.locator("#phone").fill("3016398002");await otherManager.locator("#save").click();
  await expect(otherManager.locator("#conflicts")).toBeVisible();assert.ok(!savedRows.some(r=>r.id===2));
  await otherManager.locator("#list-search").fill("");
  await expect(otherManager.locator("#locations button").first()).toBeDisabled();
  await otherManager.locator('input[value="published"]').check();await otherManager.locator("#resolve").click();assert.ok(!savedRows.some(r=>r.id===2));
  await manager.locator("#list-search").fill("Vision Specialists");await manager.locator("#locations button",{hasText:"Edit"}).first().click();await manager.locator("#address").fill("200 Main St");
  const before=putCount;await manager.locator("#save").click();await expect(manager.locator("#status")).toContainText("Confirm a new pin");assert.equal(putCount,before);
  await manager.reload();await expect(manager.locator("#address")).toHaveValue("200 Main St");await expect(manager.locator("#status")).toContainText("restored");
  console.log("PASS manager: stale-session conflict choices, coordinate invalidation, and draft restoration");
  await context2.setOffline(true);await device2.evaluate(()=>__locator.refreshDirectory());await expect(device2.locator("#directory-status")).toContainText("saved directory");
  await context2.setOffline(false);await device2.evaluate(()=>window.dispatchEvent(new Event("online")));await expect(device2.locator("#directory-status")).toBeHidden();
  const count=publicRows.length;publicRows=publicRows.filter(r=>r.id!==3);await device2.clock.fastForward(61000);await expect(device2.locator(".location-card")).toHaveCount(count-1);
  console.log("PASS directory: offline fallback, reconnection, and 60-second refresh");
  await page.screenshot({path:"artifacts/locator-desktop.png"});await device2.screenshot({path:"artifacts/locator-mobile.png"});await manager.screenshot({path:"artifacts/manager.png",fullPage:true});
  publicRows=[];await device2.evaluate(()=>__locator.refreshDirectory());await expect(device2.locator(".location-card")).toHaveCount(0);
  assert.equal(await device2.evaluate(()=>__locator.state.activeId),null);
  await context2.setOffline(true);await device2.evaluate(()=>__locator.refreshDirectory());await expect(device2.locator(".location-card")).toHaveCount(0);
  console.log("PASS directory: empty published directory stays empty offline");
  }
  publicRows=structuredClone(fixture);legacyWorker=true;
  const swContext=await browser.newContext({serviceWorkers:"allow"});await prepare(swContext);const swPage=await swContext.newPage();
  swPage.on("pageerror",e=>errors.push(e.message));await swPage.goto(locatorOrigin+"/worker-test.html");
  await swPage.evaluate(async()=>{const r=await navigator.serviceWorker.register('/harleydavidson/sw.js');const w=r.installing||r.waiting||r.active;if(w.state!=='activated')await new Promise(resolve=>w.addEventListener('statechange',()=>{if(w.state==='activated')resolve();}));});
  await swPage.goto(locatorOrigin+"/harleydavidson/");await expect(swPage.locator('h1')).toHaveText('Old cached locator');
  legacyWorker=false;await swPage.evaluate(async()=>{const r=await navigator.serviceWorker.getRegistration();await r.update();});
  await expect(swPage.locator('.location-card')).toHaveCount(fixture.length);
  const cacheKeys=await swPage.evaluate(()=>caches.keys());assert.ok(cacheKeys.includes('worldcup-unrelated'));assert.ok(!cacheKeys.includes('hd-eyewear-shell-v4'));
  publicRows=publicRows.filter(r=>r.id!==1);await swPage.evaluate(()=>__locator.refreshDirectory());await expect(swPage.locator('.location-card[data-id="1"]')).toHaveCount(0);
  networkUnavailable=true;await swContext.setOffline(true);await swPage.reload();await expect(swPage.locator('.location-card')).toHaveCount(publicRows.length);
  await expect(swPage.locator('#directory-status')).toContainText('saved directory');
  console.log("PASS real service worker: old cached page migrates, directory bypasses cache, unrelated cache survives, offline reload works");
  assert.deepEqual(errors,[]);console.log("All browser scenarios passed without uncaught page errors.");
}catch(error){console.error(error);if(browser){for(const context of browser.contexts())for(const page of context.pages())await page.screenshot({path:`artifacts/failure-${Date.now()}.png`,fullPage:true}).catch(()=>{});}process.exitCode=1;}
finally{await browser?.close();await Promise.all([new Promise(r=>server.close(r)),new Promise(r=>managerServer.close(r))]);}
