import test from "node:test";
import assert from "node:assert/strict";
import { webcrypto } from "node:crypto";
import worker, { seal, unseal, gitBlobSha, REPOSITORY, DIRECTORY_PATH } from "../manager/src/worker.js";
if (!globalThis.crypto) globalThis.crypto = webcrypto;
const env = { PORTAL_ORIGIN: "https://manager.example", GITHUB_CLIENT_ID: "test-client", GITHUB_CLIENT_SECRET: "test-only", SESSION_SECRET: "a".repeat(64), ASSETS: { fetch: async () => new Response("portal") } };
const loc = { id:1, name:"Test shop", address:"100 Main St", city:"Ocean City", state:"MD", phone:"", hours:"",kind:"eyewear",lat:38.33,lng:-75.08 };
const sha = "b".repeat(40), nextSha = "c".repeat(40);
async function request(path, options = {}, overrides = {}) {
  const session = await seal({ token:"test-user-token", login:"manager", csrf:"csrf", expires:Date.now()+10000 }, env,"session");
  return worker.fetch(new Request(env.PORTAL_ORIGIN+path,{...options,headers:{Cookie:`__Host-marcolin_session=${session}`,Origin:env.PORTAL_ORIGIN,"X-CSRF-Token":"csrf","Content-Type":"application/json",...options.headers}}),{...env,...overrides});
}
function stub(t, handle) {
  const original = globalThis.fetch;
  globalThis.fetch = async (url, options = {}) => {
    if (String(url)===`https://api.github.com/repos/${REPOSITORY}`) return Response.json({full_name:REPOSITORY,permissions:{push:true}});
    return handle(String(url),options);
  };
  t.after(()=>{globalThis.fetch=original;});
}
test("session ciphertext is bound to its purpose and origin and expires",async()=>{
  const value = await seal({token:"private",expires:Date.now()+1000},env,"session");
  assert.ok(!value.includes("private")); assert.equal((await unseal(value,env,"session")).token,"private");
  assert.equal(await unseal(value,env,"login"),null);
  assert.equal(await unseal(value,{...env,PORTAL_ORIGIN:"https://attacker.example"},"session"),null);
  assert.equal(await unseal(value+"x",env,"session"),null);
  assert.equal(await unseal(await seal({expires:1},env,"session"),env,"session"),null);
});
test("unauthenticated and read-only GitHub accounts cannot edit",async(t)=>{
  const noSession=await worker.fetch(new Request(env.PORTAL_ORIGIN+"/api/locations"),env); assert.equal(noSession.status,401);
  const old=globalThis.fetch;globalThis.fetch=async()=>Response.json({full_name:REPOSITORY,permissions:{push:false}});t.after(()=>{globalThis.fetch=old;});
  assert.equal((await request("/api/locations")).status,403);
});
test("OAuth sign-in uses state and S256 PKCE; invalid callbacks never exchange a code",async()=>{
  const start=await worker.fetch(new Request(env.PORTAL_ORIGIN+"/auth/github"),env);
  const url=new URL(start.headers.get("Location"));assert.equal(url.searchParams.get("code_challenge_method"),"S256");assert.ok(url.searchParams.get("state"));
  const callback=await worker.fetch(new Request(env.PORTAL_ORIGIN+"/auth/callback?state=wrong&code=test"),env);assert.equal(callback.status,400);
});
test("a valid GitHub callback keeps credentials out of the page and session API",async(t)=>{
  const login = await seal({state:"login-state",verifier:"pkce-verifier",expires:Date.now()+60000},env,"login");
  let exchange;
  stub(t,(url,options)=>{
    if(url==="https://github.com/login/oauth/access_token") { exchange=JSON.parse(options.body);return Response.json({access_token:"private-github-token",expires_in:28800}); }
    if(url==="https://api.github.com/user")return Response.json({login:"actual-manager"});
    throw new Error("Unexpected upstream request");
  });
  const response=await worker.fetch(new Request(env.PORTAL_ORIGIN+"/auth/callback?state=login-state&code=one-time-code",{headers:{Cookie:`__Host-marcolin_login=${login}`}}),env);
  assert.equal(response.status,302);assert.equal(response.headers.get("Location"),env.PORTAL_ORIGIN+"/");
  assert.equal(exchange.code_verifier,"pkce-verifier");assert.equal(exchange.client_secret,env.GITHUB_CLIENT_SECRET);
  const cookies=response.headers.getSetCookie();const sessionCookie=cookies.find(c=>c.startsWith("__Host-marcolin_session="));
  assert.match(sessionCookie,/HttpOnly; Secure; SameSite=Lax/);assert.ok(!sessionCookie.includes("private-github-token"));
  const sessionResponse=await worker.fetch(new Request(env.PORTAL_ORIGIN+"/api/session",{headers:{Cookie:sessionCookie.split(';')[0]}}),env);
  const publicSession=await sessionResponse.json();assert.equal(publicSession.login,"actual-manager");assert.ok(publicSession.csrf);assert.equal(publicSession.token,undefined);
});
test("save forwards the draft's original SHA and only the fixed directory path",async(t)=>{
  let body, target;
  stub(t,(url,options)=>{target=url;body=JSON.parse(options.body);return Response.json({content:{sha:nextSha},commit:{sha:"d".repeat(40)}});});
  const response=await request("/api/locations",{method:"PUT",body:JSON.stringify({records:[loc],baseSha:sha,path:"portal/auth.json"})});
  assert.equal(response.status,200);assert.equal(body.sha,sha);assert.equal(body.branch,"main");assert.ok(target.endsWith(DIRECTORY_PATH));assert.equal(JSON.parse(Buffer.from(body.content,"base64").toString())[0].name,loc.name);
});
test("save rejects forged origins, missing CSRF tokens and invalid coordinates before writing",async(t)=>{
  let writes=0;stub(t,()=>{writes++;return Response.json({});});
  for(const headers of [{Origin:"https://evil.example"},{"X-CSRF-Token":"wrong"}])assert.equal((await request("/api/locations",{method:"PUT",headers,body:JSON.stringify({records:[loc],baseSha:sha})})).status,403);
  assert.equal((await request("/api/locations",{method:"PUT",body:JSON.stringify({records:[{...loc,lng:2.3}],baseSha:sha})})).status,422);
  assert.equal(writes,0);
});
test("a GitHub conflict is returned without a second blind write",async(t)=>{
  let writes=0;stub(t,()=>{writes++;return Response.json({message:"conflict"},{status:409});});
  assert.equal((await request("/api/locations",{method:"PUT",body:JSON.stringify({records:[loc],baseSha:sha})})).status,409);assert.equal(writes,1);
});
test("publication is live only when the actual public bytes match the saved blob",async(t)=>{
  const text=JSON.stringify([loc],null,2)+"\n", expected=await gitBlobSha(text);
  stub(t,url=>url.startsWith("https://joshuaxbrull.github.io/")?new Response(text):Response.json({sha,encoding:"base64",content:Buffer.from(text).toString("base64")}));
  assert.equal((await (await request(`/api/publication?sha=${expected}`)).json()).status,"live");
  assert.equal((await (await request(`/api/publication?sha=${sha}`)).json()).status,"publishing");
  assert.equal((await (await request(`/api/publication?sha=${nextSha}`)).json()).status,"superseded");
});
test("new manager deployment fails closed without secrets",async()=>{
  const response=await worker.fetch(new Request(env.PORTAL_ORIGIN+"/auth/github"),{...env,SESSION_SECRET:""});assert.equal(response.status,503);
});
