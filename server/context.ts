/** Who a request acts as. Every operation reads and writes only this account's workspace. */
export type Ctx={accountId:string;email:string;role:'user'|'superadmin'};
