import {db,json,handle,authUser,safeId,b2Url,HttpError} from './_lib.mjs';
// GET /api/download?p=<projectId>&v=<versionId>&a=<fileId>  (Bearer Firebase token) -> {url,name}. The url is a private 5-minute Backblaze link.
export default req=>handle(async()=>{
 const u=await authUser(req),q=new URL(req.url).searchParams,p=q.get('p'),v=q.get('v'),a=q.get('a');
 if(![p,v,a].every(safeId))throw new HttpError(400,'Bad request');
 const meta=(await db().ref(`projectFiles/${p}/${v}/${a}`).get()).val();if(!meta||!meta.key)throw new HttpError(404,'File not found');
 const pub=(await db().ref(`projectsPublic/${p}`).get()).exists(),owner=(await db().ref(`projects/${p}/ownerUid`).get()).val()===u.uid;
 if(!pub&&!owner&&u.role!=='admin')throw new HttpError(403,'Project is not published');
 const url=await b2Url(meta.key,meta.name);
 if(pub){db().ref(`projectsPublic/${p}/downloads`).transaction(n=>(n||0)+1).catch(()=>{});
  db().ref(`users/${u.uid}/downloads`).push({projectId:p,versionId:v,name:meta.name,at:Date.now()}).catch(()=>{})}
 return json({url,name:meta.name})});
