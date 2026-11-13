import { reserveBatch, processOne } from '../worker/notifications';
async function main() {
  const batch = await reserveBatch();
  console.log('batch size', batch.length);
  for (const row of batch) await processOne(row);
  console.log('done');
}
main().then(()=>process.exit(0)).catch(e=>{console.error(e);process.exit(1);});
