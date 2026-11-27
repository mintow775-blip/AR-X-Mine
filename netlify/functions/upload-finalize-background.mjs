// Background function (returns 202 immediately). Progress/result is written to /uploads/{uid}/{uploadId} in Firebase.
import {getStore} from '@netlify/blobs';
import {randomBytes} from 'node:crypto';
import {db,authUser,ownsProject,safeId,safeName,checkFile,sha256,b2Put,b2Delete,HttpError,MAX_CHUNKS} from './_lib.mjs';
export default async req=>{
 let u,id,b;try{u=await authUser(req,{dev:true});b=await req.json();id=String(b.uploadId||'')}catch(e){return new Response('',{status:202})}
 const st=(o)=>db().ref(`uploads/${u.uid}/${id}`).set({...o,at:Date.now()}),store=getStore('upload-chunks'),n=Number(b.chunks);
 try{
  if(!/^[a-f0-9-]{16,40}$/.test(id)||!safeId(b.projectId)||!safeId(b.versionId)||!Number.isInteger(n)||n<1||n>MAX_CHUNKS)throw new HttpError(400,'Bad request');
  await st({state:'processing'});
  if(!(await ownsProject(u,b.projectId)))throw new HttpError(403,'Not your project');
  const ver=(await db().ref(`projectVersions/${b.projectId}/${b.versionId}`).get()).val();if(!ver)throw new HttpError(404,'Create the version first');
  const parts=[];for(let i=0;i<n;i++){const c=await store.get(`${u.uid}/${id}/${i}`,{type:'arrayBuffer'});if(!c)throw new HttpError(400,'Missing chunk '+i);parts.push(Buffer.from(c))}
  const buf=Buffer.concat(parts),name=safeName(b.filename);checkFile(name,buf);
  const fid=randomBytes(12).toString('hex'),key=`projects/${b.projectId}/${b.versionId}/${fid}/${name}`,fref=db().ref(`projectFiles/${b.projectId}/${b.versionId}`);
  // same file name uploaded again for this version: replace the old one
  const olds=(await fref.get()).val()||{};for(const [k,m] of Object.entries(olds))if(m&&m.name===name){if(m.key)await b2Delete(m.key).catch(()=>{});await fref.child(k).remove()}
  await b2Put(key,buf);
  await fref.child(fid).set({key,name,size:buf.length,sha256:sha256(buf),uploadedBy:u.uid,uploadedAt:Date.now()});
  await st({state:'done',assetKey:fid,name,size:buf.length});
 }catch(e){await st({state:'error',message:e instanceof HttpError?e.message:'Upload failed'}).catch(()=>{});if(!(e instanceof HttpError))console.error(e)}
 finally{for(let i=0;i<MAX_CHUNKS;i++)await store.delete(`${u.uid}/${id}/${i}`).catch(()=>{})}
 return new Response('',{status:202})};
