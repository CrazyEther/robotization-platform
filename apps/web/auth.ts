import {createClient,type SupabaseClient} from '@supabase/supabase-js';
import {api} from './utils';
type AuthConfiguration={configured:boolean;googleConfigured:boolean;supabaseUrl:string|null;anonKey:string|null};
let cached:Promise<{client:SupabaseClient|null;configuration:AuthConfiguration}>|undefined;
export function getAuth(){return cached??=api('/config').then(data=>{const configuration:AuthConfiguration=data.auth;return {configuration,client:configuration.configured&&configuration.supabaseUrl&&configuration.anonKey?createClient(configuration.supabaseUrl,configuration.anonKey,{auth:{flowType:'pkce'}}):null};}).catch(error=>{cached=undefined;throw error;});}
