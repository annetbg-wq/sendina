import {oauthConfig,type MailApps,type Provider} from './mailproviders';
import {providerRequest} from './providerrequest';

/** Refreshes one provider access token through the same retry/error policy as the mail transport.
 * Kept separate so delivery reconciliation can authenticate without sending anything. */
export async function oauthAccessToken(provider:Provider,refreshToken:string,apps:MailApps){
 const config=oauthConfig(provider,apps);
 if(!config)throw Error('OAuth для этого провайдера не настроен платформой Sendina.');
 const response=await providerRequest(config.token,{method:'POST',
  headers:{'Content-Type':'application/x-www-form-urlencoded'},
  body:new URLSearchParams({grant_type:'refresh_token',refresh_token:refreshToken,
   client_id:config.clientId,client_secret:config.clientSecret})},{mode:'token'});
 const data=await response.json();
 if(!data?.access_token)throw Error('Провайдер не выдал access token для сверки отправки.');
 return String(data.access_token);
}
