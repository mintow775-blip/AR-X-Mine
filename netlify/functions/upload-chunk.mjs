import {getStore} from '@netlify/blobs';
import {handle,json,authUser,HttpError,MAX_CHUNK,MAX_CHUNKS} from './_lib.mjs';
export default req=>handle(async()=>{
 if(req.method!=='POST')throw new HttpError(405,'POST only');
 const u=await authUser(req,{dev:true,verified:true});
 const id=req.headers.get('x-upload-id')||'',i=Number(req.headers.get('x-chunk-index'));
 if(!/^[a-f0-9-]{16,40}$/.test(id)||!Number.isInteger(i)||i<0||i>=MAX_CHUNKS)throw new HttpError(400,'Bad upload headers');
 const buf=await req.arrayBuffer();if(!buf.byteLength||buf.byteLength>MAX_CHUNK)throw new HttpError(413,'Chunk too large');
 await getStore('upload-chunks').set(`${u.uid}/${id}/${i}`,buf);return json({ok:true})});
