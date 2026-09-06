import {accountSettings} from './accountsettings';
import {platformSettings} from './platform';

/** Sendina supplies the infrastructure; an account may override it, but never has to.
    This is why an ordinary person is not asked for a model or search key at all. */
export type Infrastructure={
 openaiKey:string;openaiModel:string;aiGatewayUrl:string;
 searchProvider:string;searchKey:string;
 placesProvider:string;placesKey:string;
 /** Which side supplied each capability, so the interface can say who to ask. */
 source:{model:'account'|'platform'|'none';search:'account'|'platform'|'none';organisations:'platform'|'none'};
};

const pick=(own:string,shared:string)=>own?.trim()?own:shared;
const from=(own:string,shared:string)=>own?.trim()?'account' as const:shared?.trim()?'platform' as const:'none' as const;

export async function infrastructure(accountId:string):Promise<Infrastructure>{
 const [account,platform]=await Promise.all([accountSettings(accountId),platformSettings()]);
 const searchProvider=pick(account.searchProvider,platform.searchProvider);
 const searchKey=pick(account.searchKey,platform.searchKey);
 return {
  openaiKey:pick(account.openaiKey,platform.openaiKey),
  openaiModel:pick(account.openaiModel,platform.openaiModel),
  aiGatewayUrl:pick(account.aiGatewayUrl,platform.aiGatewayUrl),
  searchProvider,searchKey,
  // Structured organisation search is platform infrastructure only; it has no per-account form.
  placesProvider:platform.placesProvider,placesKey:platform.placesKey,
  source:{
   model:from(account.openaiKey,platform.openaiKey),
   search:searchProvider&&searchKey?from(account.searchKey,platform.searchKey):'none',
   organisations:platform.placesProvider&&platform.placesKey?'platform':'none'
  }
 };
}
