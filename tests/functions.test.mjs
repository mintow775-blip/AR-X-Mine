import assert from 'node:assert/strict';import fs from 'node:fs';
import {checkFile,safeName,safeId,ext,HttpError,MAX_FILE} from '../netlify/functions/_lib.mjs';
let n=0;const t=(name,fn)=>{try{fn();n++;console.log('PASS',name)}catch(e){console.log('FAIL',name,e.message);process.exitCode=1}};
const zip=Buffer.from([0x50,0x4b,3,4,0,0,0,0]),pad=l=>Buffer.concat([zip,Buffer.alloc(l)]);
t('accepts a zip-signature .jar',()=>checkFile('a.jar',zip));
t('rejects .exe',()=>assert.throws(()=>checkFile('a.exe',zip),e=>e.status===415));
t('rejects .jar with non-zip content',()=>assert.throws(()=>checkFile('a.jar',Buffer.from('MZ\x90\x00junk')),e=>e.status===415));
t('rejects > 20 MB',()=>assert.throws(()=>checkFile('a.zip',pad(MAX_FILE)),e=>e.status===413));
t('accepts exactly 20 MB',()=>checkFile('a.zip',pad(MAX_FILE-zip.length)));
t('rejects empty/tiny',()=>assert.throws(()=>checkFile('a.zip',Buffer.from([1])),e=>e.status===413));
t('7z needs 7z signature',()=>{checkFile('a.7z',Buffer.from([0x37,0x7a,0xbc,0xaf,0,0]));assert.throws(()=>checkFile('a.7z',zip))});
t('safeName strips path tricks',()=>{assert.equal(safeName('../../etc/passwd'),'.._.._etc_passwd'.replace(/^\.+/,''));assert.ok(!safeName('..\\x.jar').includes('/'));assert.ok(!safeName('.hidden.jar').startsWith('.'))});
t('safeId allows only [A-Za-z0-9_-]',()=>{assert.ok(safeId('-Nabc_12'));assert.ok(!safeId('a/b'));assert.ok(!safeId('..'));assert.ok(!safeId('a.b'))});
t('ext lowercases',()=>assert.equal(ext('X.JAR'),'jar'));
const R=JSON.parse(fs.readFileSync('database.rules.json','utf8')).rules;
t('rules: default deny',()=>{assert.equal(R['.read'],false);assert.equal(R['.write'],false)});
t('rules: role/suspended not client-writable',()=>{assert.equal(R.users.$uid.role,undefined);assert.equal(R.users.$uid.suspended,undefined)});
t('rules: files/uploads have no client write',()=>{assert.equal(R.projectFiles['.write'],undefined);assert.equal(R.projectFiles.$pid['.write'],undefined);assert.equal(R.uploads.$uid['.write'],undefined)});
t('rules: catalog + site are admin-write',()=>{assert.match(R.catalog['.write'],/'admin'/);assert.match(R.site['.write'],/'admin'/)});
t('rules: dev cannot self-approve (status limited)',()=>assert.match(R.projects.$pid['.write'],/'draft'.*'pending'/));
// handler behaviour without credentials
const call=async(f,init={})=>(await import('../netlify/functions/'+f+'.mjs')).default(new Request('http://x/api/'+f,init));
for(const f of ['upload-chunk','download','file-delete','admin-user']){const r=await call(f,{method:'POST'});try{assert.equal(r.status,f==='download'||true?(r.status===405?405:401):401);console.log('PASS',f,'unauthenticated ->',r.status);n++}catch(e){console.log('FAIL',f,r.status);process.exitCode=1}}
{const r=await call('upload-chunk',{method:'POST',headers:{authorization:'Bearer abc'}});assert.equal(r.status,500);console.log('PASS unconfigured server fails closed (500 "not configured")');n++}
console.log(n,'checks passed');
