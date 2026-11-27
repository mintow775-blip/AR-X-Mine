import {db,auth,json,handle,adminEmails,HttpError} from './_lib.mjs';
// POST (no login). Makes sure the owner admin account exists and is admin: email = first ADMIN_EMAILS entry, password = ADMIN_PASSWORD env var.
// The password is never in the website code; callers cannot choose it. Called automatically by the login form when the admin email cannot sign in yet.
export default req=>handle(async()=>{
 if(req.method!=='POST')throw new HttpError(405,'POST only');
 const email=adminEmails()[0],pw=process.env.ADMIN_PASSWORD;
 if(!email||!pw||String(pw).length<6)throw new HttpError(500,'Server is not configured (ADMIN_PASSWORD missing)');
 const A=auth();let u;
 try{u=await A.getUserByEmail(email);await A.updateUser(u.uid,{password:pw,disabled:false,emailVerified:true})}
 catch(e){if(!e||e.code!=='auth/user-not-found')throw e;u=await A.createUser({email,password:pw,emailVerified:true,displayName:'Admin'})}
 const cur=(await db().ref('users/'+u.uid).get()).val()||{},o={};
 o[`users/${u.uid}/role`]='admin';o[`users/${u.uid}/email`]=email;o[`users/${u.uid}/suspended`]=false;
 if(!cur.username){let un='admin';const taken=(await db().ref('usernames/'+un).get()).val();if(taken&&taken!==u.uid)un='admin'+u.uid.slice(0,4).toLowerCase().replace(/[^a-z0-9]/g,'0');
  o[`users/${u.uid}/username`]=un;o[`users/${u.uid}/displayName`]='Admin';o[`users/${u.uid}/createdAt`]=Date.now();o[`usernames/${un}`]=u.uid;o[`publicProfiles/${u.uid}`]={username:un,displayName:'Admin'}}
 await db().ref().update(o);await A.setCustomUserClaims(u.uid,{role:'admin'});
 return json({ok:true})});
