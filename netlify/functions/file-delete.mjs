import {db,json,handle,authUser,ownsProject,safeId,b2Delete,HttpError} from './_lib.mjs';
export default req=>handle(async()=>{
 if(req.method!=='POST')throw new HttpError(405,'POST only');const u=await authUser(req,{dev:true});const b=await req.json().catch(()=>({}));
 if(![b.projectId,b.versionId,b.assetKey].every(safeId))throw new HttpError(400,'Bad request');
 if(!(await ownsProject(u,b.projectId)))throw new HttpError(403,'Not your project');
 const ref=db().ref(`projectFiles/${b.projectId}/${b.versionId}/${b.assetKey}`),m=(await ref.get()).val();if(!m)throw new HttpError(404,'File not found');
 if(m.key)await b2Delete(m.key);
 await ref.remove();return json({ok:true})});
