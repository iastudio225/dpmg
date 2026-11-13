import { createBackup } from '../services/database-admin.service';
async function main(){ const r = await createBackup(); console.log(JSON.stringify(r)); }
main().then(()=>process.exit(0)).catch(e=>{console.error(e);process.exit(1);});
