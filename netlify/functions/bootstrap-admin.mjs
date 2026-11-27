import {db,auth,json,handle,authUser,HttpError} from './_lib.mjs';
// POST (Bearer token). If the caller's VERIFIED email is in ADMIN_EMAILS (default: atarafatyt1@gmail.com), persist role=admin in the database and as a custom claim. Idempotent.
export default req=>handle(async()=>{
 if(req.method!=='POST')throw new HttpError(405,'POST only');
 const u=await authUser(req);
 if(u.role!=='admin')return json({admin:false});
 const ref=db().ref('users/'+u.uid);
 if((await ref.child('role').get()).val()!=='admin'){await ref.child('role').set('admin');await auth().setCustomUserClaims(u.uid,{role:'admin'})}
 return json({admin:true})});
