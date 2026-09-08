import {test} from 'node:test';
import assert from 'node:assert/strict';
import {resolveMailApps,appOwner,type PlatformSettings} from '../server/platform';

const platform=(google=true,microsoft=true):PlatformSettings=>({
 google:google?{clientId:'platform-google',clientSecret:'platform-google-secret'}:{clientId:'',clientSecret:''},
 microsoft:microsoft?{clientId:'platform-ms',clientSecret:'platform-ms-secret',tenant:'tenant'}:{clientId:'',clientSecret:'',tenant:''},
 openaiKey:'',openaiModel:'',aiGatewayUrl:'',searchProvider:'',searchKey:'',placesProvider:'',placesKey:''
});
const account={
 google:{clientId:'user-google',clientSecret:'user-google-secret'},
 microsoft:{clientId:'user-ms',clientSecret:'user-ms-secret',tenant:'user-tenant'}
};

test('mail OAuth uses Sendina platform applications and never falls back to user client credentials',()=>{
 const resolved=resolveMailApps(platform(),account);
 assert.equal(resolved.google.clientId,'platform-google');
 assert.equal(resolved.google.clientSecret,'platform-google-secret');
 assert.equal(resolved.microsoft.clientId,'platform-ms');
 assert.equal(resolved.microsoft.clientSecret,'platform-ms-secret');
 assert.equal(resolved.microsoft.tenant,'tenant');
 assert.equal(appOwner(platform(),account,'google'),'platform');
 assert.equal(appOwner(platform(),account,'microsoft'),'platform');
});

test('missing platform OAuth is a platform blocker even when legacy account credentials exist',()=>{
 const resolved=resolveMailApps(platform(false,false),account);
 assert.equal(resolved.google.clientId,'');
 assert.equal(resolved.google.clientSecret,'');
 assert.equal(resolved.microsoft.clientId,'');
 assert.equal(resolved.microsoft.clientSecret,'');
 assert.equal(resolved.microsoft.tenant,'common');
 assert.equal(appOwner(platform(false,false),account,'google'),'none');
 assert.equal(appOwner(platform(false,false),account,'microsoft'),'none');
});
